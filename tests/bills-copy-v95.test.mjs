import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('public/bills-v50.js');
const css=read('public/bills-subscription-copy-v95.css');
const html=read('public/index.html');
const mkBill=extra=>({
 id:'9fa7e800-0000-4000-8000-000000000001',
 category:'gas',provider:'İGDAŞ',subscription_no:'000500800226385',
 invoice_no:'2026-11',period:'2026-11',issue_date:'2026-11-01',
 due_date:'2026-11-23',amount_kurus:100,paid_kurus:0,paid_on:null,note:'',
 ...extra
});
function createHarness({role='viewer',clipboard=true,execResult=true,records=[mkBill()]}={}){
 const callbacks={},elements=new Map(),copied=[],notices=[],apiCalls=[],selected=[];
 const view={addEventListener(type,fn){callbacks[type]=fn}};
 const add={addEventListener(type,fn){callbacks['addAction.'+type]=fn},hidden:false,textContent:''};
 const el=id=>{
  if(id==='billsView')return view;
  if(id==='addAction')return add;
  if(!elements.has(id)){
   const value=(id==='v50BillCategory'||id==='v50BillStatus')?'all':'';
   elements.set(id,{value,innerHTML:'',textContent:'',hidden:false,
    addEventListener(){}});
  }
  return elements.get(id);
 };
 const temp={value:'',focus(){},select(){selected.push(this.value);},remove(){},
  setAttribute(){},style:{}};
 const navigator=clipboard?{clipboard:{async writeText(value){copied.push(value);}}}:{};
 const document={createElement(name){assert.equal(name,'textarea');return temp;},
  body:{appendChild(){}},execCommand(name){assert.equal(name,'copy');return execResult;}};
 const context={
  window:{HTIdentity:{role},tab(){}},el,navigator,document,
  state:{bills:records},activeTab:'bills',
  trDate:()=> '2026-11-23',dayDifference:()=>0,
  money:cents=>'₺'+String(Number(cents)/100),
  showMonth:m=>m,showDate:d=>d,
  notice:(message,error=false)=>notices.push({message,error}),
  api:async(...args)=>{apiCalls.push(args);return {};},
  load:async()=>{},
  confirm:()=>false,
  esc:v=>String(v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))
 };
 vm.runInNewContext(ui,context,{filename:'bills-v50.js'});
 return {view,el,callbacks,context,copied,notices,apiCalls,selected};
}
const click=(h,id)=>h.callbacks.click({
 target:{closest(selector){return selector==='[data-v95-sub-copy]'?
   {dataset:{v95SubCopy:id}}:null;}}
});

test('v95 loads after v94 and busts cached bill JavaScript',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v95');
 assert.match(html,/name="ht-build" content="v95"/);
 assert.match(html,/bills-v50\.js\?v=95/);
 assert.match(html,/bills-subscription-copy-v95\.css\?v=95/);
 assert.ok(html.indexOf('/bills-subscription-copy-v95.css')>
  html.indexOf('/hesaptakip-design-v94.css'));
 assert.doesNotThrow(()=>new vm.Script(ui));
});

test('every invoice with a subscription gets a copy button, including read-only viewing',()=>{
 const h=createHarness({role:'viewer',records:[
  mkBill({id:'one'}),mkBill({id:'two',subscription_no:'20800759'}),
  mkBill({id:'three',subscription_no:''})
 ]});
 h.context.window.HTBillsV50.render();
 const markup=h.el('v50BillList').innerHTML;
 assert.equal((markup.match(/data-v95-sub-copy=/g)||[]).length,2);
 assert.match(markup,/data-v95-sub-copy="one"/);
 assert.match(markup,/data-v95-sub-copy="two"/);
 assert.match(markup,/Abonelik: <span class="v95-bill-sub-number">000500800226385<\/span>/);
 assert.doesNotMatch(markup,/data-v50-edit/);
 assert.doesNotMatch(markup,/data-v95-sub-copy="three"/);
});

test('tapping Kopyala copies the EXACT subscriber identifier, preserving leading zeros',async()=>{
 const source=mkBill(),h=createHarness({records:[source]});
 await click(h,source.id);
 assert.deepEqual(h.copied,['000500800226385']);
 assert.match(h.notices[0].message,/kopyalandı/);
 assert.match(h.notices[0].message,/Banka uygulamasında/);
 assert.deepEqual(h.apiCalls,[]);
 assert.equal(source.paid_kurus,0);
 assert.equal(source.amount_kurus,100);
 assert.equal(source.paid_on,null);
});

test('fallback copy works where Clipboard API is unavailable',async()=>{
 const source=mkBill({subscription_no:'000000021'}),h=createHarness({clipboard:false,records:[source]});
 await click(h,source.id);
 assert.deepEqual(h.selected,['000000021']);
 assert.equal(h.notices.at(-1).error,false);
 assert.equal(h.apiCalls.length,0);
});

test('unsupported copy APIs surface an error without claiming success or changing payments',async()=>{
 const source=mkBill(),h=createHarness({clipboard:false,execResult:false,records:[source]});
 await click(h,source.id);
 assert.equal(h.notices[0].error,true);
 assert.match(h.notices[0].message,/kopyalanamadı/);
 assert.equal(h.apiCalls.length,0);
 assert.equal(source.paid_kurus,0);
});

test('CSS keeps the copy button accessible in mobile dark and light themes',()=>{
 assert.match(css,/#billsView \.v95-bill-subscription/);
 assert.match(css,/#appPage #billsView \.v95-bill-copy/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:365px\)/);
 assert.match(css,/focus-visible/);
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 assert.doesNotMatch(css,/visibility\s*:\s*hidden|pointer-events\s*:\s*none|display\s*:\s*none/);
});


test('safety gate permits UI-only builds but still requires D1 restore checks for API/schema changes',()=>{
 const workflow=read('.github/workflows/deploy-cloudflare.yml');
 assert.match(workflow,/fetch-depth:\s*0/);
 assert.match(workflow,/- name: Classify UI-only release/);
 assert.match(workflow,/BEFORE_SHA:\s*\$\{\{ github\.event\.before \}\}/);
 assert.match(workflow,/git diff --name-only "\$BEFORE_SHA" "\$GITHUB_SHA"/);
 assert.match(workflow,/public\/\*\|tests\/\*\|\.github\/workflows\/deploy-cloudflare\.yml/);
 assert.match(workflow,/if: steps\.release_scope\.outputs\.ui_only != 'true'/);
 assert.match(workflow,/wrangler d1 time-travel info karttakip-db --json/);
 assert.match(workflow,/wrangler d1 time-travel info karttakip-db --timestamp=/);
 assert.ok(workflow.indexOf('Classify UI-only release')<
  workflow.indexOf('Verify recoverable D1 state before deployment'));
 assert.ok(workflow.indexOf('Verify recoverable D1 state before deployment')<
  workflow.indexOf('Deploy to Cloudflare'));
 const isUiOnly=files=>files.length>0&&files.every(file=>
  file.startsWith('public/')||file.startsWith('tests/')||
  file==='.github/workflows/deploy-cloudflare.yml');
 assert.equal(isUiOnly(['public/index.html','public/bills-v50.js',
  'public/bills-subscription-copy-v95.css','tests/bills-copy-v95.test.mjs',
  '.github/workflows/deploy-cloudflare.yml']),true);
 for(const path of ['src/bills.js','migrations/0001_init.sql','wrangler.jsonc',
  'package.json','src/index.js']){
  assert.equal(isUiOnly(['public/index.html',path]),false);
 }
});
