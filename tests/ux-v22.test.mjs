import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
 workflowSchema,installmentDates,firmProfileRoute,platformArchiveRoute,paymentPlanRoute
} from '../src/workflows-v22.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const frontend=read('public/workflows-v22.js'),index=read('public/index.html');
const ID1='10000000-0000-4000-8000-000000000001';
const ID2='10000000-0000-4000-8000-000000000002';
const ID3='10000000-0000-4000-8000-000000000003';
const request=(path,data,method='POST')=>new Request('https://example.test/api/'+path,{
 method,headers:{'content-type':'application/json'},body:JSON.stringify(data)});
function mockDB(first=()=>null,rows=()=>[]){
 const queries=[],batch=[];
 return {queries,batch,DB:{
  prepare(sql){
   const rec={sql,args:[]};queries.push(rec);
   return {bind(...args){rec.args=args;return this;},
    async first(){return first(sql,rec.args);},
    async all(){return {results:rows(sql,rec.args)};},
    async run(){return {meta:{changes:1}};},
   };
  },
  async batch(stmts){batch.push(stmts);return stmts.map(()=>({meta:{changes:1}}));}
 }};
}

test('All new profile, archive and installment tables are additive and preserve historical records',()=>{
 const schema=workflowSchema.join(' ');
 for(const table of ['firm_profiles','archived_platforms','payment_plans','payment_plan_dues'])
  assert.match(schema,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
 assert.doesNotMatch(schema,/DROP TABLE|DELETE FROM|UPDATE cards|UPDATE firms/i);
 assert.match(read('src/index.js'),/\.\.\.workflowSchema/);
 assert.match(read('src/index.js'),/firmProfileRoute/);
 assert.match(read('src/index.js'),/platformArchiveRoute/);
 assert.match(read('src/index.js'),/paymentPlanRoute/);
});

test('Firma satın alma koşulları dört ayrı alanla düzenlenebilir ve eski cari hareketler değişmez',async()=>{
 const data={description:'Kahve tedarikçisi',products:'Kahve, çay',
  conditions:'Sadece kampanyada',urgent_notes:'Ürün bittiğinde bir koli'};
 const db=mockDB(sql=>sql.includes('FROM firms WHERE id=')?
  {id:ID1,name:'Kopyala',category:'payable',receivable_group:'general'}:null);
 const res=await firmProfileRoute(request('firm-profiles/'+ID1,data,'PATCH'),
  {DB:db.DB},'/api/firm-profiles/'+ID1,'PATCH');
 assert.equal(res.ok,true);
 assert.ok(db.queries.some(q=>q.sql.includes('INSERT INTO firm_profiles')&&q.args[0]===ID1&&q.args[2]==='Kahve, çay'));
 assert.ok(db.queries.every(q=>!/UPDATE firm_movements|DELETE FROM cash_entries/.test(q.sql)));
 assert.match(frontend,/Firma Notları/);
 assert.match(frontend,/Bilgileri Düzenle/);
});

test('Firma hakkında WhatsApp taslağında temsilci ve dört bilgi alanı vardır; otomatik mesaj gönderilmez',()=>{
 assert.match(frontend,/function shareProfile/);
 assert.match(frontend,/contactsFor\(f\)/);
 assert.match(frontend,/directory\?\.companies/);
 assert.match(frontend,/Temsilciye WhatsApp/);
 assert.match(frontend,/profileFields/);
 assert.match(frontend,/window\.open\('https:\/\/wa\.me\//);
 assert.doesNotMatch(read('src/workflows-v22.js'),/whatsapp|wa\.me/);
});

test('Person reminder comes from saved name, phone-local date and remaining balance',()=>{
 const elements={modalTitle:{},modalContents:{},modal:{showModal(){}},v22Cancel:{},v22Form:{querySelector(){return {textContent:''};}}};
 const state={firms:[{id:ID1,name:'Veysel Uslu',category:'receivable',
  receivable_group:'person',phone:'+90 532 111 22 33'}]};
 const ctx={state,el:id=>elements[id]||null,esc:x=>String(x??''),money:n=>(n/100).toFixed(2)+' TL',
  firmBalance:id=>({remaining:525000}),currentRole:'admin',document:{addEventListener(){}},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){}},
  Intl,Date};
 vm.runInNewContext(frontend,ctx);
 ctx.window.HTV22.personWhatsapp(ID1);
 const html=elements.modalContents.innerHTML;
 assert.match(html,/Veysel Uslu/);
 assert.match(html,/5250\.00 TL/);
 assert.match(html,/borç bakiyeniz/);
 assert.match(html,/\d{2}\.\d{2}\.\d{4}/);
 assert.match(html,/name="message"/);
 assert.doesNotMatch(html,/Telefon numarası kayıtlı değil/);
});

test('POS account balance plus bank balance are reported once each, pending funds excluded',()=>{
 const elements={v22BankTotalValues:{innerHTML:''}};
 const accounts=[{id:'b',type:'bank',name:'Akbank'}, {id:'p',type:'bank',name:'PayTR'},{id:'c',type:'cash',name:'Kasa'}];
 const ctx={state:{accounts},el:id=>elements[id]||null,esc:x=>String(x??''),money:n=>'₺'+n,
  currentBalance:id=>({b:2500000,p:1350000,c:900000}[id]),
  firmBalance(){return {remaining:0};},currentRole:'admin',document:{addEventListener(){}},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){},
   HTPOS21:{readPos:()=>({posAccounts:[accounts[1]],pending:900000})}},Intl,Date};
 vm.runInNewContext(frontend,ctx);
 ctx.window.HTV22.renderBankTotal();
 const result=elements.v22BankTotalValues.innerHTML;
 // POS includes ₺9.000 pending plus ₺13.500 POS provider account;
 // bank still ₺25.000; shown once each for ₺47.500.
 assert.match(result,/₺4750000/);
 assert.match(result,/₺2500000/);
 assert.match(result,/POS hesabındaki para<\/span><strong>₺1350000/);
 assert.match(result,/Bekleyen: ₺900000/);
 assert.match(result,/₺1350000/);
 assert.match(result,/GENEL TOPLAM — BANKA \+ POS \+ BEKLEYEN/);
 assert.ok(result.indexOf('v22-grand-total')<result.indexOf('v23-pos-first'));
 assert.ok(result.indexOf('v23-bank-second')<result.indexOf('v23-pos-first'));
});

