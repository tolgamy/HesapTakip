import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {vaultRoute} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin={role:'admin',username:'admin',permissions:['vault']};
function memDB(){
 const rows=[];
 return {
  async batch(statements){for(const row of statements)await row.run();},
  prepare(sql){
   let args=[];
   return {
    bind(...values){args=values;return this;},
    async run(){
     if(!sql.startsWith('INSERT INTO vault_credentials'))throw new Error('Unexpected SQL: '+sql);
     const [id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv]=args;
     rows.push({id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv});
     return {meta:{changes:1}};
    },
    async all(){
     if(sql.includes('FROM vault_custom_fields'))return {results:[]};
     if(sql.includes('FROM vault_credentials'))return {results:rows};
     throw new Error('Unexpected SELECT: '+sql);
    },
    async first(){return null;}
   };
  }
 };
}
const post=data=>new Request('https://example.test/api/vault',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
});

test('V43 Hakkında saves a multi-section note longer than 500 characters without truncation',async()=>{
 const about='1. DOMAIN VE HOSTING\nSite: example.test\n\n2. SİTE ALTYAPISI\n'+
   'Açıklama ve iletişim bilgileri.\n'.repeat(45);
 assert.ok(about.length>500 && about.length<12000);
 const env={DB:memDB()};
 const saved=await vaultRoute(post({category:'platform',institution_name:'Örnek Site',
  login_name:'admin',login_url:'https://example.test/admin/',notes:about}),
  env,'/api/vault','POST',admin);
 assert.ok(saved.id);
 const list=await vaultRoute(new Request('https://example.test/api/vault'),env,'/api/vault','GET',admin);
 assert.equal(list.vault[0].notes,about);
 assert.equal(list.vault[0].login_name,'admin');
 assert.equal(list.vault[0].has_password,false);
 await assert.rejects(()=>vaultRoute(post({category:'platform',institution_name:'Örnek Site',
  notes:'x'.repeat(12001)}),env,'/api/vault','POST',admin),{status:400});
});

test('V43 JSON import stages a preview for admin, never auto-saves secrets or publishes customer info',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js');
 assert.match(html,/id="v43VaultImportFile"/);
 assert.match(html,/id="v43VaultImport"/);
 assert.match(html,/name="notes" maxlength="12000"/);
 assert.match(ui,/function openVault\(/);
 assert.match(ui,/document\.addEventListener\('change',async event=>/);
 assert.match(ui,/form\.elements\.notes\.value=about/);
 assert.match(ui,/form\.elements\.password\.value=password/);
 assert.match(ui,/Kayıt formu dolduruldu/);
 assert.match(ui,/v43-vault-about/);
 assert.doesNotMatch(ui,/USMAR Market/);
});
