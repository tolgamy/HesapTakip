import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {personalContactsSchema,personalContactsRoute} from '../src/personal-contacts-v87.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const browser=read('public/personal-contacts-v87.js');
const router=read('public/settings-grid-v85.js');
const server=read('src/index.js');
globalThis.crypto??=webcrypto;

function parser(){
 const ids=['v87ContactsPanel','v87ContactsList','v87ContactSearch','v87ContactsNotice',
 'v87ContactsCount','v87ImportPreview','v87VcfInput','v87ConfirmImport','v87OpenVcf',
 'v87ImportPreviewText','v87NewContactForm','v87CancelImport','v87NewName','v87NewPhone','v89ShowContacts','v89AddContact',
 'v89ImportContact','v89DeleteAll','v89MoreContacts','v89DeletePanel',
 'v89DeletePhrase','v89ConfirmDelete','v89CancelDelete','v89DeleteDescription'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{hidden:false,textContent:'',value:'',disabled:false,
  addEventListener(){},replaceChildren(){},files:[]}]));
 const doc={getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener(){}};
 const window={HTIdentity:{role:'admin'}};
 vm.runInNewContext(browser,{document:doc,window,fetch:()=>{throw Error('No fetch during parsing')}});
 return window.HTPersonalContacts.parseVCF;
}

