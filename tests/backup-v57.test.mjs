import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { backupConfiguration, backupPrivateR2V57, backupAdminRoute, decryptBackup,
  exportLogicalD1 } from '../src/backup-v57.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

class MockDB {
  constructor(tables) { this.tables=tables;this.runs=[];this.reads=0;this.scalarReads=0; }
  async batch(statements){this.batchCalls=(this.batchCalls||0)+1;return Promise.all(statements.map(s=>s.all()));}
  prepare(sql) {
    const self=this;
    let args=[];
    return {
      bind(...values){args=values;return this;},
      async first(){
        if(sql.startsWith('SELECT (SELECT COUNT(*) FROM ')){
          const keys=[...sql.matchAll(/\(SELECT COUNT\(\*\) FROM "([A-Za-z_][A-Za-z_0-9]*)"\) AS c(\d+)/g)];
          if(keys.length===0)throw Error('Unexpected scalar count');
          return Object.fromEntries(keys.map(x=>['c'+x[2],self.tables[x[1]].length]));
        }
        if(sql.includes("SELECT id FROM backup_runs WHERE state='success'"))
          return self.runs.find(r=>r.state==='success'&&r.object_key===args[0])||null;
        if(sql.includes('SELECT object_key FROM backup_runs'))
          return self.runs.filter(r=>r.state==='success'&&r.object_key.startsWith(String(args[0]||'').replace(/%$/,''))).at(-1)||null;
        const matched=sql.match(/^SELECT COUNT\(\*\) AS n FROM "([A-Za-z_][A-Za-z_0-9]*)"$/);
        if(matched){self.scalarReads++;return {n:self.tables[matched[1]].length};}
        throw Error('Unexpected SQL first: '+sql);
      },
      async all(){
        const counted=sql.match(/^SELECT COUNT\(\*\) AS n FROM "([A-Za-z_][A-Za-z_0-9]*)"$/);
        if(counted)return {results:[{n:self.tables[counted[1]].length}]};
        if(sql.includes('FROM sqlite_master')){
          return {results:Object.keys(self.tables).sort()
            .map(name=>({name,sql:'CREATE TABLE '+name+' (id TEXT PRIMARY KEY)'}))};
        }
        if(sql.includes('FROM backup_runs ORDER BY')){
          return {results:self.runs.slice().reverse()};
        }
        const matched=sql.match(/^SELECT \* FROM "([A-Za-z_][A-Za-z_0-9]*)" ORDER BY rowid LIMIT \? OFFSET \?$/);
        if(matched){
          self.reads++;
          return {results:self.tables[matched[1]].slice(args[1],args[1]+args[0])};
        }
        throw Error('Unexpected SQL all: '+sql);
      },
      async run(){
        if(sql.startsWith('INSERT INTO backup_runs')){
          self.runs.push({id:args[0],state:args[1],object_key:args[2],detail:args[3],
            created_at:'2026-11-20'});
          return {meta:{changes:1}};
        }
        throw Error('Unexpected write: '+sql);
      }
    };
  }
}
class MockR2 {
  constructor(){this.objects=new Map();this.puts=0;this.deleted=[];}
  async put(key,value) {this.objects.set(key,value);this.puts++;return {};}
  async get(key) {
    if(!this.objects.has(key))return null;
    return {text:async()=>this.objects.get(key)};
  }
  async list({prefix}) {
    return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix))
      .map(key=>({key})),truncated:false};
  }
  async delete(key) {this.deleted.push(key);this.objects.delete(key);}
}
function makeEnv(tables={cards:[{id:'secret-card',last4:'1234'}],
  cash_entries:[{id:'entry-1',amount_kurus:50000}],
  biometric_credentials:[{id:'device-key-1',account_key:'admin'}],
  vault_credentials:[{id:'sensitive-secret',password:'private'}]}) {
  return {DB:new MockDB(structuredClone(tables)),BACKUP_BUCKET:new MockR2(),
    BACKUP_ENCRYPTION_KEY:'a'.repeat(64)};
}
const now=new Date('2026-11-20T07:00:00Z');
test('without private bucket or valid encryption secret backup cannot run or write plaintext',async()=>{
  const env=makeEnv();delete env.BACKUP_BUCKET;
  assert.equal(backupConfiguration(env).enabled,false);
  assert.equal((await backupPrivateR2V57(env,now)).status,'disabled');
  assert.equal(env.DB.runs.length,0);
  env.BACKUP_BUCKET=new MockR2();
  delete env.BACKUP_ENCRYPTION_KEY;
  assert.equal((await backupPrivateR2V57(env,now)).status,'disabled');
  assert.equal(env.BACKUP_BUCKET.puts,0);
});
test('encrypted R2 daily backup covers dynamically discovered D1 tables and verifies its own upload',async()=>{
  const env=makeEnv();
  const result=await backupPrivateR2V57(env,now);
  assert.equal(result.status,'success');
  assert.equal(result.table_count,4);
  assert.equal(env.DB.runs.at(-1).state,'success');
  const ciphertext=env.BACKUP_BUCKET.objects.get(result.key);
  assert.ok(ciphertext);
  assert.doesNotMatch(ciphertext,/secret-card|private|entry-1|biometric_credentials|cash_entries/);
  const decrypted=await decryptBackup(env,ciphertext);
  assert.deepEqual(decrypted.tables.cards.rows,[{id:'secret-card',last4:'1234'}]);
  assert.deepEqual(decrypted.tables.vault_credentials.rows,[{id:'sensitive-secret',password:'private'}]);
  assert.equal((await backupPrivateR2V57(env,now)).status,'already_done');
  assert.equal(env.BACKUP_BUCKET.puts,1);
  const status=await backupAdminRoute(env,'/api/backups/status','GET');
  assert.equal(status.configured,true);
  assert.equal(status.runs.length,1);
  const preview=await backupAdminRoute(env,'/api/backups/preview','GET');
  assert.equal(preview.verified,true);
  assert.equal(preview.tables.cards,1);
  assert.equal(preview.tables.vault_credentials,1);
});
test('tampered ciphertext is rejected; preview never modifies live financial data',async()=>{
  const env=makeEnv(),before=structuredClone(env.DB.tables);
  const {key}=await backupPrivateR2V57(env,now);
  const encoded=JSON.parse(env.BACKUP_BUCKET.objects.get(key));
  const old=encoded.ciphertext;
  encoded.ciphertext=(old[0]==='A'?'B':'A')+old.slice(1);
  env.BACKUP_BUCKET.objects.set(key,JSON.stringify(encoded));
  await assert.rejects(backupAdminRoute(env,'/api/backups/preview','GET'));
  assert.deepEqual(env.DB.tables,before);
});
test('backup fails closed when a table exceeds safe limits, records a failure and uploads nothing',async()=>{
  const env=makeEnv({cards:Array.from({length:20001},(_,i)=>({id:String(i)}))});
  await assert.rejects(backupPrivateR2V57(env,now),/sınır/i);
  assert.equal(env.DB.runs.at(-1).state,'failed');
  assert.equal(env.BACKUP_BUCKET.objects.size,0);
});
test('retention only deletes dated encrypted files older than 30 days while keeping 7 newest',async()=>{
  const env=makeEnv();
  for(let i=50;i>0;i--){
    const d=new Date(now.getTime()-i*86400000).toISOString().slice(0,10);
    env.BACKUP_BUCKET.objects.set('hesaptakip/encrypted/daily/'+d+'.json','old');
  }
  env.BACKUP_BUCKET.objects.set('hesaptakip/legacy-unencrypted.json','legacy');
  await backupPrivateR2V57(env,now);
  assert.ok(env.BACKUP_BUCKET.deleted.length>0);
  assert.equal(env.BACKUP_BUCKET.objects.get('hesaptakip/legacy-unencrypted.json'),'legacy');
  assert.ok([...env.BACKUP_BUCKET.objects.keys()].some(x=>x.includes('2026-11-20')));
});
test('logical backup read is intentionally non-destructive',async()=>{
  const env=makeEnv(),before=structuredClone(env.DB.tables);
  const result=await exportLogicalD1(env,now);
  assert.ok(result.plaintext.includes('cash_entries'));
  assert.deepEqual(env.DB.tables,before);
});

