import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseBill,billsSchema,billsRoute} from '../src/bills.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base={
 category:'electricity',provider:'Elektrik Şirketi',subscription_no:'100204',
 invoice_no:'NOV-22',period:'2026-11',issue_date:'2026-11-01',due_date:'2026-11-22',
 amount_kurus:205000,paid_kurus:0,paid_on:null,note:'Dükkan'
};
test('V50 bills table and routes are isolated from company movement tables',()=>{
 assert.ok(billsSchema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS utility_bills')));
 assert.ok(billsSchema.every(sql=>!sql.includes('DROP TABLE')));
 assert.match(read('src/index.js'),/\.\.\.billsSchema/);
 assert.match(read('src/index.js'),/billsRoute\(request,env,path,method\)/);
 assert.match(read('public/index.html'),/id="billsView"/);
 assert.match(read('public/navigation-v18.js'),/bills:'Faturalar'/);
 assert.match(read('public/app.js'),/bills:bills\.bills/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v60');
});
test('V50 validates bill categories, dates and partial payments',()=>{
 assert.equal(parseBill(base).paid_kurus,0);
 assert.equal(parseBill({...base,paid_kurus:50000,paid_on:'2026-11-15'}).paid_kurus,50000);
 assert.throws(()=>parseBill({...base,category:'x'}),/Fatura türü/);
 assert.throws(()=>parseBill({...base,amount_kurus:100,paid_kurus:101,paid_on:'2026-11-15'}),/aşamaz/);
 assert.throws(()=>parseBill({...base,paid_kurus:1,paid_on:null}),/Tarih/);
 assert.throws(()=>parseBill({...base,due_date:'2026-10-31'}),/önce olamaz/);
 assert.throws(()=>parseBill({...base,period:'2026-13'}),/Dönem/);
});
test('V50 creates an invoice without adding an automatic bank transaction',async()=>{
 const writes=[],db={prepare(sql){return {bind(...values){
  return {run:async()=>{writes.push({sql,values})},first:async()=>({id:'x'})};
 },all:async()=>({results:[]})};}};
 const request=new Request('https://example.test/api/bills',
  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)});
 await billsRoute(request,{DB:db},'/api/bills','POST');
 assert.equal(writes.length,1);
 assert.match(writes[0].sql,/INSERT INTO utility_bills/);
 assert.doesNotMatch(writes[0].sql,/firm_movements|cash_entries|payments/);
 assert.ok(writes[0].values.includes(205000));
});
test('V50 next-month rollover clamps dates and correctly detects payment states',()=>{
 const elements=new Map(),el=id=>{
  if(!elements.has(id))elements.set(id,{addEventListener(){},value:'',hidden:false});
  return elements.get(id);
 };
 const ctx={window:{tab(){},HTIdentity:{role:'admin'}},el,
  state:{bills:[]},activeTab:'overview',trDate:()=> '2026-11-19'};
 vm.runInNewContext(read('public/bills-v50.js'),ctx);
 const ui=ctx.window.HTBillsV50;
 assert.equal(ui.monthLater('2026-11'),'2026-12');
 assert.equal(ui.monthLater('2026-12'),'2027-01');
 assert.equal(ui.monthLater('2027-01-31'),'2027-02-28');
 assert.equal(ui.monthLater('2028-01-31'),'2028-02-29');
 assert.equal(ui.status({...base,due_date:'2001-01-01'}).id,'overdue');
 assert.equal(ui.status({...base,paid_kurus:100,due_date:'2999-01-01'}).id,'partial');
 assert.equal(ui.status({...base,paid_kurus:205000}).id,'paid');
});