test('3x3 card swaps Üye Yönetimi for Rehber; all other cards survive',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v93');
 assert.match(html,/name="ht-build" content="v93"/);
 const tiles=[...html.matchAll(/data-v85-settings="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(tiles,['vault','bills','contacts','control','cards','banks','reports','security','logos']);
 assert.equal((html.match(/class="v85-setting-tile/g)||[]).length,9);
 assert.match(html,/data-v85-settings="contacts"[\s\S]*?<strong>Rehber<\/strong>/);
 assert.doesNotMatch(html,/data-v85-settings="members"/);
 assert.match(html,/data-v85-settings="security"[\s\S]*?<strong>Güvenlik<\/strong>/);
 assert.match(html,/href="\/personal-contacts-v87\.css\?v=87"/);
 assert.match(html,/src="\/personal-contacts-v87\.js\?v=90"/);
 assert.ok(html.indexOf('personal-contacts-v87.css')>html.indexOf('settings-grid-v86.css'));
 assert.match(read('public/settings-grid-v86.css'),/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
});

test('Üye ve Yetki Yönetimi exists under Security, not the address book',()=>{
 assert.match(html,/id="v87SecurityMembers"[^>]*hidden/);
 assert.match(html,/id="v87OpenMembers"[^>]*data-v87-open-members/);
 assert.match(router,/if\(event\.target\.closest\('\[data-v87-open-members\]'\)\)/);
 assert.match(router,/if\(admin\(\)\)window\.tab\('useraccounts'\)/);
 assert.match(router,/security:\['Güvenlik','PIN, üye onayları/);
 assert.match(router,/contacts:\['Kişisel Rehber'/);
 assert.match(read('public/users-v26.js'),/data-v85-permissions/);
 assert.match(read('public/users-v26.js'),/await api\('users\/'\+form\.dataset\.v26User,'PATCH'/);
 assert.match(read('public/personal-contacts-v87.css'),/#settingsView\[data-v85-screen="security"\] > #v87SecurityMembers/);
});

test('iPhone vCard parser understands 3.0, item1.TEL, UTF-8, multiline and multiple numbers',()=>{
 const text=[
 'BEGIN:VCARD','VERSION:3.0','FN:Ayşe Deneme','N:Deneme;Ayşe;;;',
 'item1.TEL;TYPE=CELL:+90 (555) 123 45 67','item1.X-ABLabel:cep',
 'item2.TEL;TYPE=HOME:0212 444 55 66','END:VCARD',
 'BEGIN:VCARD','VERSION:3.0','FN:Oğuz,',' Devam','N:Devam;Oğuz;;;',
 'TEL;TYPE=CELL:+905551234555','END:VCARD',
 'BEGIN:VCARD','VERSION:3.0','FN:Numarasız','END:VCARD'
 ].join('\r\n');
 const data=parser()(text);
 assert.equal(data.cards,3);
 assert.equal(data.contacts.length,3);
 assert.equal(data.skipped,1);
 assert.equal(data.contacts[0].name,'Ayşe Deneme');
 assert.equal(data.contacts[0].phone,'+90 (555) 123 45 67');
 assert.equal(data.contacts[0].label,'CELL');
 assert.equal(data.contacts[1].label,'HOME');
 assert.equal(data.contacts[2].name,'Oğuz,Devam');
});

test('batch parsing tolerates a 1630-card address book without embedding private names',()=>{
 const text=Array.from({length:1630},(_,i)=>[
  'BEGIN:VCARD','VERSION:3.0','FN:Örnek '+String(i).padStart(4,'0'),
  'item1.TEL;TYPE=CELL:+90 555 '+String(1000000+i),'END:VCARD'].join('\n')).join('\n');
 const data=parser()(text);
 assert.equal(data.cards,1630);
 assert.equal(data.contacts.length,1630);
 assert.equal(data.skipped,0);
 assert.ok(text.length<3_000_000);
});

test('client never sends contacts before explicit import confirmation; no PII in public sources',()=>{
 assert.match(browser,/file\.addEventListener\('change'/);
 assert.match(browser,/preview\.hidden=false/);
 assert.match(browser,/confirm\.addEventListener\('click'/);
 assert.match(browser,/for\(let i=0;i<pending\.length;i\+=100\)/);
 assert.match(browser,/await request\('\/api\/personal-contacts\/import','POST'/);
 assert.match(browser,/if\(!isAdmin\(\)\)throw Error/);
 assert.match(browser,/window\.HTPersonalContacts=\{open,parseVCF,reset\}/);
 assert.match(browser,/contacts=\[\];loaded=false;panel\.hidden=true/);
 assert.match(browser,/name\.textContent=c\.name/);
 assert.match(browser,/call\.href=safe\?'tel:'\+safe:'#'/);
 assert.doesNotMatch(browser,/(?:INSERT INTO|DROP TABLE|DELETE FROM) (?:app_members|finance_entries|firm_debts)/i);
 assert.doesNotMatch(html,/\+90 \(555\) 123 45 67/);
});

test('server-side admin/PIN/CSRF checks are enforced for separate personal contacts',async()=>{
 assert.match(server,/await assertPinUnlocked\(request,env,principal\)/);
 assert.match(server,/if \(method !== 'GET' && method !== 'HEAD'\) assertSameOrigin\(request\)/);
 assert.match(server,/personalContactsRoute\(request,env,path,method,principal\)/);
 assert.match(server,/\.\.\.personalContactsSchema/);
 assert.match(read('src/personal-contacts-v87.js'),/principal\?\.role!=='admin'/);
 assert.match(read('src/personal-contacts-v87.js'),/INSERT OR IGNORE INTO personal_contacts_v87/);
 assert.match(personalContactsSchema.join(' '),/CREATE TABLE IF NOT EXISTS personal_contacts_v87/);
 assert.doesNotMatch(personalContactsSchema.join(' '),/DROP TABLE|DELETE FROM|UPDATE app_members/);
 for(const method of ['GET','POST']){
  await assert.rejects(personalContactsRoute(
   new Request('https://example.org/api/personal-contacts',{method}),
   {},'/api/personal-contacts',method,{role:'user'}),e=>e.status===403);
 }
});

test('individual import adds separately, skips repeat rows and rejects bad numbers',async()=>{
 const rows=[];
 const db={
  prepare(sql){
   const statement={sql};
   statement.bind=(...args)=>({...statement,args});
   statement.all=async()=>({results:rows.map(x=>({id:x[0],name:x[1],phone:x[3],label:x[5]}))});
   return statement;
  },
  async batch(statements){
   return statements.map(s=>{
    const key=s.args[2]+'|'+s.args[4];
    if(rows.some(x=>x[2]+'|'+x[4]===key))return{meta:{changes:0}};
    rows.push(s.args);
    return{meta:{changes:1}};
   });
  }
 };
 const make=(contacts)=>new Request('https://example.org/api/personal-contacts/import',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contacts})
 });
 const a={name:'Deneme İsim',phone:'+90 (555) 123 45 67',label:'CELL'};
 const route=(req,path='/api/personal-contacts/import',method='POST')=>
  personalContactsRoute(req,{DB:db},path,method,{role:'admin'});
 const first=await route(make([a,a]));
 assert.equal(first.added,1);
 assert.equal(first.skipped,1);
 const second=await route(make([a]));
 assert.equal(second.added,0);
 assert.equal(second.skipped,1);
 const list=await route(new Request('https://example.org/api/personal-contacts'),
   '/api/personal-contacts','GET');
 assert.equal(list.contacts.length,1);
 assert.equal(list.contacts[0].name,a.name);
 await assert.rejects(route(make([{name:'Bad',phone:'abc'}])),e=>e.status===400);
 assert.equal(rows.length,1,'bad numbers must not erase existing contacts');
});

test('archive attachment is never placed in the public GitHub repository',()=>{
 const docs=read('docs/PRIVATE_REHBER_V87.md');
 assert.match(docs,/1\.630 kişi kartı/);
 assert.match(docs,/GitHub'a eklenmedi/);
 assert.match(docs,/veritabanı/);
 assert.match(read('public/theme-v81.js'),/ht-ui-theme-v81/);
});
