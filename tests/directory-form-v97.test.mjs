import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizePhone} from '../src/directory.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('public/directory-v17.js');
const html=read('public/index.html');
const css=read('public/directory-form-v97.css');

function harness({failApi=null,failLoad=false}={}){
 const nodes=new Map(),requests=[],notices=[];
 const button={disabled:false};
 const form={fields:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
   querySelector(selector){assert.equal(selector,'[type="submit"]');return button;}};
 const modal={opened:false,closed:false,showModal(){this.opened=true;},close(){this.closed=true;}};
 const status={hidden:true,textContent:'',scrollIntoView(){}};
 const get=id=>{
  if(id==='dirEditForm')return form;
  if(id==='dirFormStatus')return status;
  if(id==='modal')return modal;
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',
   insertAdjacentHTML(){},onclick:null});
  return nodes.get(id);
 };
 class FakeFormData{
  constructor(target){this.entries=Object.entries(target.fields)}
  *[Symbol.iterator](){yield* this.entries}
 }
 const context={
  el:get,window:{},document:{body:{insertAdjacentHTML(){}},addEventListener(){}},
  currentRole:'admin',
  state:{directory:{companies:[],contacts:[],templates:[]},firms:[]},
  esc:s=>String(s),FormData:FakeFormData,
  api:async(...args)=>{requests.push(args);if(failApi)throw new Error(failApi);return {id:'new-id'};},
  load:async()=>{if(failLoad)throw new Error('Liste alınamadı.');},
  notice:(...args)=>notices.push(args)
 };
 vm.runInNewContext(ui,context);
 const submit=async fields=>{
  form.fields=fields;
  await form.onsubmit({preventDefault(){},currentTarget:form});
 };
 return {context,get,modal,form,status,button,requests,notices,submit};
}
const fields={
 name:'Yeni A.Ş.',phone:'+90',visit_day:'Pazartesi',linked_firm_id:'',note:'',
 contact_name:'Semih özcan',contact_phone:'+90 541 241 40 37',
 contact_visit_day:'Pazartesi'
};

test('v97 loads the fixed directory JS and inline form feedback CSS last',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v97');
 assert.match(html,/name="ht-build" content="v97"/);
 assert.match(html,/directory-v17\.js\?v=97/);
 assert.match(html,/directory-form-v97\.css\?v=97/);
 assert.ok(html.indexOf('directory-form-v97.css')>html.indexOf('hesaptakip-design-v94.css'));
 assert.doesNotThrow(()=>new vm.Script(ui));
});

test('iPhone directory phone fields permit typing spaces and keep +90 prefixes',()=>{
 const h=harness();
 h.context.window.HTDirectory.companyForm();
 const content=h.get('modalContents').innerHTML;
 assert.ok(h.modal.opened);
 for(const name of ['phone','contact_phone']){
  const tag=content.match(new RegExp('<input[^>]+name="'+name+'"[^>]*>'))?.[0];
  assert.ok(tag,'phone field '+name+' exists');
  assert.match(tag,/type="text"/);
  assert.match(tag,/inputmode="text"/);
  assert.match(tag,/autocomplete="tel"/);
  assert.doesNotMatch(tag,/inputmode="tel"|type="tel"/);
 }
 assert.match(content,/id="dirFormStatus"[^>]+role="alert"/);
 assert.match(content,/Kaydet/);
});

test('new company and contact POST are preserved; spaced phone is normalized and saved exactly once',async()=>{
 const h=harness();
 h.context.window.HTDirectory.companyForm();
 await h.submit(fields);
 assert.equal(h.requests.length,1);
 const [path,method,data]=h.requests[0];
 assert.equal(path,'directory/with-contact');
 assert.equal(method,'POST');
 assert.equal(data.name,'Yeni A.Ş.');
 assert.equal(data.phone,'');
 assert.equal(data.contact.full_name,'Semih özcan');
 assert.equal(data.contact.phone,'+90 541 241 40 37');
 assert.equal(data.contact.visit_day,'Pazartesi');
 assert.equal(data.visit_day,'Pazartesi');
 assert.equal(data.linked_firm_id,'');
 assert.ok(h.modal.closed);
 assert.equal(h.status.hidden,true);
 assert.equal(h.button.disabled,false);
 assert.equal(h.notices.length,1);
});

test('invalid phone keeps the modal open and reports an inline error without sending a request',async()=>{
 const h=harness();
 h.context.window.HTDirectory.companyForm();
 await h.submit({...fields,contact_phone:'+90 541 1'});
 assert.equal(h.requests.length,0);
 assert.equal(h.modal.closed,false);
 assert.equal(h.status.hidden,false);
 assert.match(h.status.textContent,/Kaydedilemedi: Telefon 10 haneli/);
 assert.equal(h.button.disabled,false);
 assert.equal(h.form.fields.contact_name,'Semih özcan');
});

test('API errors are visible IN the dialog and keep entered form values untouched',async()=>{
 const h=harness({failApi:'Firma veya temsilci zaten kayıtlı.'});
 h.context.window.HTDirectory.companyForm();
 await h.submit(fields);
 assert.equal(h.modal.closed,false);
 assert.equal(h.requests.length,1);
 assert.equal(h.status.hidden,false);
 assert.match(h.status.textContent,/Kaydedilemedi: Firma veya temsilci zaten kayıtlı/);
 assert.equal(h.form.fields.name,'Yeni A.Ş.');
 assert.equal(h.button.disabled,false);
});

test('missing required name shows feedback even before native form submit fires',()=>{
 const h=harness();
 h.context.window.HTDirectory.companyForm();
 assert.equal(h.status.hidden,true);
 h.form.listeners.invalid({target:{
  closest:()=>({querySelector:()=>({textContent:'Firma adı'})})
 }});
 assert.equal(h.status.hidden,false);
 assert.match(h.status.textContent,/Firma adı/);
});

test('failed post-save refresh does not misreport a successful write as a failed save',async()=>{
 const h=harness({failLoad:true});
 h.context.window.HTDirectory.companyForm();
 await h.submit(fields);
 assert.equal(h.requests.length,1);
 assert.equal(h.modal.closed,true);
 assert.equal(h.status.hidden,true);
 assert.match(h.notices.at(-1)[0],/Rehber kaydedildi, ancak liste yenilenemedi/);
});

test('representative-only edits use normal keyboard and preserve optional empty numbers',async()=>{
 const h=harness();
 // The existing +90 placeholder remains optional, including stray spaces.
 h.context.window.HTDirectory.companyForm();
 await h.submit({...fields,contact_phone:' +90  ',phone:' +90  '});
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0][2].contact.phone,'');
 assert.equal(h.requests[0][2].phone,'');
 assert.equal(normalizePhone('+90 541 241 40 37'),'+90 541 241 40 37');
});

test('the error message remains accessible and visible in dark mode',()=>{
 assert.match(css,/#modal #dirEditForm \.dir-form-status:not\(\[hidden\]\)/);
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 assert.match(css,/role="alert"/.source?ui:/role="alert"/);
 assert.match(css,/\.dir-form-status\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(css,/pointer-events\s*:\s*none/);
});
