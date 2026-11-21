import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const quick=html.match(/<dialog id="quickDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
const original=['firm-create','firm-charge','firm-payment','platform-sale','platform-payment','card-create','card-payment','meal-sale','meal-payment'];
const restored=['bank-create','pos-account-create','pos-sale','person-create','veresiye-create','veresiye-payment'];
const invoices=['bill-electricity','bill-gas','bill-water','bill-phone','bill-internet','bill-other'];
test('V52 remaining 21 shortcuts are visible in the redesigned transaction dialog',()=>{
 const ids=[...quick.matchAll(/data-v18-quick="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,21);assert.equal(new Set(ids).size,21);
 assert.ok(!ids.includes('plan-create'));
 for(const key of [...original,...restored,...invoices])assert.ok(ids.includes(key),'Missing: '+key);
 for(const title of ['Firmalar','Faturalar','Bankalar ve Kasa','POS İşlemleri','Kredi Kartları','Platformlar','Yemek Kartları','Şahıslar','Veresiye'])
  assert.ok(quick.includes(title+'</h3>'),title);
 assert.match(quick,/aria-labelledby="quickDialogTitle"/);
 assert.match(quick,/id="closeQuickDialog"/);
});
test('V51 popup styles are isolated, responsive, and cache-busted',()=>{
 const css=read('public/quick-actions-v51.css');
 assert.match(html,/quick-actions-v51\.css\?v=51/);
 assert.match(html,/navigation-v18\.js\?v=69/);
 assert.match(html,/bills-v50\.js\?v=72/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/#quickDialog \.htq-groups/);
 assert.doesNotMatch(css,/(^|\n)\s*(body|\.main|\.sidebar)\s*\{/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v73');
 assert.match(html,/name="ht-build" content="v73"/);
});
test('V51 invoice quick actions open the correct existing category forms',()=>{
 const nodes=new Map(),events=[];
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{id,value:'',innerHTML:'',textContent:'',
   classList:{toggle(){}},setAttribute(){},insertAdjacentHTML(){},addEventListener(){},
   close(){this.open=false;},open:false});
  return nodes.get(id);
 };
 const ctx={el,state:{firms:[]},currentRole:'admin',money:String,
  notice:msg=>events.push(['notice',msg]),
  document:{addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},
  window:{HTIdentity:{role:'admin'},scrollTo(){},
   tab:name=>events.push(['tab',name]),
   HTBillsV50:{openCreate:category=>events.push(['invoice',category])}}};
 vm.runInNewContext(read('public/navigation-v18.js'),ctx);
 for(const [action,category] of [
  ['bill-electricity','electricity'],['bill-gas','gas'],['bill-water','water'],
  ['bill-phone','phone'],['bill-internet','internet'],['bill-other','other']]){
  events.length=0;ctx.window.HTV18.handleQuick(action);
  assert.deepEqual(events,[['tab','bills'],['invoice',category]]);
 }
 assert.match(read('public/bills-v50.js'),/openCreate:category=>form\(null,false,category\)/);
});
test('V51 restored shortcuts reuse existing form routes',()=>{
 const nav=read('public/navigation-v18.js');
 for(const key of restored)assert.ok(nav.includes("case '"+key+"'"),key);
 assert.match(nav,/window\.openSuiteForm\('account'\)/);
 assert.ok(!quick.includes('data-v18-quick="plan-create"'));
 assert.match(nav,/selectFirm\('veresiye','sale'\)/);
 assert.match(nav,/selectFirm\('veresiye','payment'\)/);
});
