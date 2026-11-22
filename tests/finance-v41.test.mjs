import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function cardHelpers(st={}){
 const nodes=new Map();
 for(const id of ['htCardToday28','htCardDue41'])nodes.set(id,{innerHTML:''});
 const context={window:{},document:{getElementById:id=>nodes.get(id)},
  trDate:()=>st.date||'2026-11-18',
  showDate:date=>date,esc:x=>String(x),
  cardMoney:(amount,card)=>'₺'+(amount/100).toFixed(2),
  state:{statements:st.statements||[],payments:st.payments||[]}};
 vm.runInNewContext(read('public/cards-today-v28.js'),context);
 return {helpers:context.window.HTCardToday28,nodes};
}
const card=(id,day,limit,additional={})=>({
 id,bank:'Akbank',nickname:'Akbank '+id,card_type:'credit',
 status:'active',statement_day:day,available_limit_kurus:limit,...additional
});
test('V41 cut day 18 Nov never recommends Akbank 4468 until 19 Nov',()=>{
 const x=cardHelpers().helpers;
 const akbank=card('4468',18,11016402);
 const other=card('9999',17,300000);
 assert.equal(x.isCutoffDay(akbank,'2026-11-18'),true);
 assert.equal(x.recommend([akbank,other],'2026-11-18').id,'9999');
 assert.equal(x.recommend([akbank],'2026-11-18'),null);
 assert.equal(x.isCutoffDay(akbank,'2026-11-19'),false);
 assert.equal(x.recommend([akbank,other],'2026-11-19').id,'4468');
 assert.equal(x.recommend([akbank],'2026-11-19').last_cutoff,'2026-11-18');
});
test('V41 explicit cutoff overrides a different monthly day; handles end-of-month clamping',()=>{
 const x=cardHelpers().helpers;
 const explicit=card('special',3,50000,{current_statement_date:'2026-11-18'});
 assert.equal(x.recommend([explicit],'2026-11-18'),null);
 const end=card('monthend',31,50000);
 assert.equal(x.isCutoffDay(end,'2026-02-28'),true);
 assert.equal(x.recommend([end],'2026-02-28'),null);
 assert.equal(x.recommend([end],'2026-03-01').id,'monthend');
 const disabled=card('passive',17,200000,{status:'passive'});
 assert.equal(x.recommend([disabled],'2026-11-18'),null);
});
test('Next-payment panel prioritizes an overdue recorded statement over dates due today or later',()=>{
 const statements=[
  {id:'s1',card_id:'a',period:'2026-10',amount_kurus:1000000,due_date:'2026-11-18'},
  {id:'s2',card_id:'b',period:'2026-10',amount_kurus:225000,due_date:'2026-11-18'},
  {id:'s3',card_id:'a',period:'2026-09',amount_kurus:500000,due_date:'2026-11-15'},
  {id:'s4',card_id:'a',period:'2026-11',amount_kurus:300000,due_date:'2026-11-25'}
 ];
 const payments=[{statement_id:'s1',amount_kurus:300000},
  {statement_id:'s2',amount_kurus:225000},
  {statement_id:'s3',amount_kurus:200000}];
 const c=[{id:'a',bank:'Akbank',nickname:'4468'},
  {id:'b',bank:'Garanti',nickname:'2200'}];
 const ctx=cardHelpers({statements,payments});
 const data=ctx.helpers.dueCards(statements,payments,c,'2026-11-18');
 assert.equal(data.today.length,1);
 assert.equal(data.today[0].id,'s1');
 assert.equal(data.today[0].amount,700000);
 assert.equal(data.overdue.length,1);
 assert.equal(data.overdue[0].amount,300000);
 ctx.helpers.render(c);
 const ui=ctx.nodes.get('htCardDue41').innerHTML;
 assert.match(ui,/Sıradaki kart tarihi/);
 assert.match(ui,/Akbank · 4468/);
 assert.match(ui,/₺3000.00/);
 assert.match(ui,/3 gün gecikti/);
 assert.doesNotMatch(ui,/₺7000.00/);
 assert.doesNotMatch(ui,/Garanti · 2200/);
});
test('V41 no confirmed due statement does not invent an amount from estimated card dates',()=>{
 const c=[card('4468',18,11016402,{display_next_due_date:'2026-11-18'})];
 const ctx=cardHelpers();
 ctx.helpers.render(c);
 const ui=ctx.nodes.get('htCardDue41').innerHTML;
 assert.match(ui,/Tahmini ödeme günü/);
 assert.match(ui,/Borç tutarı kayıtlı değil/);
 assert.match(ui,/Borç tutarı kayıtlı değil/);
 assert.doesNotMatch(ui,/110164\.02|₺110164/);
});

