import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localBackupManifest,localBackupTable,localBackupRoute,LOCAL_BACKUP_TABLES,LOCAL_BACKUP_FORMAT } from '../src/local-backup-v59.js';

class FakeDB {
  constructor(){
    this.rows={
      cards:[{id:'card-1',last4:'1234'}],
      cash_accounts:[{id:'cash-1',name:'Kasa'}],
      utility_bills:[{id:'bill-1',amount_kurus:4000}],
      vault_credentials:[{id:'vault-1',password:'SENSITIVE'}],
      pin_credentials:[{account_key:'admin',pin_hash:'SECRET'}],
      google_drive_backup_auth:[{id:'primary',encrypted_refresh:'OAUTH'}]
    };
  }
  prepare(sql){
    const db=this; let args=[];
    return {
      bind(...values){args=values;return this;},
      async first(){
        if(sql.includes('sqlite_master')&&sql.includes('name=?'))
          return db.rows[args[0]]?{name:args[0]}:null;
        throw Error('Unexpected first '+sql);
      },
      async all(){
        if(sql.includes('sqlite_master'))
          return {results:Object.keys(db.rows).sort().map(name=>({name,sql:'CREATE TABLE '+name+' (id TEXT)'}))};
        const table=sql.match(/^SELECT \* FROM "([A-Za-z_]+)" LIMIT \?$/)?.[1];
        if(table)return {results:db.rows[table].slice(0,args[0])};
        throw Error('Unexpected all '+sql);
      }
    };
  }
}

test('local manifest includes finance but excludes passwords, logins, PIN, Google OAuth and secrets',async()=>{
  const env={DB:new FakeDB(),BACKUP_BUCKET:{put(){throw Error('should not use R2');}}};
  const manifest=await localBackupManifest(env);
  assert.equal(manifest.format,LOCAL_BACKUP_FORMAT);
  assert.deepEqual(manifest.tables.map(t=>t.name),['cards','cash_accounts','utility_bills']);
  assert.ok(!LOCAL_BACKUP_TABLES.includes('vault_credentials'));
  assert.ok(!LOCAL_BACKUP_TABLES.includes('pin_credentials'));
  assert.ok(!LOCAL_BACKUP_TABLES.includes('app_members'));
  assert.ok(!LOCAL_BACKUP_TABLES.includes('google_drive_backup_auth'));
});

test('local table export is read-only and does not send data to any cloud service',async()=>{
  const db=new FakeDB(),env={DB:db};
  const before=structuredClone(db.rows);
  const result=await localBackupRoute(env,'/api/backups/local/table/cards','GET');
  assert.deepEqual(result.rows,[{id:'card-1',last4:'1234'}]);
  assert.deepEqual(db.rows,before);
  const bills=await localBackupTable(env,'utility_bills');
  assert.equal(bills.rows[0].amount_kurus,4000);
});

test('unknown and sensitive tables and mutation methods are rejected',async()=>{
  const env={DB:new FakeDB()};
  await assert.rejects(localBackupRoute(env,'/api/backups/local/table/vault_credentials','GET'),{status:404});
  await assert.rejects(localBackupRoute(env,'/api/backups/local/table/app_members','GET'),{status:404});
  await assert.rejects(localBackupRoute(env,'/api/backups/local/table/cards','POST'),{status:405});
  await assert.rejects(localBackupRoute(env,'/api/backups/local/manifest','PATCH'),{status:405});
  await assert.rejects(localBackupRoute(env,'/api/backups/local/table/does_not_exist','GET'),{status:404});
});

test('oversized table fails closed instead of writing a partial backup',async()=>{
  const db=new FakeDB();db.rows.cards=Array.from({length:20001},(_,i)=>({id:String(i)}));
  await assert.rejects(localBackupTable({DB:db},'cards'),{status:413});
});

test('live routes require admin + PIN, no scheduled Google or R2 backup',()=>{
  const server=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/local-backup-v59.js',import.meta.url),'utf8');
  assert.match(server,/await assertPinUnlocked\(request,env,principal\);[\s\S]*if\(path\.startsWith\('\/api\/backups\/local\/'\)\)/);
  assert.match(server,/if\(principal\.role!=='admin'\)throw new ApiError\(403,'Yerel yedekleme/);
  assert.doesNotMatch(server,/backupPrivateR2\(env/);
  assert.doesNotMatch(server,/syncGoogleDrive\(env/);
  assert.match(server,/R2 bulut yedekleme kapatıldı/);
  assert.match(html,/id="backupLocalPass"/);
  assert.match(html,/id="backupLocalVerifyFile"/);
  assert.match(html,/local-backup-v59\.js/);
  assert.doesNotMatch(html,/id="backupV58Connect"/);
  assert.doesNotMatch(html,/id="backupV57Run"/);
  assert.match(ui,/PBKDF2/);
  assert.match(ui,/AES-GCM/);
  assert.match(ui,/crypto\.subtle\.decrypt/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|googleapis|BACKUP_BUCKET/);
});
