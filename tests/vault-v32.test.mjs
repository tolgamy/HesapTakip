import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {vaultRoute,memberSchema} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin={role:'admin',username:'admin',permissions:['vault']};
const reader={role:'user',permissions:['vault']};
const noAccess={role:'user',permissions:['people']};
function req(path,payload,method='POST'){
 return new Request('https://example.test/api/'+path,{
  method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
function fakeDB(){
 const records=new Map(),fields=new Map();
 const db={
  async batch(statements){for(const statement of statements)await statement.run();},
  prepare(sql){
   const q={params:[],bind(...items){this.params=items;return this;},
    async all(){
     if(sql.includes('FROM vault_custom_fields')){
      const list=[...fields.values()].filter(x=>!sql.includes('WHERE vault_id=?')||x.vault_id===q.params[0]);
      return {results:list.sort((a,b)=>a.sort_order-b.sort_order).map(x=>{
       if(sql.startsWith('SELECT id FROM'))return {id:x.id};
       return {...x};
      })};
     }
     if(sql.includes('FROM vault_credentials'))return {results:[...records.values()]};
     return {results:[]};
    },
    async first(){
     if(sql.includes('FROM vault_custom_fields'))
      return fields.get(q.params[1])?.vault_id===q.params[0]?fields.get(q.params[1]):null;
     if(sql.includes('FROM vault_credentials'))return records.get(q.params[0])||null;
     return null;
    },
    async run(){
     const p=q.params;
     if(sql.startsWith('INSERT INTO vault_credentials')){
      const [id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv]=p;
      records.set(id,{id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv});
     }else if(sql.startsWith('UPDATE vault_credentials')){
      const id=p.at(-1),rec=records.get(id);
      Object.assign(rec,{category:p[0],institution_name:p[1],login_name:p[2],login_url:p[3],notes:p[4]});
      if(p.length===8){rec.secret_cipher=p[5];rec.secret_iv=p[6];}
     }else if(sql.startsWith('DELETE FROM vault_credentials'))records.delete(p[0]);
     else if(sql.startsWith('INSERT INTO vault_custom_fields')){
      const [id,vault_id,label,kind,secret_cipher,secret_iv,sort_order]=p;
      fields.set(id,{id,vault_id,label,kind,secret_cipher,secret_iv,sort_order});
     }else if(sql.startsWith('UPDATE vault_custom_fields')){
      const hasSecret=sql.includes('secret_cipher=?');
      const id=p[hasSecret?5:3],parent=p[hasSecret?6:4],row=fields.get(id);
      if(row&&row.vault_id===parent){
       row.label=p[0];row.kind=p[1];row.sort_order=p[2];
       if(hasSecret){row.secret_cipher=p[3];row.secret_iv=p[4];}
      }
     }else if(sql.startsWith('DELETE FROM vault_custom_fields WHERE id=?')){
      const row=fields.get(p[0]);
      if(row?.vault_id===p[1])fields.delete(p[0]);
     }else if(sql.startsWith('DELETE FROM vault_custom_fields WHERE vault_id=?')){
      for(const [id,row] of fields)if(row.vault_id===p[0])fields.delete(id);
     }else throw new Error('Unexpected fake SQL: '+sql);
     return {meta:{changes:1}};
    }
   };
   return q;
  }
 };
 return {db,records,fields};
}
const envFor=db=>({DB:db,VAULT_ENCRYPTION_KEY:'separate-production-like-secret-greater-than-32-characters'});

test('V32 encrypted custom fields coexist with legacy username/password; listing never leaks values',async()=>{
 const {db,records,fields}=fakeDB(),env=envFor(db);
 const created=await vaultRoute(req('vault',{category:'platform',institution_name:'Örnek Platform',
  login_name:'company-admin',login_url:'https://example.test/signin',password:'old-password',
  notes:'',extra_fields:[{label:'Admin',kind:'text',value:'yonetici'},
   {label:'Şifre',kind:'secret',value:'topsecret'},{label:'Parola',kind:'secret',value:'different-secret'}]}),
  env,'/api/vault','POST',admin);
 assert.equal(fields.size,3);
 const stored=[...fields.values()];
 assert.ok(stored.every(x=>x.secret_cipher&&!JSON.stringify(x).includes('different-secret')));
 assert.ok(records.get(created.id).secret_cipher&&!records.get(created.id).secret_cipher.includes('old-password'));
 const list=await vaultRoute(new Request('https://example.test/api/vault'),env,'/api/vault','GET',reader);
 const row=list.vault[0];
 assert.equal(row.login_name,'company-admin');
 assert.equal(row.has_password,true);
 assert.equal(row.extra_fields.length,3);
 assert.deepEqual(row.extra_fields.map(f=>f.label),['Admin','Şifre','Parola']);
 assert.ok(row.extra_fields.every(f=>f.has_value&&!('secret_cipher' in f)&&!('secret_iv' in f)));
 assert.equal('secret_cipher' in row,false);
 assert.equal(JSON.stringify(list).includes('topsecret'),false);
 const secret=await vaultRoute(req('vault/'+created.id+'/reveal',{}),env,
  '/api/vault/'+created.id+'/reveal','POST',reader);
 assert.equal(secret.password,'old-password');
 const para=row.extra_fields.find(f=>f.label==='Parola');
 const v=await vaultRoute(req('vault/'+created.id+'/fields/'+para.id+'/reveal',{}),env,
  '/api/vault/'+created.id+'/fields/'+para.id+'/reveal','POST',reader);
 assert.equal(v.value,'different-secret');
 await assert.rejects(()=>vaultRoute(req('vault/'+created.id+'/fields/'+para.id+'/reveal',{}),env,
  '/api/vault/'+created.id+'/fields/'+para.id+'/reveal','POST',noAccess),{status:403});
 await assert.rejects(()=>vaultRoute(req('vault/'+created.id+'/fields/'+para.id+'/reveal',{}),env,
  '/api/vault/'+created.id+'/fields/'+para.id+'/reveal','POST',null),{status:403});
});
test('V32 editing keeps old encrypted values if blank, allows renaming and deleting fields',async()=>{
 const {db,fields}=fakeDB(),env=envFor(db);
 const saved=await vaultRoute(req('vault',{category:'bank',institution_name:'Banka',
  login_name:'user-1',notes:'',password:'original',extra_fields:[
    {label:'Admin',kind:'text',value:'root'},
    {label:'Parola',kind:'secret',value:'one-time-pass'}
  ]}),env,'/api/vault','POST',admin);
 const first=(await vaultRoute(new Request('https://example.test/api/vault'),env,
  '/api/vault','GET',admin)).vault[0].extra_fields;
 const kept=first.find(f=>f.label==='Admin'),removed=first.find(f=>f.label==='Parola');
 const initialCipher=fields.get(kept.id).secret_cipher;
 await vaultRoute(req('vault/'+saved.id,{category:'bank',institution_name:'Banka Yeni',
  login_name:'user-2',notes:'',extra_fields:[
    {id:kept.id,label:'Admin2',kind:'text',value:''},
    {label:'İşletme Kodu',kind:'secret',value:'shop-456'}]}),env,
    '/api/vault/'+saved.id,'PATCH',admin);
 assert.equal(fields.size,2);
 assert.equal(fields.has(removed.id),false);
 assert.equal(fields.get(kept.id).secret_cipher,initialCipher);
 assert.equal(fields.get(kept.id).label,'Admin2');
 const old=await vaultRoute(req('vault/'+saved.id+'/reveal',{}),env,
  '/api/vault/'+saved.id+'/reveal','POST',admin);
 assert.equal(old.password,'original');
 const after=(await vaultRoute(new Request('https://example.test/api/vault'),env,
  '/api/vault','GET',admin)).vault[0].extra_fields;
 assert.deepEqual(after.map(f=>f.label),['Admin2','İşletme Kodu']);
 await assert.rejects(()=>vaultRoute(req('vault/'+saved.id,{category:'bank',
  institution_name:'X',login_name:'a',notes:'',extra_fields:[
    {id:'11111111-1111-4111-8111-111111111111',label:'bad',kind:'text',value:''}]}),env,
  '/api/vault/'+saved.id,'PATCH',admin),{status:400});
 await vaultRoute(req('vault/'+saved.id,{},'DELETE'),env,
  '/api/vault/'+saved.id,'DELETE',admin);
 assert.equal(fields.size,0);
});
test('V32 enforces extra-field shape, limit, and authorization',async()=>{
 const {db}=fakeDB(),env=envFor(db);
 const base={category:'bank',institution_name:'Banka',login_name:'a',notes:''};
 await assert.rejects(()=>vaultRoute(req('vault',{...base,extra_fields:[{label:'A',kind:'other',value:'x'}]}),env,
  '/api/vault','POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(req('vault',{...base,extra_fields:[{label:'A',kind:'text',value:''}]}),env,
  '/api/vault','POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(req('vault',{...base,extra_fields:Array.from({length:21},(_,i)=>({label:'F'+i,kind:'secret',value:'x'}))}),env,
  '/api/vault','POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(req('vault',base),env,'/api/vault','POST',reader),{status:403});
 assert.match(memberSchema.join(' '),/vault_custom_fields/);
 assert.doesNotMatch(memberSchema.join(' '),/DROP TABLE/);
});
test('V32 UI has no PIN and offers named fields for editing with one-click copy',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js');
 assert.doesNotMatch(html,/id="v28PinDialog"|id="v28PinSetupForm"/);
 assert.match(html,/id="v32FieldsEditor"/);
 assert.match(html,/id="v32AddField"/);
 assert.match(ui,/function collectVaultFields/);
 assert.match(ui,/data-v32-field-copy/);
 assert.match(ui,/data-v32-password-copy/);
 assert.match(ui,/data-v31-copy-user/);
 assert.doesNotMatch(ui,/pinConfigured|v28PinInput|vault\/pin/);
 assert.match(ui,/await api\(endpoint,'POST',\{\}\)/);
 assert.match(read('src/index.js'),/\.\.\.memberSchema/);
 assert.doesNotMatch(read('src/index.js'),/vaultPinRoute/);
});
