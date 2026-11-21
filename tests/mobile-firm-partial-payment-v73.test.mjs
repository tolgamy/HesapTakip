import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../public/ledger-v10.js',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../public/approved-ui-v70.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

function createHarness(category='payable'){
 let remaining=70000000;
 const calls=[],notices=[];
 const amountField={value:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},focus(){}};
 const full={listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
 const preview={textContent:''},warning={hidden:false,textContent:''};
 const form={onsubmit:null,querySelector:()=>({disabled:false})};
 const modal={showModal(){this.open=true;},close(){this.open=false;}};
 const nodes={
  modalTitle:{textContent:''},modalContents:{innerHTML:''},modal,
  'v10-amount':amountField,'v24OverpayWarning':warning,
  v73RemainingPreview:preview,v73FillFullDebt:full,v10SettleForm:form
 };
 const el=id=>nodes[id]??null;
 class FakeFormData {
  constructor(){this.entries=[['amount',amountField.value],['date','2026-11-21'],
    ['source','account:bank-1'],['note','Kısmi ödeme']];}
  [Symbol.iterator](){return this.entries[Symbol.iterator]();}
 }
 const context={
  window:{}, document:{addEventListener(){}}, currentRole:'admin',
  state:{firms:[{id:'firm-1',name:'Eminevim',category}],accounts:[{
    id:'bank-1',name:'Banka',type:'bank'}],cards:[]},
  el,esc:x=>String(x),money:n=>(n/100).toFixed(2),firmBalance:()=>({remaining}),
  currentBalance:()=>100000000,trDate:()=> '2026-11-21',FormData:FakeFormData,
  amountValue(raw){const n=Number(String(raw||'').replace(',','.'));if(!Number.isFinite(n)||n<=0)throw Error('Tutar gerekli');return Math.round(n*100);},
  async api(path,method,payload){calls.push({path,method,payload});return {};},
  async load(){if(calls.length)remaining-=calls.at(-1).payload.amount_kurus;},
  notice:msg=>notices.push(msg),
  confirm:()=>{throw Error('Unexpected confirmation for partial payment');}
 };
 vm.runInNewContext(src,context);
 return {context,nodes,form,full,warning,preview,amountField,calls,notices,remaining:()=>remaining};
}

test('Mobile firm cards have a direct partial-payment action (no New Transaction page)',()=>{
 assert.match(mobile,/button\('Kısmi Öde','data-firm-settle',String\(f\.id\)\)/);
 assert.match(html,/approved-ui-v70\.js\?v=74/);
 assert.match(html,/ledger-v10\.js\?v=75/);
 assert.match(src,/window\.openSettlementForm=settlementForm/);
});

test('700000 TL Eminevim balance opens with a blank editable amount and live remaining',async()=>{
 const h=createHarness();
 h.context.window.openSettlementForm('firm-1');
 const markup=h.nodes.modalContents.innerHTML;
 assert.match(markup,/v10SettleForm/);
 assert.match(markup,/id="v10-amount"[^>]*value=""/);
 assert.match(markup,/v73RemainingPreview/);
 assert.match(markup,/v10-source/);
 assert.equal(h.amountField.value,'');
 h.amountField.value='100000';
 h.amountField.listeners.input();
 assert.match(h.preview.textContent,/600000\.00/);
 assert.equal(h.warning.hidden,true);
 await h.form.onsubmit({preventDefault(){},currentTarget:h.form});
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].path,'settlements');
 assert.equal(h.calls[0].payload.firm_id,'firm-1');
 assert.equal(h.calls[0].payload.amount_kurus,10000000);
 assert.equal(h.calls[0].payload.account_id,'bank-1');
 assert.equal(h.remaining(),60000000);
 assert.match(h.notices.at(-1),/600000\.00/);
});

test('Full payment is still available explicitly; receivables retain existing preset',()=>{
 const h=createHarness();
 h.context.window.openSettlementForm('firm-1');
 h.full.listeners.click();
 assert.equal(h.amountField.value,'700000.00');
 assert.match(h.preview.textContent,/0\.00/);
 const income=createHarness('receivable');
 income.context.window.openSettlementForm('firm-1');
 assert.match(income.nodes.modalContents.innerHTML,/value="700000\.00"/);
});