function bankHarness(role='admin',override={}){
 const listeners={};
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{
   innerHTML:'',textContent:'',disabled:false,closed:false,
   showModal(){this.open=true;},
   close(){this.closed=true;},
   querySelector(){return null;},
   elements:{institution_id:null,is_pos:null}
  });
  return elements.get(id);
 };
 const entry={id:'entry-100',account_id:'kuveyt',direction:'in',amount_kurus:10000,
  entry_date:'2026-11-18',note:'Deneme'};
 const state={accounts:[{id:'kuveyt',type:'bank',name:'Kuveyt Türk',
  opening_kurus:0,note:''}],entries:[entry],firms:[],cards:[]};
 const calls=[];
 const ctx={state,currentRole:role,el:get,window:{
  editCashEntry(id){calls.push('edit:'+id)}
 },document:{addEventListener(name,fn){listeners[name]=fn;}},
  esc:x=>String(x),money:n=>'₺'+(n/100).toFixed(2),
  currentBalance:id=>state.entries.filter(e=>e.account_id===id).reduce((n,e)=>
   n+(e.direction==='in'?e.amount_kurus:-e.amount_kurus),0),
  showDate:d=>d,trDate:()=>'2026-11-18',
  confirm:msg=>{calls.push('confirm:'+msg);return override.confirm===undefined?true:override.confirm;},
  notice:(msg,error)=>calls.push('notice:'+msg+':'+!!error),
  api:async(path,method)=>{calls.push(method+':'+path);if(override.error)throw Error(override.error);return {ok:true}},
  load:async()=>{calls.push('load');}
 };
 vm.runInNewContext(read('public/ledger-v10.js'),ctx);
 const click=(selector,dataset)=>listeners.click({target:{
  closest:match=>match===selector?{dataset,...{
   disabled:false
  }}:null
 }});
 return {click,calls,get,state};
}
test('V41 Kuveyt Türk 100 TL correction is accessible inside bank edit modal',async()=>{
 const x=bankHarness();
 await x.click('[data-v10-account-edit]',{v10AccountEdit:'kuveyt'});
 const html=x.get('modalContents').innerHTML;
 assert.match(html,/Bakiye: <strong>₺100.00/);
 assert.match(html,/Hesap hareketleri · Düzenle \/ Sil/);
 assert.match(html,/Para girişi/);
 assert.match(html,/₺100.00/);
 assert.match(html,/data-v41-bank-entry-edit="entry-100"/);
 assert.match(html,/data-v41-bank-entry-delete="entry-100"/);
 assert.match(html,/Doğru açılış bakiyesi/);
 await x.click('[data-v41-bank-entry-edit]',{v41BankEntryEdit:'entry-100'});
 assert.ok(x.calls.includes('edit:entry-100'));
 assert.equal(x.get('modal').closed,true);
});
test('V41 only chosen bank entry is deleted after confirmation, not the account',async()=>{
 const x=bankHarness();
 await x.click('[data-v41-bank-entry-delete]',{v41BankEntryDelete:'entry-100'});
 assert.ok(x.calls.some(c=>c.includes('Kuveyt Türk')&&c.includes('₺100.00')));
 assert.ok(x.calls.includes('DELETE:entries/entry-100'));
 assert.ok(x.calls.includes('load'));
 assert.ok(!x.calls.includes('DELETE:accounts/kuveyt'));
});
test('V41 cancel, unauthorized role, and linked payment failures never delete entry',async()=>{
 const cancel=bankHarness('admin',{confirm:false});
 await cancel.click('[data-v41-bank-entry-delete]',{v41BankEntryDelete:'entry-100'});
 assert.ok(!cancel.calls.some(c=>c.startsWith('DELETE:')));
 const reader=bankHarness('viewer');
 await reader.click('[data-v41-bank-entry-delete]',{v41BankEntryDelete:'entry-100'});
 assert.ok(!reader.calls.some(c=>c.startsWith('DELETE:')));
 const linked=bankHarness('admin',{error:'Hareket bağlı firma tahsilatına ait.'});
 await linked.click('[data-v41-bank-entry-delete]',{v41BankEntryDelete:'entry-100'});
 assert.ok(linked.calls.some(c=>c.includes('notice:Hareket bağlı firma')));
 assert.ok(!linked.calls.includes('load'));
});
test('V41 cards and account editor assets loaded with correct version on iPhone and desktop',()=>{
 const html=read('public/index.html'),css=read('public/finance-v41.css');
 assert.match(html,/name="ht-build" content="v87"/);
 assert.match(html,/id="htCardDue41"/);
 assert.match(html,/cards-today-v28\.js\?v=75/);
 assert.match(html,/ledger-v10\.js\?v=75/);
 assert.match(html,/finance-v41\.css\?v=41/);
 assert.match(css,/@media\(max-width:750px\)/);
 assert.match(css,/\.v41-bank-movement-actions/);
 assert.match(css,/\.ht-card-today-header\{grid-template-columns/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v87');
});
