import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { directoryRoute } from '../src/directory.js';

for (const path of ['../public/directory-v17.js','../public/logos-v17.js','../public/update-v17.js',
 '../public/app.js','../public/settings-v12.js','../public/cards-pro.js','../public/core-money.js']) {
 test('browser JavaScript parses: '+path, () => {
   const file=fileURLToPath(new URL(path,import.meta.url));
   assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',file],{timeout:10000}));
 });
}

class MockDB {
 constructor(){this.companies=[];this.contacts=[];this.sqlWrites=[];}
 prepare(sql){
  const db=this;
  return {
   args:[],
   bind(...values){this.args=values;return this;},
   async all(){
    if(sql.startsWith('SELECT id,name_key FROM directory_companies'))
      return {results:db.companies.map(({id,name_key})=>({id,name_key}))};
    if(sql.startsWith('SELECT company_id,name_key,phone FROM directory_contacts'))
      return {results:db.contacts.map(({company_id,name_key,phone})=>({company_id,name_key,phone}))};
    throw Error('Unsupported mock query: '+sql);
   },
   async run(){
    db.sqlWrites.push(sql);
    if(sql.includes('INSERT INTO directory_companies')){
      const [id,name,name_key,phone,visit_day,note]=this.args;
      if(db.companies.some(c=>c.name_key===name_key))throw Error('UNIQUE constraint failed');
      db.companies.push({id,name,name_key,phone,visit_day,note});
    }else if(sql.includes('INSERT INTO directory_contacts')){
      const [id,company_id,full_name,name_key,phone,visit_day,note]=this.args;
      if(db.contacts.some(c=>c.company_id===company_id&&c.name_key===name_key&&c.phone===phone))
        throw Error('UNIQUE constraint failed');
      db.contacts.push({id,company_id,full_name,name_key,phone,visit_day,note});
    }else throw Error('Unsupported mock write: '+sql);
   }
  };
 }
 async batch(statements){for(const stmt of statements)await stmt.run();}
}
const request=rows=>new Request('https://example.test/api/directory/import',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({rows,existing_mode:'merge'})
});
test('Excel importing merges multiple representatives without changing financial history', async () => {
 const env={DB:new MockDB()};
 const rows=[
  {name:'ABC Gıda',full_name:'Ahmet Yılmaz',phone:'0532 123 45 67',visit_day:'Salı',company_note:'',contact_note:''},
  {name:'ABC Gıda',full_name:'Mehmet Demir',phone:'0535 456 78 90',visit_day:'Perşembe',company_note:'',contact_note:''},
  {name:'XYZ Market',full_name:'',phone:'+90 533 222 33 44',visit_day:'Cuma',company_note:'',contact_note:''}
 ];
 let r=await directoryRoute(request(rows),env,'/api/directory/import','POST');
 assert.deepEqual(r,{added_companies:2,added_contacts:2,skipped:0});
 assert.equal(env.DB.companies.find(c=>c.name==='XYZ Market').phone,'+90 533 222 33 44');
 assert.equal(env.DB.companies.find(c=>c.name==='XYZ Market').visit_day,'Cuma');
 assert.equal(env.DB.contacts.length,2);
 r=await directoryRoute(request(rows),env,'/api/directory/import','POST');
 assert.deepEqual(r,{added_companies:0,added_contacts:0,skipped:3});
 r=await directoryRoute(request([
  {name:'ABC Gıda',full_name:'Yeni Yetkili',phone:'0534 000 00 00',visit_day:'Cuma'}
 ]),env,'/api/directory/import','POST');
 assert.deepEqual(r,{added_companies:0,added_contacts:1,skipped:0});
 assert.equal(env.DB.contacts.length,3);
 assert.ok(env.DB.sqlWrites.every(q=>q.includes('directory_')));
});
test('invalid phone makes import fail without any DB changes',async()=>{
 const env={DB:new MockDB()};
 await assert.rejects(()=>directoryRoute(request([{name:'ABC',phone:'123',full_name:''}]),env,'/api/directory/import','POST'),
  /Telefonu 10 haneli/);
 assert.equal(env.DB.companies.length,0);
});
