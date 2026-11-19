import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function catalogApp(state,group='payment'){
 const nodes=new Map();
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,
   innerHTML:'',textContent:''});
  return nodes.get(id);
 };
 el('v21CatalogCategory').value=group;
 el('v21CatalogManager');
 const ctx={state,currentRole:'admin',esc:x=>String(x??''),
  el:id=>id==='settingsView'?{querySelector(){return {insertAdjacentHTML(){}}}}:el(id),
  document:{addEventListener(){}},
  window:{renderSettings(){},v9ReceivablePresets:{meal:[],platform:[]}}};
 vm.runInNewContext(read('public/ux-v24.js'),ctx);
 vm.runInNewContext(read('public/catalog-v21.js'),ctx);
 return {el,ctx,ui:ctx.window.HTCatalog21};
}
const inactivePayment=[
 {id:'paytr',type:'payment',name:'PayTR',is_active:1},
 {id:'iyzico',type:'payment',name:'iyzico',is_active:1},
 {id:'garanti-odeme',type:'payment',name:'Tami / Garanti Ödeme',is_active:1},
 {id:'papara',type:'payment',name:'Papara',is_active:1},
 {id:'akbank',type:'bank',name:'Akbank',is_active:1}
];

test('V40 payment list displays selectable providers when every option is turned off',()=>{
 const state={institutions:inactivePayment,accounts:[],cards:[],firms:[],
  catalogPrefs:inactivePayment.filter(x=>x.type==='payment').map(x=>({
   group_key:'payment',item_key:x.id,display_name:x.name,enabled:0
  }))};
 const app=catalogApp(state);
 app.ui.render();
 const html=app.el('v21CatalogList').innerHTML;
 assert.match(html,/Henüz açık ödeme kuruluşun yok/);
 assert.match(html,/PayTR/);
 assert.match(html,/iyzico/);
 assert.match(html,/garanti-odeme/);
 assert.match(html,/data-v21-choice="payment"/);
 assert.doesNotMatch(html,/data-v21-choice="bank"/);
 assert.doesNotMatch(html,/checked/);
 assert.match(app.el('v21CatalogCount').textContent,/0 açık seçenek/);
 assert.equal(app.el('v21CatalogAdd').hidden,false);
 assert.equal(state.catalogPrefs.every(x=>x.enabled===0),true);
});

test('V40 enabling a payment institution returns the original selected-only catalog view',()=>{
 const state={institutions:inactivePayment,accounts:[],cards:[],firms:[],
  catalogPrefs:inactivePayment.filter(x=>x.type==='payment').map(x=>({
   group_key:'payment',item_key:x.id,enabled:x.id==='paytr'?1:0
  }))};
 const app=catalogApp(state);
 app.ui.render();
 const html=app.el('v21CatalogList').innerHTML;
 assert.doesNotMatch(html,/Henüz açık ödeme kuruluşun yok/);
 assert.match(html,/PayTR/);
 assert.doesNotMatch(html,/Papara/);
 assert.match(html,/checked/);
 assert.match(app.el('v21CatalogCount').textContent,/1 açık seçenek/);
 app.el('v21CatalogShowAll').checked=true;
 app.ui.render();
 assert.match(app.el('v21CatalogList').innerHTML,/Papara/);
 assert.doesNotMatch(app.el('v21CatalogList').innerHTML,/Henüz açık ödeme kuruluşun yok/);
});

test('V40 no actual payment institution gives a useful empty message instead of invented records',()=>{
 const app=catalogApp({institutions:inactivePayment.filter(x=>x.type==='bank'),
  cards:[],accounts:[],firms:[],catalogPrefs:[]});
 app.ui.render();
 assert.match(app.el('v21CatalogList').innerHTML,/Henüz kayıtlı ödeme kuruluşu bulunamadı/);
 assert.doesNotMatch(app.el('v21CatalogList').innerHTML,/data-v21-choice="payment"/);
});

test('V40 bank and payment institutions with identical names remain separate and selectable',()=>{
 const state={accounts:[],cards:[],firms:[],catalogPrefs:[],
  institutions:[
   {id:'bank-a',name:'Örnek POS',type:'bank',is_active:1},
   {id:'payment-a',name:'Örnek POS',type:'payment',is_active:1,is_custom:1},
   {id:'payment-b',name:'örnek pos',type:'payment',is_active:1,is_custom:1}
  ]};
 const app=catalogApp(state);
 assert.equal(app.ctx.window.HTInstitution24.duplicates(state.institutions).length,1);
 const unique=app.ctx.window.HTInstitution24.uniqueInstitutions(state.institutions);
 assert.deepEqual([...unique].map(x=>x.id),['bank-a','payment-a']);
 assert.equal(app.ui.sourceRows('bank').length,1);
 assert.equal(app.ui.sourceRows('payment').length,1);
});

test('V40 yellow duplicate warning is removed while duplicate record data remains untouched',()=>{
 let removed=false;
 const old={remove(){removed=true;}};
 const state={institutions:[{id:'paytr',type:'payment',name:'PayTR'},
  {id:'paytr-copy',type:'payment',name:'paytr'}],cards:[],accounts:[],firms:[]};
 const ctx={state,el:id=>id==='v24DuplicateWarning'?old:null,
  window:{renderSettings(){}},document:{createElement(){throw Error('Yellow banner must not be created');}}};
 vm.runInNewContext(read('public/ux-v24.js'),ctx);
 ctx.window.HTInstitution24.showDuplicates();
 assert.equal(removed,true);
 assert.equal(ctx.window.HTInstitution24.duplicates(state.institutions).length,1);
 assert.equal(state.institutions.length,2);
 assert.doesNotMatch(read('public/ux-v24.js'),/Tekrarlanan kuruluş adı tespit edildi/);
 assert.doesNotMatch(read('public/ux-v24.css'),/v24-duplicates-hint/);
});

test('V40 versioned settings assets are consistent and stored financial information is untouched',()=>{
 const html=read('public/index.html'),version=JSON.parse(read('public/version.json'));
 assert.equal(version.version,'v55');
 assert.match(html,/name="ht-build" content="v55"/);
 assert.match(html,/catalog-v21\.js\?v=40/);
 assert.match(html,/catalog-v21\.css\?v=40/);
 assert.match(html,/ux-v24\.js\?v=40/);
 const catalog=read('public/catalog-v21.js');
 assert.doesNotMatch(catalog,/DELETE FROM|DROP TABLE|UPDATE firms|UPDATE cash_accounts/);
});
