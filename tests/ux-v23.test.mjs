import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {workflowSchema,supplierArchiveRoute} from '../src/workflows-v22.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const content=read('public/workflows-v22.js');
const ID='10000000-0000-4000-8000-000000000001';
function request(path,body={},method='POST'){
 return new Request('https://example.test/api/'+path,{
  method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
function DBMock({category='payable',archived=false,archiveRows=[]}={}){
 const queries=[];
 const DB={prepare(sql){
  const rec={sql,binds:[]};queries.push(rec);
  return {
   bind(...args){rec.binds=args;return this;},
   async first(){
    if(sql.includes('FROM firms WHERE id='))return {id:ID,name:'Eminevim',category,receivable_group:'general'};
    if(sql.includes('SELECT firm_id FROM archived_suppliers'))return archived?{firm_id:ID}:null;
    return null;
   },
   async all(){return {results:archiveRows};},
   async run(){return {meta:{changes:1}};}
  };
 }};
 return {DB,queries};
}
test('Payable firm with movements is archived without deleting accounting history',async()=>{
 const {DB,queries}=DBMock();
 const response=await supplierArchiveRoute(request('supplier-archive',{
  firm_id:ID,firm_name:'Eminevim',confirmation:'KALDIR'
 }),{DB},'/api/supplier-archive','POST','admin');
 assert.deepEqual(response,{ok:true,archived:true});
 assert.ok(queries.some(q=>q.sql.includes('INSERT INTO archived_suppliers')&&q.binds[1]==='Eminevim'));
 assert.ok(queries.every(q=>!/DELETE FROM (firms|firm_movements|cash_entries|payments|linked_settlements)/i.test(q.sql)));
 assert.ok(workflowSchema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS archived_suppliers')));
 assert.match(read('src/firms.js'),/AND id NOT IN \(SELECT firm_id FROM archived_suppliers\)/);
 assert.match(read('src/firms.js'),/AND firm_id NOT IN \(SELECT firm_id FROM archived_suppliers\)/);
});

test('Archiving cannot bypass administrator role, exact firm name, or supplier type',async()=>{
 const {DB}=DBMock();
 const path='/api/supplier-archive';
 const body={firm_id:ID,firm_name:'Eminevim',confirmation:'KALDIR'};
 await assert.rejects(()=>supplierArchiveRoute(request('supplier-archive',body),{DB},path,'POST','viewer'),/yalnız yöneticiye/);
 await assert.rejects(()=>supplierArchiveRoute(request('supplier-archive',{...body,confirmation:'1453'}),{DB},path,'POST','admin'),/onayı geçersiz/);
 await assert.rejects(()=>supplierArchiveRoute(request('supplier-archive',{...body,firm_name:'Başka firma'}),{DB},path,'POST','admin'),/onayı geçersiz/);
 const other=DBMock({category:'receivable'});
 await assert.rejects(()=>supplierArchiveRoute(request('supplier-archive',body),{DB:other.DB},path,'POST','admin'),/yalnız borç/);
 const duplicate=DBMock({archived:true});
 await assert.rejects(()=>supplierArchiveRoute(request('supplier-archive',body),{DB:duplicate.DB},path,'POST','admin'),/zaten arşivde/);
});

test('Archived payable firm can be listed and restored without changing movements',async()=>{
 const {DB,queries}=DBMock({archiveRows:[{firm_id:ID,firm_name:'Eminevim'}]});
 const list=await supplierArchiveRoute(new Request('https://example.test/api/supplier-archive'),
  {DB},'/api/supplier-archive','GET','admin');
 assert.equal(list.archivedSuppliers[0].firm_name,'Eminevim');
 const restored=await supplierArchiveRoute(request('supplier-archive/'+ID+'/restore',{}),
  {DB},'/api/supplier-archive/'+ID+'/restore','POST','admin');
 assert.equal(restored.ok,true);
 assert.ok(queries.some(q=>q.sql==='DELETE FROM archived_suppliers WHERE firm_id=?'));
 assert.ok(queries.every(q=>!/DELETE FROM (firms|firm_movements|cash_entries)/.test(q.sql)));
 assert.match(content,/data-v23-supplier-restore/);
 assert.match(content,/data-v23-archive-refresh/);
});

test('Eminevim delete button triggers archive with confirmation, no legacy hard-delete',async()=>{
 const events=[];
 const data={firms:[{id:ID,name:'Eminevim',category:'payable',receivable_group:'general'}],
  accounts:[],firmProfiles:[],directory:{companies:[],contacts:[]}};
 const calls=[],prompts=[],notifications=[];
 const context={
  state:data,
  currentRole:'admin',
  el:()=>null,esc:String,
  firmBalance:()=>({remaining:200000}),
  money:n=>n/100+' TL',
  confirm:text=>{prompts.push(text);return true;},
  api:async (...args)=>{calls.push(args);return {ok:true};},
  load:async()=>{},
  notice:text=>notifications.push(text),
  document:{addEventListener:(name,cb,capture)=>events.push({name,cb,capture})},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){}},
  Intl,Date
 };
 vm.runInNewContext(content,context);
 await context.window.HTV22.archiveSupplier(ID);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'supplier-archive');
 assert.equal(calls[0][1],'POST');
 assert.equal(calls[0][2].firm_name,'Eminevim');
 assert.equal(calls[0][2].confirmation,'KALDIR');
 assert.match(prompts[0],/Kalan borç: 2000 TL/);
 assert.match(notifications.at(-1),/geçmişi korundu/);
 const handler=events.find(e=>e.name==='click'&&e.capture===true)?.cb;
 assert.ok(handler);
 let prevented=false,stopped=false;
 handler({
  target:{closest:sel=>sel==='[data-firm-delete]'?{dataset:{firmDelete:ID}}:null},
  preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}
 });
 assert.equal(prevented,true);
 assert.equal(stopped,true);
});