test('Platform archive requires admin, exact company and 1453; regular supplier cannot be archived',async()=>{
 const first=sql=>sql.includes('FROM firms WHERE id=')?
  {id:ID1,name:'Getir',category:'receivable',receivable_group:'platform'}:null;
 const db=mockDB(first);
 await assert.rejects(()=>platformArchiveRoute(request('platform-archive',{
  firm_id:ID1,firm_name:'Getir',confirmation:'1453'}),{DB:db.DB},'/api/platform-archive','POST','viewer'),
  /yalnız yönetici/);
 await assert.rejects(()=>platformArchiveRoute(request('platform-archive',{
  firm_id:ID1,firm_name:'Getir',confirmation:'1454'}),{DB:db.DB},'/api/platform-archive','POST','admin'),
  /1453/);
 const success=await platformArchiveRoute(request('platform-archive',{
  firm_id:ID1,firm_name:'Getir',confirmation:'1453'}),{DB:db.DB},'/api/platform-archive','POST','admin');
 assert.equal(success.archived,true);
 assert.ok(db.queries.some(q=>q.sql.includes('INSERT INTO archived_platforms')));
 assert.match(read('src/firms.js'),/WHERE id NOT IN \(SELECT firm_id FROM archived_platforms\)/);
 assert.match(frontend,/prompt\('SON ONAY: İstanbul’un fethi/);
 assert.match(frontend,/answer\.trim\(\)!=='1453'/);
});

test('Archive preserves bank entries, linked POS payments and offers restore',async()=>{
 const db=mockDB();
 const response=await platformArchiveRoute(request('platform-archive/'+ID1+'/restore',{},'POST'),
  {DB:db.DB},'/api/platform-archive/'+ID1+'/restore','POST','admin');
 assert.equal(response.ok,true);
 assert.ok(db.queries.some(x=>x.sql.includes('DELETE FROM archived_platforms')));
 assert.ok(db.queries.every(x=>!/DELETE FROM (?:firm_movements|cash_entries|firms)|UPDATE cards/.test(x.sql)));
 assert.match(frontend,/Arşivi listele/);
 assert.match(frontend,/data-v22-restore/);
});

test('Plan dates respect February and months ending on the 30th or 31st',()=>{
 assert.deepEqual(installmentDates('2026-01-31',4),[
  '2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
 assert.deepEqual(installmentDates('2028-01-31',3),[
  '2028-01-31','2028-02-29','2028-03-31']);
});

test('Eminevim plan builds exact amount/count and adjusts only last installment',async()=>{
 const db=mockDB();
 const result=await paymentPlanRoute(request('payment-plans',{
  name:'Eminevim',purpose:'Araç',monthly_kurus:100000,installment_count:3,
  total_kurus:275000,first_due:'2026-11-18',note:'Araç ödemesi'
 }),{DB:db.DB},'/api/payment-plans','POST');
 assert.equal(result.ok,true);
 assert.equal(db.batch.length,1);
 const rows=db.queries.filter(q=>q.sql.includes('INSERT INTO payment_plan_dues'));
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.args[4]),[100000,100000,75000]);
 assert.deepEqual(rows.map(r=>r.args[3]),['2026-11-18','2026-12-18','2027-01-18']);
 assert.ok(db.queries.every(q=>!/INSERT INTO cash_entries/.test(q.sql)));
});

test('Cannot create impossible plans with nonpositive last installment or excessive count',async()=>{
 const db=mockDB();
 const body={name:'Eminevim',purpose:'Araç',monthly_kurus:100000,
  total_kurus:100000,installment_count:3,first_due:'2026-11-18'};
 await assert.rejects(()=>paymentPlanRoute(request('payment-plans',body),
  {DB:db.DB},'/api/payment-plans','POST'),/Son taksit/);
 await assert.rejects(()=>paymentPlanRoute(request('payment-plans',
  {...body,installment_count:121}),{DB:db.DB},'/api/payment-plans','POST'),/1-120/);
});

test('Paid installment has atomic, conditional bank debit and no double recording',async()=>{
 const db=mockDB(sql=>{
  if(sql.includes('FROM payment_plan_dues WHERE id='))return {id:ID1,plan_id:ID2,amount_kurus:50000,paid_on:null};
  if(sql.includes('FROM cash_accounts WHERE id='))return {id:ID3};
  if(sql.includes('FROM payment_plans WHERE id='))return {name:'Eminevim'};
  return null;
 });
 const paid=await paymentPlanRoute(request('payment-plan-dues/'+ID1+'/pay',{
  paid_on:'2026-11-18',account_id:ID3,note:'Kasım taksidi'
 }),{DB:db.DB},'/api/payment-plan-dues/'+ID1+'/pay','POST');
 assert.equal(paid.ok,true);
 assert.equal(db.batch.length,1);
 assert.equal(db.batch[0].length,2);
 const cashInsert=db.queries.find(x=>x.sql.includes('INSERT INTO cash_entries'));
 const paidUpdate=db.queries.find(x=>x.sql.includes('UPDATE payment_plan_dues'));
 assert.ok(cashInsert);assert.ok(paidUpdate);
 assert.match(cashInsert.sql,/paid_on IS NULL/);
 assert.match(cashInsert.sql,/opening_kurus/);
 assert.match(paidUpdate.sql,/EXISTS\(SELECT 1 FROM cash_entries/);
 assert.ok(db.queries.some(x=>x.sql.includes('INSERT INTO cash_entries')&&x.args[2]===50000));
});

test('Installment marked paid without bank selection makes no cash movement',async()=>{
 const db=mockDB(sql=>sql.includes('FROM payment_plan_dues WHERE id=')?
  {id:ID1,amount_kurus:50000,paid_on:null}:null);
 const result=await paymentPlanRoute(request('payment-plan-dues/'+ID1+'/pay',{
  paid_on:'2026-11-18',account_id:''
 }),{DB:db.DB},'/api/payment-plan-dues/'+ID1+'/pay','POST');
 assert.equal(result.ok,true);
 assert.equal(db.batch.length,0);
 assert.ok(db.queries.every(q=>!/INSERT INTO cash_entries/.test(q.sql)));
});

test('Screen paths, version, currency fields and account safety present',()=>{
 for(const path of ['/workflows-v22.js','/workflows-v22.css'])assert.ok(index.includes(path));
 assert.match(index,/name="ht-build" content="v77"/);
 assert.match(read('public/version.json'),/"version": "v77"/);
 assert.match(read('public/currency-v20.js'),/'monthly','total'/);
 assert.doesNotMatch(frontend,/bank\.insertAdjacentHTML\('beforeend','<section id="v22InstallmentPlans"/);
 assert.doesNotMatch(index,/data-v18-quick="plan-create"/);
 assert.match(frontend,/Çalıştığım Firma Ekle/);
 assert.match(frontend,/data-v22-profile-share/);
});
