import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/core-money.js',import.meta.url),'utf8');

function renderWith(balances){
  const nodes={};
  const p={
    netDebt:384503819, netCashPosition:-381928819, cashBalance:2575000,
    cardDebtTry:373656245, firmPayable:79700000, firmReceivable:68852426,
    supplierCredit:0, firmItems:[], income:0, expenses:0, cardsCount:8
  };
  Object.assign(p,balances);
  const context={
    document:{addEventListener(){}},
    window:{computeFinancialOverview:()=>p},
    state:{firms:[],accounts:[{id:'bank',type:'bank'},{id:'cash',type:'cash'}]},
    currentBalance:id=>id==='bank'?825000:1750000,
    firmBalance:()=>({remaining:0}),
    money:n=>(n/100).toFixed(2),
    stat:(label,amount)=>label+':'+amount+'|',
    esc:value=>String(value),
    el:id=>nodes[id]??(nodes[id]={innerHTML:''}),
    dueList:()=>[],
    showDate:value=>value
  };
  vm.runInNewContext(source,context);
  context.window.renderCoreOverview();
  return {nodes,p};
}

test('Net borçta 25.750 TL kasa/banka bir kez düşülür, brüt borç korunur',()=>{
  const {nodes,p}=renderWith();
  assert.equal(p.netDebt,384503819);
  assert.equal(p.cashBalance,2575000);
  assert.equal(-p.netCashPosition,381928819);
  assert.match(nodes.stats.innerHTML,/NAKİT DAHİL NET BORÇ:3819288\.19/);
  assert.match(nodes.overviewLedger.innerHTML,/Nakit hariç net borç/);
  assert.match(nodes.overviewLedger.innerHTML,/3845038\.19/);
  assert.match(nodes.overviewLedger.innerHTML,/Kasa ve banka bakiyesi/);
  assert.match(nodes.overviewLedger.innerHTML,/25750\.00/);
  assert.match(nodes.overviewLedger.innerHTML,/3819288\.19/);
  assert.match(nodes.overviewCash.innerHTML,/bekleyen POS tutarları ayrıca eklenmez/);
});

test('Nakit dahil sonuç alacağa döndüğünde doğru işaretle gösterilir',()=>{
  const {nodes}=renderWith({netDebt:2574000,netCashPosition:1000});
  assert.match(nodes.stats.innerHTML,/NAKİT DAHİL NET ALACAK:10\.00/);
  assert.match(nodes.overviewLedger.innerHTML,/NAKİT DAHİL NET ALACAK/);
});