test('legacy unencrypted backup record is never treated as a verified V57 file',async()=>{
  const env=makeEnv();
  env.DB.runs.push({id:'old',state:'success',object_key:'hesaptakip/2026-11-19.json',detail:'Legacy',created_at:'2026-11-19'});
  const preview=await backupAdminRoute(env,'/api/backups/preview','GET');
  assert.equal(preview.verified,false);
  assert.match(preview.reason,/V57/);
});

test('D1 Free: 70 tables are exported with batched queries well below 50 per invocation',async()=>{
  const tables=Object.fromEntries(Array.from({length:70},(_,i)=>['table_'+i,[{id:'row-'+i}]]));
  const env=makeEnv(tables);
  const result=await backupPrivateR2V57(env,now);
  assert.equal(result.table_count,70);
  assert.ok(env.DB.batchCalls<=32,'batched SQL subrequests stay within D1 Free limit');
  const archive=await decryptBackup(env,env.BACKUP_BUCKET.objects.get(result.key));
  assert.equal(Object.keys(archive.tables).length,70);
});

test('backup reports safe D1 count limit error without exposing financial records',async()=>{
  const env=makeEnv();
  const before=structuredClone(env.DB.tables);
  env.DB.batch=async()=>{throw new Error('D1_ERROR: Too many API requests by single Worker invocation');};
  await assert.rejects(backupPrivateR2V57(env,now),/D1_COUNT_LIMIT/);
  assert.equal(env.BACKUP_BUCKET.objects.size,0);
  assert.equal(env.DB.runs.at(-1).detail,'D1_COUNT_LIMIT');
  assert.deepEqual(env.DB.tables,before);
});
test('backup reports D1 rowid/page incompatibility without exposing SQL or data',async()=>{
  const env=makeEnv();
  const realBatch=env.DB.batch.bind(env.DB);
  let calls=0;
  env.DB.batch=async statements=>{
    calls++;
    if(calls===2)throw new Error('SQLITE_ERROR: no such column: rowid');
    return realBatch(statements);
  };
  await assert.rejects(backupPrivateR2V57(env,now),/D1_PAGE_ROWID/);
  assert.equal(env.DB.runs.at(-1).detail,'D1_PAGE_ROWID');
  assert.equal(env.BACKUP_BUCKET.objects.size,0);
});
test('backup exposes only fixed diagnostic codes when a D1 query fails unexpectedly',async()=>{
  const env=makeEnv();
  env.DB.batch=async()=>{throw new Error('Secret user data 1234 must not be shown');};
  await assert.rejects(backupPrivateR2V57(env,now),error=>{
    assert.match(error.message,/D1_COUNT_UNKNOWN/);
    assert.doesNotMatch(error.message,/Secret user data|1234/);
    return true;
  });
});

