import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {directoryRoute,directorySchema} from '../src/directory.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oldVisit='Merhaba {temsilci}, {firma} için bu haftaki ziyaret planınızı öğrenebilir miyim?';
const oldPay='Merhaba {temsilci}, {firma} ile ilgili ödeme durumunu paylaşabilir misiniz?';
function client(directory){
 const el=()=>({insertAdjacentHTML(){},value:'',hidden:false});
 const context={window:{},state:{directory},document:{body:{insertAdjacentHTML(){}},addEventListener(){}},
  el,esc:x=>String(x??''),currentRole:'admin'};
 vm.runInNewContext(read('public/directory-v17.js'),context);
 return context.window.HTDirectory;
}
test('V48 three editable defaults, legacy exact copies disappear, distinct messages remain',()=>{
 const templates=[
  {id:'old-visit',title:'Ziyaret hatırlatması',body:oldVisit},
  {id:'old-pay',title:'Ödeme hatırlatması',body:oldPay},
  {id:'repeat',title:'Ödeme hatırlatması',body:oldPay},
  {id:'unique',title:'Ödeme hatırlatması',body:'Özel ödeme metnim'},
  {id:'distinct',title:'Yeni yazışma',body:'Kendime özel'}
 ];
 const d={companies:[],contacts:[],templates,templateDefaults:[]};
 const api=client(d);
 const list=api.allTemplates();
 assert.deepEqual(Array.from(list.slice(0,3).map(x=>x.id)),['visit','order','payment']);
 assert.deepEqual(Array.from(list.slice(3).map(x=>x.id)),['unique','distinct']);
 assert.equal(api.getTemplate('visit').builtin,true);
 assert.equal(api.getTemplate('old-pay'),null);
});
test('V48 built-in override is separate, in same position, and can contain long visit script',()=>{
 const d={companies:[],contacts:[],templates:[],templateDefaults:[{preset_key:'visit',title:'Benim Ziyaretim',
  body:'Merhaba {temsilci}. {firma} için ziyaret.'}]};
 const api=client(d), list=api.allTemplates();
 assert.equal(list.length,3);
 assert.equal(list[0].id,'visit');
 assert.equal(list[0].title,'Benim Ziyaretim');
 assert.equal(api.getTemplate('visit').body,d.templateDefaults[0].body);
 assert.equal(api.defaultMessages[0].body.includes('6. Acil Siparişler:'),true);
 assert.equal(api.defaultMessages[0].body.includes('30 dakika'),true);
 assert.ok(api.defaultMessages[0].body.length>1000);
});
test('V48 recipient placeholder replacements avoid duplicated firm/representative header',()=>{
 const api=client({companies:[],contacts:[],templates:[],templateDefaults:[]});
 const filled=api.templateFill({body:'Merhaba {temsilci}, {firma} · {telefon}'},
  {name:'Coca Cola',phone:''},{full_name:'Veysel Uslu',phone:'+90 540 425 60 40'});
 assert.equal(filled,'Merhaba Veysel Uslu, Coca Cola · +90 540 425 60 40');
 assert.doesNotMatch(filled,/Temsilci:/);
 const noFields=api.templateFill({body:'Fiyat listenizi gönderin.'},{name:'Coca Cola'},{full_name:'Veysel Uslu'});
 assert.match(noFields,/Firma: Coca Cola/);
 assert.match(noFields,/Temsilci: Veysel Uslu/);
});
test('V48 templates are actionable and tomorrow shortcut does not send automatically',()=>{
 const ui=read('public/directory-v17.js'),css=read('public/whatsapp-v48.css'),html=read('public/index.html');
 for(const key of ['data-dir-template-edit','data-dir-template-copy','data-dir-template-send',
  'data-dir-template-reset','data-dir-template-delete','data-dir-visit-chat','dirTemplateRecipientForm'])
  assert.ok(ui.includes(key),key);
 assert.match(ui,/function tomorrowDay/);
 assert.match(ui,/visitTomorrow\(company,contact\)/);
 assert.match(ui,/navigator\.clipboard\.writeText/);
 assert.match(ui,/await api\('directory\/template-defaults\/'\+e.dataset.dirTemplateReset,'DELETE'\)/);
 assert.match(ui,/https:\/\/wa\.me\//);
 assert.match(ui,/Mesaj otomatik gönderilmez/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(html,/whatsapp-v48\.css\?v=48/);
 assert.match(html,/directory-v17\.js\?v=68/);
});
class DB{
 constructor(){this.overrides=new Map();this.custom=[];this.queries=[];}
 prepare(sql){
  const db=this;
  return {values:[],bind(...args){this.values=args;return this;},
   async all(){
    if(sql.includes('FROM directory_template_defaults'))return {results:[...db.overrides].map(([preset_key,v])=>({preset_key,...v}))};
    if(sql.includes('FROM directory_templates'))return {results:db.custom};
    if(sql.includes('FROM directory_companies')||sql.includes('FROM directory_contacts'))return {results:[]};
    throw Error('unexpected all: '+sql);
   },
   async first(){
    if(sql.includes('FROM directory_templates'))return db.custom.find(x=>x.id===this.values[0])||null;
    throw Error('unexpected first: '+sql);
   },
   async run(){
    db.queries.push(sql);
    if(sql.includes('INSERT INTO directory_template_defaults')){
     const [key,title,body]=this.values;db.overrides.set(key,{title,body});
    }else if(sql.includes('DELETE FROM directory_template_defaults')){
     db.overrides.delete(this.values[0]);
    }else if(sql.includes('INSERT INTO directory_templates')){
     const [id,title,body]=this.values;db.custom.push({id,title,body});
    }else if(sql.includes('UPDATE directory_templates')){
     const [title,body,id]=this.values;Object.assign(db.custom.find(x=>x.id===id),{title,body});
    }else if(sql.includes('DELETE FROM directory_templates')){
     db.custom=db.custom.filter(x=>x.id!==this.values[0]);
    }else throw Error('unexpected run: '+sql);
   }};
 }
}
const req=(path,method,data)=>new Request('https://example.test/api/'+path,{
 method,headers:{'content-type':'application/json'},body:data?JSON.stringify(data):undefined});
test('V48 saved default edits persist and reset without touching custom templates',async()=>{
 const db=new DB(),env={DB:db};
 await directoryRoute(req('directory/template-defaults/visit','PATCH',{title:'Ziyaret',body:'A'.repeat(1400)}),
  env,'/api/directory/template-defaults/visit','PATCH');
 assert.equal(db.overrides.get('visit').body.length,1400);
 db.custom=[{id:'keep-me',title:'Özel',body:'Korunacak'}];
 const get=await directoryRoute(req('directory','GET'),env,'/api/directory','GET');
 assert.equal(get.templateDefaults[0].preset_key,'visit');
 await directoryRoute(req('directory/template-defaults/visit','DELETE'),env,'/api/directory/template-defaults/visit','DELETE');
 assert.equal(db.overrides.size,0);
 assert.equal(db.custom.length,1);
 assert.match(directorySchema.join(' '),/directory_template_defaults/);
});
test('V48 server rejects exact duplicate custom template but preserves distinct texts',async()=>{
 const db=new DB(),env={DB:db};
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 const first=await directoryRoute(req('directory/templates','POST',{title:'Özel Mesaj',body:'İlk içerik'}),
  env,'/api/directory/templates','POST');
 assert.ok(first.id);
 await assert.rejects(directoryRoute(req('directory/templates','POST',{title:'Özel Mesaj',body:'İlk içerik'}),
  env,'/api/directory/templates','POST'),/zaten var/);
 await directoryRoute(req('directory/templates','POST',{title:'Özel Mesaj',body:'Farklı içerik'}),
  env,'/api/directory/templates','POST');
 assert.equal(db.custom.length,2);
});
test('V48 profile visit quick-send uses shared editable template and tomorrow restriction',()=>{
 const ui=read('public/workflows-v22.js'),html=read('public/index.html');
 assert.match(ui,/HTDirectory\?\.getTemplate\?\.\('visit'\)/);
 assert.match(ui,/HTDirectory\.templateFill/);
 assert.match(ui,/HTDirectory\?\.visitTomorrow\?\./);
 assert.match(html,/name="ht-build" content="v87"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v87');
});
