import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),nav=read('navigation-v18.js'),css=read('navigation-v18.css');
const ledger=read('ledger-v10.js'),app=read('app.js');

test('V58 desktop navigation exposes backup controls and preserves mobile shortcuts',()=>{
 const desktop=html.match(/<nav id="nav"[\s\S]*?<\/nav>/)?.[0]||'';
 const mobile=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 const shortcuts=html.match(/<nav class="v8-quick-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 const parts=[...desktop.matchAll(/data-v18-section="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(parts,['overview','cardbank','accounts','firms','backups','settings']);
 assert.deepEqual([...mobile.matchAll(/data-v18-section="([^"]+)"/g)].map(x=>x[1]),['overview','cardbank','accounts','firms','settings']);
 assert.match(html,/data-v18-section="backups"[^>]*>[^<]*<span>↧<\/span> Yedekleme/);
 assert.match(html,/id="backupsView"/);
 assert.match(html,/id="backupV58Connect"/);
 assert.equal((shortcuts.match(/data-v18-link=/g)||[]).length,8);
 assert.match(css,/\.v8-quick-nav\{grid-template-columns:repeat\(4/);
 for(const name of ['cards','banking','meal','platforms','people','payables','representatives','settings'])
  assert.ok(shortcuts.includes('data-v18-link="'+name+'"'),name);
 assert.match(nav,/directory:'Firma Temsilcileri'/);
 assert.match(nav,/representatives:'Temsilci İletişimi'/);
 assert.match(nav,/cardbank:\['banking','cards','meal'\]/);
 assert.match(nav,/accounts:\['collections','platforms','people'\]/);
});
test('Single + menu exposes eight daily transactions, including meal card bank receipt',()=>{
 const box=html.match(/<dialog id="quickDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
 for(const id of ['firm-charge','firm-payment','platform-sale','platform-payment',
  'card-create','card-payment','meal-sale','meal-payment'])
  assert.ok(box.includes('data-v18-quick="'+id+'"'),id);
 for(const id of ['bank-create','pos-account-create','pos-sale',
  'person-create','veresiye-create','veresiye-payment'])
  assert.ok(box.includes('data-v18-quick="'+id+'"'),id);
 assert.doesNotMatch(box,/v18-other-create/);
 assert.match(app,/el\('quickDialog'\)\.showModal/);
 assert.doesNotMatch(html.match(/<section id="cardsView"[\s\S]*?<\/section>/)?.[0]||'',
   /id="manageInstitutions"/);
 assert.match(html,/id="manageInstitutions"/);
});
test('Quick actions reuse existing forms, never directly create a financial movement',()=>{
 const elements=new Map(),calls=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',innerHTML:'',value:'',
   classList:{toggle(){}},setAttribute(){},insertAdjacentHTML(){},addEventListener(type,fn){this[type]=fn;},
   close(){this.open=false;},showModal(){this.open=true;}});
  return elements.get(id);
 };
 const state={firms:[
  {id:'meal1',name:'Setcard',category:'receivable',receivable_group:'meal'},
  {id:'platform1',name:'Getir',category:'receivable',receivable_group:'platform'},
  {id:'supplier1',name:'Gıda',category:'payable'}]};
 const ctx={window:{
  tab:name=>calls.push(['old-tab',name]),scrollTo(){},
  openSettlementForm:(...args)=>calls.push(['settlement',...args]),
  openFirmForm:(...args)=>calls.push(['firm',...args]),
  openSupplierPurchaseForm:()=>calls.push(['purchase']),
  openSuiteForm:()=>calls.push(['suite'])},
  document:{addEventListener(){},querySelectorAll(){return []},querySelector(){return null}},
  el:element,state,currentRole:'admin',
  notice:msg=>calls.push(['notice',msg]),firmBalance:()=>({remaining:150000}),
  money:n=>'₺'+(n/100),esc:x=>String(x),modal:type=>calls.push(['modal',type])};
 vm.runInNewContext(nav,ctx);
 assert.equal(ctx.window.HTV18.groupFor('directory'),'firms');
 assert.equal(ctx.window.HTV18.groupFor('meal'),'cardbank');
 assert.equal(ctx.window.HTV18.groupFor('people'),'accounts');
 assert.equal(ctx.window.HTV18.groupFor('backups'),'backups');
 ctx.window.HTV18.handleQuick('meal-payment');
 assert.match(element('modalContents').innerHTML,/Setcard/);
 element('v18FirmId').value='meal1';
 element('v18FirmPick').submit({preventDefault(){}});
 assert.ok(calls.some(x=>x[0]==='settlement'&&x[1]==='meal1'&&x[2]===true));
 ctx.window.HTV18.handleQuick('platform-payment');
 element('v18FirmId').value='platform1';
 element('v18FirmPick').submit({preventDefault(){}});
 assert.ok(calls.some(x=>x[0]==='settlement'&&x[1]==='platform1'&&x[2]===true));
 ctx.window.HTV18.handleQuick('firm-payment');
 element('v18FirmId').value='supplier1';
 element('v18FirmPick').submit({preventDefault(){}});
 assert.ok(calls.some(x=>x[0]==='settlement'&&x[1]==='supplier1'&&x[2]===false));
 ctx.window.HTV18.handleQuick('card-create');
 ctx.window.HTV18.handleQuick('card-payment');
 assert.ok(calls.some(x=>x[0]==='modal'&&x[1]==='card'));
 assert.ok(calls.some(x=>x[0]==='modal'&&x[1]==='payment'));
});
test('Required bank receipt form does not offer an unlinked payment',()=>{
 const elMap=new Map();
 const el=id=>{
  if(!elMap.has(id))elMap.set(id,{
   innerHTML:'',textContent:'',showModal(){},addEventListener(){},value:''});
  return elMap.get(id);
 };
 const ctx={window:{},document:{addEventListener(){}},state:{
  firms:[{id:'meal1',name:'Setcard',category:'receivable',receivable_group:'meal'}],
  accounts:[{id:'b1',name:'Enpara',type:'bank'},{id:'c1',name:'Kasa',type:'cash'}],
  cards:[]},currentRole:'admin',el,
  esc:x=>String(x),money:n=>String(n/100),cardMoney:n=>String(n/100),
  firmBalance:()=>({remaining:100000}),currentBalance:()=>0,
  trDate:()=>'2026-11-18',notice(){},api(){},load(){},amountValue:x=>Number(x)*100};
 vm.runInNewContext(ledger,ctx);
 ctx.window.openSettlementForm('meal1',true);
 const body=el('modalContents').innerHTML;
 assert.match(body,/select id="v10-source" name="source" required/);
 assert.match(body,/Enpara/);
 assert.doesNotMatch(body,/Nakit kasa: Kasa/);
 assert.doesNotMatch(body,/Sadece cari borcu\/alacağı düş/);
 assert.match(body,/seçtiğin bankanın bakiyesi artar/);
});