test('generic D1 count batch error falls back to bounded scalar counts and preserves all tables',async()=>{
  const env=makeEnv({cards:[{id:'keep-card'}],cash_entries:[{id:'keep-cash'}]});
  const originalBatch=env.DB.batch.bind(env.DB);
  let countBatchAttempts=0,scalarQueries=0;
  const originalPrepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{
    if(sql.startsWith('SELECT (SELECT COUNT(*) FROM '))scalarQueries++;
    return originalPrepare(sql);
  };
  env.DB.batch=async statements=>{
    if(statements[0]?.__count)throw Error('Unexpected marker');
    // In this fixture all count batches are composed of COUNT(*) statements.
    if(statements.some(st=>st.sql))throw Error('Unexpected exposed SQL');
    countBatchAttempts++;
    if(countBatchAttempts===1||countBatchAttempts===3)
      throw Error('D1_ERROR: error occurred during batch read');
    return originalBatch(statements);
  };
  const result=await backupPrivateR2V57(env,now);
  assert.equal(result.status,'success');
  assert.ok(env.DB.scalarReads>=1,'individual read-only count fallback is used');
  const decrypted=await decryptBackup(env,env.BACKUP_BUCKET.objects.get(result.key));
  assert.deepEqual(decrypted.tables.cards.rows,[{id:'keep-card'}]);
  assert.deepEqual(decrypted.tables.cash_entries.rows,[{id:'keep-cash'}]);
});

test('failing individual D1 COUNT identifies table index and never exports a partial archive',async()=>{
  const env=makeEnv({cards:[{id:'safe-card'}],cash_entries:[{id:'safe-entry'}]});
  const originalBatch=env.DB.batch.bind(env.DB);
  const originalPrepare=env.DB.prepare.bind(env.DB);
  env.DB.batch=async()=>{
    throw new Error('D1_ERROR: group count failed');
  };
  env.DB.prepare=sql=>{
    if(sql.startsWith('SELECT COUNT(*) AS n FROM "cash_entries"')){
      return {
        async first(){throw Error('D1_ERROR: unexpected schema problem, secret 98765');}
      };
    }
    return originalPrepare(sql);
  };
  await assert.rejects(backupPrivateR2V57(env,now),err=>{
    assert.match(err.message,/D1_COUNT_DATABASE_TABLE_2/);
    assert.doesNotMatch(err.message,/98765|secret|safe-entry/);
    return true;
  });
  assert.equal(env.BACKUP_BUCKET.objects.size,0);
  assert.equal(env.DB.runs.at(-1).state,'failed');
  assert.equal(env.DB.runs.at(-1).detail,'D1_COUNT_DATABASE_TABLE_2');
});
test('bounded COUNT groups retry read-only singles only when their batch fails',async()=>{
  const tables=Object.fromEntries(Array.from({length:24},(_,i)=>['table_'+i,[{id:'row-'+i}]]));
  const env=makeEnv(tables);
  const normalBatch=env.DB.batch.bind(env.DB);
  let n=0;
  env.DB.batch=async statements=>{
    if(++n===1)throw Error('D1_ERROR: batch query failed');
    return normalBatch(statements);
  };
  const result=await backupPrivateR2V57(env,now);
  assert.equal(result.status,'success');
  assert.equal(result.table_count,24);
  assert.equal(env.DB.scalarReads,6);
  const decrypted=await decryptBackup(env,env.BACKUP_BUCKET.objects.get(result.key));
  assert.equal(Object.keys(decrypted.tables).length,24);
});
