import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function fixture(){
 const accounts=[
  {id:'bank',name:'Yapı Kredi',type:'bank',institution_id:'yapikredi',is_pos:0,opening_kurus:825000},
  {id:'legacy-pos',name:'Yapı Kredi POS',type:'bank',institution_id:'yapikredi',is_pos:0,opening_kurus:0},
  {id:'current-pos',name:'Kuveyt Türk POS',type:'bank',institution_id:'kuveytturk',is_pos:1,opening_kurus:0},
  {id:'cash',name:'Kasa',type:'cash',opening_kurus:0}
 ];
 const state={cards:[{id:'card',credit_limit_kurus:4000000,available_limit_kurus:1000000,currency:'TRY'}],
  statements:[],payments:[],firms:[],firmMovements:[],accounts,entries:[],instruments:[],reminders:[],
  institutions:[{id:'yapikredi',type:'bank',name:'Yapı Kredi'},{id:'kuveytturk',type:'bank',name:'Kuveyt Türk'}]};
 const nodes={};
 const el=id=>nodes[id]??(nodes[id]={innerHTML:'',hidden:false,insertAdjacentHTML(){}});
 const currentBalance=id=>{
  const a=state.accounts.find(a=>a.id===id);
  return a.opening_kurus+state.entries.filter(e=>e.account_id===id)
   .reduce((sum,e)=>sum+(e.direction==='in'?e.amount_kurus:-e.amount_kurus),0);
 };
 const context={window:{},document:{addEventListener(){},querySelectorAll:()=>[]},
  state,el,currentBalance,currentRole:'admin',firmBalance:()=>({remaining:0,charges:0,settled:0}),
  money:amount=>(amount/100).toFixed(2),stat:(label,amount)=>label+':'+amount+'|',
  esc:value=>String(value),showDate:value=>value,dueList:()=>[]};
 vm.runInNewContext(read('public/overview.js'),context);
 vm.runInNewContext(read('public/core-money.js'),context);
 vm.runInNewContext(read('public/pos-v21.js'),context);
 return {state,context,nodes};
}

test('Legacy Yapı Kredi POS and flagged Kuveyt Türk POS remain distinct from ordinary bank',()=>{
 const {state,context,nodes}=fixture();
 const pos=context.window.HTPOS21.readPos(state);
 assert.deepEqual(Array.from(pos.posAccounts,x=>x.id),['legacy-pos','current-pos']);
 assert.equal(pos.posAccounts.some(x=>x.id==='bank'),false);
 context.window.HTPOS21.render();
 assert.match(nodes.v21PosList.innerHTML,/Yapı Kredi POS/);
 assert.match(nodes.v21PosList.innerHTML,/Kuveyt Türk POS/);
 assert.match(nodes.v21PosList.innerHTML,/data-suite-account-entry="legacy-pos"/);
 assert.match(nodes.v21PosList.innerHTML,/data-suite-account-entry="current-pos"/);
 context.currentRole='viewer';
 context.window.HTPOS21.render();
 assert.doesNotMatch(nodes.v21PosList.innerHTML,/data-suite-account-entry/);
});

test('Bank and cash deposits change individual balances and net overview exactly once',()=>{
 const {state,context,nodes}=fixture();
 const previous=context.window.computeFinancialOverview(state);
 state.entries.push(
  {account_id:'bank',direction:'in',category:'income',amount_kurus:25000,entry_date:'2026-11-19',note:'Banka girişi'},
  {account_id:'cash',direction:'in',category:'income',amount_kurus:1750000,entry_date:'2026-11-19',note:'Kasa girişi'},
  {account_id:'legacy-pos',direction:'in',category:'other',amount_kurus:12500,entry_date:'2026-11-19',note:'POS hesabı girişi'}
 );
 const next=context.window.computeFinancialOverview(state);
 assert.equal(context.currentBalance('bank'),850000);
 assert.equal(context.currentBalance('cash'),1750000);
 assert.equal(context.currentBalance('legacy-pos'),12500);
 assert.equal(next.cashBalance-previous.cashBalance,1787500);
 assert.equal(next.netDebt,previous.netDebt);
 assert.equal(next.netCashPosition-previous.netCashPosition,1787500);
 context.window.renderCoreOverview();
 assert.match(nodes.stats.innerHTML,/NAKİT KASAM:17500\.00/);
 assert.match(nodes.stats.innerHTML,/BANKALARDAKİ PARAM:8625\.00/);
 assert.match(nodes.stats.innerHTML,/NAKİT DAHİL NET BORÇ:3875\.00/);
 assert.match(nodes.overviewLedger.innerHTML,/Kasa ve banka bakiyesi/);
 assert.match(nodes.overviewLedger.innerHTML,/26125\.00/);
 const pos=context.window.HTPOS21.readPos(state);
 assert.equal(pos.accountAmount,12500);
 assert.equal(pos.pending,0);
});

test('Money entry form still posts to selected bank/cash account and refreshes the overview',()=>{
 const source=read('public/finance-suite.js');
 const index=read('public/index.html');
 assert.match(source,/if\(type==='entry'\)await api\('entries','POST'/);
 assert.match(source,/account_id:id,direction:d.direction/);
 assert.match(source,/el\('modal'\)\.close\(\);await load\(\)/);
 assert.match(source,/money\(currentBalance\(id\)\)/);
 assert.match(index,/pos-v21\.js\?v=53-ledger/);
 assert.match(index,/core-money\.js\?v=53-ledger/);
 assert.match(index,/finance-suite\.js\?v=53-ledger/);
});
