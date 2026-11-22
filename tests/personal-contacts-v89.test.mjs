import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {personalContactsRoute} from '../src/personal-contacts-v87.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const ui=read('public/personal-contacts-v87.js');
const css=read('public/personal-contacts-v89.css');
const server=read('src/personal-contacts-v87.js');

function groupForName(){
 const ids=[
 'v87ContactsPanel','v87ContactsList','v87ContactSearch','v87ContactsNotice',
 'v87ContactsCount','v87ImportPreview','v87VcfInput','v87ConfirmImport',
 'v87OpenVcf','v87ImportPreviewText','v87NewContactForm','v87CancelImport',
 'v87NewName','v87NewPhone','v89ShowContacts','v89AddContact',
 'v89ImportContact','v89DeleteAll','v89MoreContacts','v89DeletePanel',
 'v89DeletePhrase','v89ConfirmDelete','v89CancelDelete','v89DeleteDescription'
 ];
 const nodes=Object.fromEntries(ids.map(id=>[id,{
  value:'',disabled:false,hidden:false,textContent:'',files:[],
  addEventListener(){},replaceChildren(){},reset(){},click(){},focus(){}
 }]));
 const doc={
  getElementById:id=>nodes[id]||null,
  querySelectorAll:()=>[],
  addEventListener(){}
 };
 const win={HTIdentity:{role:'admin'}};
 vm.runInNewContext(ui,{document:doc,window:win,Intl});
 return win.HTRehberV89.groupForName;
}

test('Rehber V2 has four same-width actions and five Turkish alphabet groups',()=>{
 assert.equal((html.match(/class="v89-action(?: active| danger)?"/g)||[]).length,4);
 assert.deepEqual([...html.matchAll(/data-v89-group="(\d+)"/g)].map(x=>x[1]),['0','1','2','3','4']);
 for(const label of ['A–C','Ç–F','G–L','M–R','S–Z'])assert.ok(html.includes(label));
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 assert.match(html,/personal-contacts-v89\.css\?v=89/);
});
test('Turkish initial grouping is continuous and supports all name letters',()=>{
 const group=groupForName();
 const cases={
  'Ahmet':0,'Burak':0,'Cem':0,
  'Çiğdem':1,'Deniz':1,'Emre':1,'Fatma':1,
  'Gökçe':2,'Ğ':2,'Hale':2,'Işıl':2,'İpek':2,'Jale':2,'Kemal':2,'Leyla':2,
  'Mert':3,'Nazan':3,'Ozan':3,'Özgür':3,'Pelin':3,'Rıza':3,
  'Selim':4,'Şule':4,'Tuna':4,'Umut':4,'Ümit':4,'Veli':4,'Yıldız':4,'Zeynep':4
 };
 for(const [name,idx] of Object.entries(cases))assert.equal(group(name),idx,name);
 assert.equal(group('  ...ali'),0,'leading punctuation must not drop contacts');
});
test('rendering uses safe text nodes, paging, global search and telephone/message links',()=>{
 assert.match(ui,/name\.textContent=c\.name/);
 assert.match(ui,/rows\.slice\(0,shown\)/);
 assert.match(ui,/shown\+=75/);
 assert.match(ui,/search\.value\.trim\(\)\.toLocaleLowerCase\('tr-TR'\)/);
 assert.match(ui,/call\.href=safe\?'tel:'\+safe:'#'/);
 assert.match(ui,/message\.href=safe\?'sms:'\+safe:'#'/);
 assert.match(ui,/replace\(\/\[\^\+0-9\]\/g,''\)/);
 assert.doesNotMatch(ui,/innerHTML\s*=\s*c\.name/);
});
test('bulk delete is isolated, admin-only and requires exact typed confirmation',async()=>{
 assert.match(html,/id="v89DeletePhrase"/);
 assert.match(html,/id="v89ConfirmDelete" disabled/);
 assert.match(ui,/deletePhrase\.value\.trim\(\)\.toLocaleUpperCase\('tr-TR'\)!=='SİL'/);
 assert.match(ui,/confirmation:'TÜMÜNÜ SİL',expectedCount:deleteExpected/);
 assert.match(server,/principal\?\.role!=='admin'/);
 assert.match(server,/DELETE FROM personal_contacts_v87/);
 assert.doesNotMatch(server,/DELETE FROM (?:firms|finance_entries|users|app_members)/i);

 const rows=[{name:'A'},{name:'B'}];
 const executed=[];
 const db={prepare(sql){
  executed.push(sql);
  if(sql==='SELECT COUNT(*) AS count FROM personal_contacts_v87')
   return {first:async()=>({count:rows.length})};
  if(sql==='DELETE FROM personal_contacts_v87')
   return {run:async()=>{const n=rows.length;rows.length=0;return{meta:{changes:n}};}};
  throw Error('Unexpected DB query: '+sql);
 }};
 const call=(role,confirmation,expectedCount)=>personalContactsRoute(
  new Request('https://example.test/api/personal-contacts/clear',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({confirmation,expectedCount})}),
  {DB:db},'/api/personal-contacts/clear','POST',{role});
 await assert.rejects(call('user','TÜMÜNÜ SİL',2),e=>e.status===403);
 await assert.rejects(call('admin','SİL',2),e=>e.status===400);
 await assert.rejects(call('admin','TÜMÜNÜ SİL',3),e=>e.status===409);
 assert.equal(rows.length,2,'failed confirmation must never delete a record');
 const result=await call('admin','TÜMÜNÜ SİL',2);
 assert.equal(result.deleted,2);
 assert.equal(rows.length,0);
 assert.ok(executed.every(sql=>sql.includes('personal_contacts_v87')));
});
test('private vCard records are not copied to public sources or imported automatically',()=>{
 assert.match(ui,/await request\('\/api\/personal-contacts\/import','POST'/);
 assert.match(ui,/confirm\.addEventListener\('click'/);
 assert.match(ui,/clearPreview\(\);await load\(\)/);
 assert.doesNotMatch(ui,/\bfetch\('https?:\/\/[^']+\.vcf/);
});
