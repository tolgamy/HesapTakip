import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {vaultRoute} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin={role:'admin',username:'admin',permissions:['vault']};
const reader={role:'tenant',permissions:['vault']};
const noAccess={role:'user',permissions:['people']};
const request=data=>new Request('https://example.test/api/vault/import-batch',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
});
const entry=(name,user='root',password='temporary-test-secret')=>({
 category:'platform',institution_name:name,login_name:user,login_url:'https://example.test/admin/',
 password,notes:'1. DOMAIN VE HOSTING\n2. SİTE ALTYAPISI\nÜrün ve entegrasyon detayları.'
});
function fakeDB(){
 const records=new Map(),fields=new Map();
 const prepare=sql=>{
  let args=[];
  return {
   bind(...values){args=values;return this;},
   async all(){
    if(sql==='SELECT institution_name FROM vault_credentials')
     return {results:[...records.values()].map(r=>({institution_name:r.institution_name}))};
    if(sql.includes('FROM vault_custom_fields'))return {results:[...fields.values()]};
    if(sql.includes('FROM vault_credentials'))return {results:[...records.values()]};
    throw new Error('Unexpected SELECT: '+sql);
   },
   async first(){
    if(sql.includes('vault_credentials'))return records.get(args[0])||null;
    return null;
   },
   async run(){
    if(sql.startsWith('INSERT INTO vault_credentials')){
     const [id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv]=args;
     records.set(id,{id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv});
    }else if(sql.startsWith('INSERT INTO vault_custom_fields')){
     const [id,vault_id,label,kind,secret_cipher,secret_iv,sort_order]=args;
     fields.set(id,{id,vault_id,label,kind,secret_cipher,secret_iv,sort_order});
    }else throw new Error('Unexpected write: '+sql);
    return {meta:{changes:1}};
   }
  };
 };
 const db={prepare,async batch(statements){for(const statement of statements)await statement.run();}};
 return {db,records,fields};
}
const envFor=db=>({DB:db,VAULT_ENCRYPTION_KEY:'test-secret-not-for-production-with-32-characters-minimum'});

test('V45 import stores many records, skips existing and repeated names, encrypts passwords',async()=>{
 const {db,records,fields}=fakeDB(),env=envFor(db);
 const first=await vaultRoute(request({records:[entry('USMAR Market'),
  entry('İkinci Platform','admin2','another-test-pass')]}),env,
  '/api/vault/import-batch','POST',admin);
 assert.deepEqual([first.created,first.skipped],[2,0]);
 assert.equal(records.size,2);
 const row=[...records.values()].find(r=>r.institution_name==='USMAR Market');
 assert.ok(row.secret_cipher&&!JSON.stringify(row).includes('temporary-test-secret'));
 const result=await vaultRoute(request({records:[
  entry('usmar market','changed','should-not-overwrite'),
  entry('Üçüncü Platform','admin3','third-pass'),
  entry('ÜÇÜNCÜ PLATFORM','duplicate','will-be-skipped')]}),env,
  '/api/vault/import-batch','POST',admin);
 assert.deepEqual([result.created,result.skipped],[1,2]);
 assert.equal(records.size,3);
 assert.equal([...records.values()].find(x=>x.institution_name==='USMAR Market').login_name,'root');
 const visible=await vaultRoute(new Request('https://example.test/api/vault'),env,'/api/vault','GET',reader);
 assert.equal(visible.vault.length,3);
 assert.equal(JSON.stringify(visible).includes('third-pass'),false);
 assert.equal(visible.vault.find(x=>x.institution_name==='Üçüncü Platform').has_password,true);
 const secret=await vaultRoute(new Request('https://example.test/api/vault/'+row.id+'/reveal',{
  method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
 }),env,'/api/vault/'+row.id+'/reveal','POST',reader);
 assert.equal(secret.password,'temporary-test-secret');
 assert.equal(fields.size,0);
});

test('V45 validates the entire batch before any changes, does not allow nonadmin import',async()=>{
 const {db,records}=fakeDB(),env=envFor(db),path='/api/vault/import-batch';
 const badNotes=entry('Bad');badNotes.notes='x'.repeat(12001);
 await assert.rejects(()=>vaultRoute(request({records:[entry('Valid'),badNotes]}),env,path,'POST',admin),{status:400});
 assert.equal(records.size,0);
 await assert.rejects(()=>vaultRoute(request({records:[entry('Only One')]}),env,path,'POST',{role:'user',permissions:['vault']}),{status:403});
 await assert.rejects(()=>vaultRoute(request({records:[entry('Only One')]}),env,path,'POST',noAccess),{status:403});
 await assert.rejects(()=>vaultRoute(request({records:Array.from({length:51},(_,i)=>entry('X'+i))}),env,path,'POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(request({records:[entry('Valid'),{institution_name:'Bad',notes:['wrong'] }]}),env,path,'POST',admin),{status:400});
 assert.equal(records.size,0);
});

test('V45 preserves secure separately encrypted additional fields',async()=>{
 const {db,fields}=fakeDB(),env=envFor(db);
 const record=entry('Sanal POS');
 record.extra_fields=[{label:'Kasa Kodu',kind:'secret',value:'secret-value'}];
 const result=await vaultRoute(request({records:[record]}),env,'/api/vault/import-batch','POST',admin);
 assert.equal(result.created,1);
 assert.equal(fields.size,1);
 assert.equal(JSON.stringify([...fields.values()]).includes('secret-value'),false);
});

test('V45 file importer supports array and {records}, staged review, and no photo OCR requirement',()=>{
 const events={},elements={};
 const document={
  getElementById(id){
   if(!elements[id])elements[id]={addEventListener(){},value:'',disabled:false};
   return elements[id];
  },
  addEventListener(name,listener){events[name]=listener;}
 };
 const window={HTIdentity:{role:'admin'}};
 vm.runInNewContext(read('public/vault-bulk-v45.js'),{document,window,URL});
 const parse=window.HTVaultBulk45.parse;
 const example=entry('Örnek Site');
 assert.equal(parse({records:[example]})[0].login_name,'root');
 assert.equal(parse([example])[0].institution_name,'Örnek Site');
 assert.throws(()=>parse({records:[]}),/1–50 kayıt/);
 const html=read('public/index.html'),ui=read('public/users-v26.js'),client=read('public/vault-bulk-v45.js');
 assert.doesNotMatch(html,/id="v45BulkOpen"/);
 assert.doesNotMatch(html,/id="v45BulkSave"/);
 assert.doesNotMatch(html,/id="v45BulkList"/);
 assert.doesNotMatch(html,/vault-bulk-v45\.js\?v=45/);
 assert.match(html,/id="v43VaultImport"/);
 assert.match(ui,/el\('v44ImageImport'\)\.hidden=true/);
 assert.match(client,/api\('vault\/import-batch','POST',\{records:send\}\)/);
 assert.match(client,/await window\.HTV26\?\.loadVault\(\)/);
 assert.doesNotMatch(client,/\.innerHTML\s*=/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v76');
});