test('Screenshot: pending ₺78.172,62 + bank ₺1.500,00 = headline ₺79.672,62',()=>{
 const elements={v22BankTotalValues:{innerHTML:''}};
 const accounts=[{id:'b1',type:'bank',name:'Akbank',opening_kurus:150000}];
 const fmt=n=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100)+' ₺';
 const ctx={state:{accounts},el:id=>elements[id]||null,esc:String,
  currentBalance:id=>id==='b1'?150000:0,
  money:fmt,currentRole:'admin',document:{addEventListener(){}},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){},
   HTPOS21:{readPos:()=>({posAccounts:[],pending:7817262})}},
  Intl,Date};
 vm.runInNewContext(content,ctx);
 ctx.window.HTV22.renderBankTotal();
 const html=elements.v22BankTotalValues.innerHTML;
 assert.match(html,/79\.672,62 ₺/);
 assert.match(html,/78\.172,62 ₺/);
 assert.match(html,/1\.500,00 ₺/);
 assert.match(html,/Bekleyen: 78\.172,62 ₺/);
 assert.ok(html.indexOf('v22-grand-total')<html.indexOf('v23-pos-first'));
 assert.ok(html.indexOf('v23-pos-first')<html.indexOf('v23-bank-second'));
 assert.match(read('public/workflows-v22.css'),/\.v22-bank-total-values>\.v22-grand-total\{grid-column:1\/-1\}/);
});

test('Bank receipts are never counted twice: on settlement only the source changes',()=>{
 const accounts=[{id:'bank',type:'bank',name:'Akbank'},
  {id:'pos-account',type:'bank',name:'POS Tahsilat'}];
 const elements={v22BankTotalValues:{innerHTML:''}};
 let bank=150000,awaiting=7817262;
 const ctx={state:{accounts},el:id=>elements[id]||null,esc:String,
  currentBalance:id=>id==='bank'?bank:0,
  money:n=>n.toString(),currentRole:'admin',document:{addEventListener(){}},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){},
   HTPOS21:{readPos:()=>({posAccounts:[accounts[1]],pending:awaiting})}},
  Intl,Date};
 vm.runInNewContext(content,ctx);
 ctx.window.HTV22.renderBankTotal();
 assert.match(elements.v22BankTotalValues.innerHTML,/7967262/);
 bank+=200000;awaiting-=200000;
 ctx.window.HTV22.renderBankTotal();
 assert.match(elements.v22BankTotalValues.innerHTML,/7967262/);
});
