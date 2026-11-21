import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/ui-v8.css',import.meta.url),'utf8');
const code=readFileSync(new URL('../public/ui-v8.js',import.meta.url),'utf8');
const overview=readFileSync(new URL('../public/overview.js',import.meta.url),'utf8');
function testEnv(state) {
 const dom=new Map(),handlers={};
 const el=id=>{
  if(!dom.has(id))dom.set(id,{hidden:false,innerHTML:'',textContent:'',value:'',attrs:{},
   classList:{toggle(){},add(){},remove(){},contains(){return false}},
   setAttribute(k,v){this.attrs[k]=v;},closest(){return null;}});
  return dom.get(id);
 };
 const context={window:{renderCoreMoney(){},renderCoreOverview(){}},
  state,document:{addEventListener(name,fn){handlers[name]=fn;},querySelectorAll(){return []}},
  el,money:cents=>'₺'+(Number(cents)/100).toFixed(2),
  trDate:()=>'2026-11-18',
  firmBalance:id=>{
   const moves=(state.firmMovements||[]).filter(x=>x.firm_id===id);
   const charges=moves.filter(x=>x.kind==='charge').reduce((n,x)=>n+x.amount_kurus,0);
   const settled=moves.filter(x=>x.kind==='settlement').reduce((n,x)=>n+x.amount_kurus,0);
   return {charges,settled,remaining:charges-settled};
  },
  showDate:s=>s?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):'',
  esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  tab(){},Intl,Date};
 vm.runInNewContext(overview,context);
 vm.runInNewContext(code,context);
 return {dom,el,window:context.window,selectAccount(section){
  handlers.click({target:{closest(selector){return selector==='[data-v8-accounts]'?{dataset:{v8Accounts:section}}:null;}}});
 }};
}
const sample=()=>({
 cards:[{id:'c',bank:'Akbank',nickname:'Kredi Kartım',credit_limit_kurus:100000,
   available_limit_kurus:39100,currency:'TRY',card_type:'credit'}],
 statements:[],payments:[],
 firms:[{id:'p',name:'Tedarikçi',category:'payable'},
  {id:'r',name:'Getir',category:'receivable',receivable_group:'platform'},
  {id:'m',name:'Edenred',category:'receivable',receivable_group:'meal'},
  {id:'u',name:'Usmar Market (.com)',category:'receivable',receivable_group:'platform'}],
 firmMovements:[
  {firm_id:'p',kind:'charge',amount_kurus:50000,on_date:'2026-11-16'},
  {firm_id:'r',kind:'charge',amount_kurus:30000,on_date:'2026-11-16'},
  {firm_id:'m',kind:'charge',amount_kurus:20000,on_date:'2026-11-16'},
  {firm_id:'u',kind:'charge',amount_kurus:0,on_date:'2026-11-16'}],
 entries:[{id:'e',account_id:'b',entry_date:'2026-11-17',direction:'in',category:'income',amount_kurus:60000}],
 accounts:[{id:'b',type:'bank',name:'İşbankası',opening_kurus:80000}],
 instruments:[],reminders:[]
});
test('The screenshot design is implemented in the real app with its own styling and behavior',()=>{
 assert.match(html,/ui-v8\.css/);assert.match(html,/ui-v8\.js/);
 for(const id of ['v8Dashboard','v8MonthlyChart','v8RecentTransactions','v8TotalDebt',
 'v8TotalReceivable','v8MealPanel','v8MealAccounts','v8AccountSearch','v8AccountsList'])
 assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(css,/\.v8-net-hero/);
 assert.match(css,/\.v8-food-visual/);
 assert.match(css,/\.v8-account-row/);
 assert.match(css,/\.mobile-bottom-nav/);
});
test('Financial dashboard subtracts the recorded 1400 TRY bank balance from 609 TRY debt',()=>{
 const view=testEnv(sample());view.window.renderCoreOverview();
 assert.match(view.el('v8NetLabel').textContent,/Net genel alacak/);
 assert.match(view.el('v8NetValue').textContent,/791\.00/);
 assert.match(view.el('v8TotalDebt').textContent,/1109\.00/);
 assert.match(view.el('v8TotalReceivable').textContent,/500\.00/);
 assert.match(view.el('v8MonthLabel').textContent,/2026/);
 assert.match(view.el('v8RecentTransactions').innerHTML,/Getir|Tedarikçi|İşbankası/);
 assert.doesNotMatch(code,/128.450,00|96.420,00|158.300,00/);
});
test('USMAR cash 1000 TL and Enpara 1010 TL reduce main net debt by 2010 TL exactly once',()=>{
 const state=sample();
 state.cards[0].credit_limit_kurus=700000;
 state.accounts=[
  {id:'enpara',type:'bank',name:'Enpara Bireysel',opening_kurus:101000},
  {id:'usmar',type:'cash',name:'USMAR Market Kasa',opening_kurus:100000}
 ];
 state.entries=[];
 const view=testEnv(state);
 const rawDebt=60900+600000; // 6609 TL: card debt plus matched supplier/receivable balances
 const openingCash=201000;
 view.window.renderCoreOverview();
 assert.equal(rawDebt-openingCash,459900);
 assert.equal(view.el('v8NetLabel').textContent,'Net genel borç');
 assert.equal(view.el('v8NetValue').textContent,'₺4599.00');
 assert.match(view.el('v8NetDescription').textContent,/kasa\/banka bakiyesi/);
 assert.equal(view.el('v8TotalDebt').textContent,'₺7109.00');
 assert.equal(view.el('v8TotalReceivable').textContent,'₺500.00');
 state.entries.push({id:'new-bank',account_id:'enpara',direction:'in',category:'income',amount_kurus:30000,entry_date:'2026-11-19'});
 view.window.renderCoreOverview();
 assert.equal(view.el('v8NetValue').textContent,'₺4299.00');
 state.entries.push({id:'new-cash',account_id:'usmar',direction:'in',category:'income',amount_kurus:25000,entry_date:'2026-11-19'});
 view.window.renderCoreOverview();
 assert.equal(view.el('v8NetValue').textContent,'₺4049.00');
 assert.equal(state.accounts[0].opening_kurus,101000);
 assert.equal(state.accounts[1].opening_kurus,100000);
});
test('Monthly chart is based on actual ledger income and expenditure',()=>{
 const view=testEnv(sample());view.window.renderCoreOverview();
 assert.match(view.el('v8MonthlyChart').innerHTML,/v8-chart-bar v8-income/);
 assert.match(view.el('v8MonthlyChart').innerHTML,/Kas/);
 assert.match(view.el('v8MonthlyChart').attrs['aria-label'],/₺600\.00/);
});
test('Food cards reflect receivable accounts and do not invent spending or card balances',()=>{
 const view=testEnv(sample());view.window.renderCoreMoney();
 assert.match(view.el('v8MealAccounts').innerHTML,/Edenred/);
 assert.match(view.el('v8MealAccounts').innerHTML,/200\.00/);
 assert.match(view.el('v8MealAccounts').innerHTML,/data-core-settle/);
 assert.doesNotMatch(view.el('v8MealAccounts').innerHTML,/Getir/);
});
test('Accounts tab lists actual platforms and keeps suppliers separate',()=>{
 const view=testEnv(sample());view.selectAccount('platforms');view.window.renderCoreMoney();
 const content=view.el('v8AccountsList').innerHTML;
 assert.match(content,/Getir/);assert.match(content,/Usmar Market/);
 assert.doesNotMatch(content,/Tedarikçi/);
 assert.match(content,/Edenred/);
});
test('Empty state never invents balances, transactions or chart figures',()=>{
 const empty={cards:[],statements:[],payments:[],firms:[],firmMovements:[],
   entries:[],accounts:[],instruments:[],reminders:[]};
 const view=testEnv(empty);view.selectAccount('platforms');view.window.renderCoreMoney();view.window.renderCoreOverview();
 assert.match(view.el('v8MonthlyChart').innerHTML,/Henüz aylık/);
 assert.match(view.el('v8AccountsList').innerHTML,/kayıt bulunmuyor/);
 assert.match(view.el('v8MealAccounts').innerHTML,/Henüz yemek kartı/);
});
