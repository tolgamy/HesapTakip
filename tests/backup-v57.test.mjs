import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { backupConfiguration, backupPrivateR2V57, backupAdminRoute, decryptBackup,
  exportLogicalD1 } from '../src/backup-v57.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

class MockDB {
  constructor(tables) { this.tables=tables;this.runs=[];this.reads=0; }
  prepare(sql) {
    const self=this;
    let args=[];
    return {
      bind(...values){args=values;return this;},
      async first(){
        if(sql.includes("SELECT id FROM backup_runs WHERE state='success'"))
          return self.runs.find(r=>r.state==='success'&&r.object_key===args[0])||null;
        if(sql.includes('SELECT object_key FROM backup_runs'))
          return self.runs.filter(r=>r.state==='success'&&r.object_key.startsWith(String(args[0]||'').replace(/%$/,''))).at(-1)||null;
        const matched=sql.match(/^SELECT COUNT\(\*\) AS n FROM "([A-Za-z_][A-Za-z_0-9]*)"$/);
        if(matched)return {n:self.tables[matched[1]].length};
        throw Error('Unexpected SQL first: '+sql);
      },
      async all(){
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
  await assert.rejects(backupPrivateR2V57(env,now),/sınırı/i);
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
