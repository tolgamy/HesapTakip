import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {institutionSeeds} from '../src/institution-seeds.js';

const overviewSource=readFileSync(new URL('../public/overview.js',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const reportSource=readFileSync(new URL('../public/export.js',import.meta.url),'utf8');
const firmSource=readFileSync(new URL('../public/firms.js',import.meta.url),'utf8');
const cardSource=readFileSync(new URL('../public/cards-pro.js',import.meta.url),'utf8');
const context={window:{}};
vm.runInNewContext(overviewSource,context);
const calculate=context.window.computeFinancialOverview;
const accountData=()=>({
 cards:[{id:'c',bank:'Akbank',nickname:'Asıl',credit_limit_kurus:100000,
   available_limit_kurus:39100,currency:'TRY'}],
 statements:[],payments:[],
 firms:[{id:'p',name:'Tedarikçi',category:'payable'},
  {id:'r',name:'Müşteri',category:'receivable'}],
 firmMovements:[
  {firm_id:'p',kind:'charge',amount_kurus:50000,on_date:'2026-11-16'},
  {firm_id:'r',kind:'charge',amount_kurus:50000,on_date:'2026-11-16'}],
 accounts:[],entries:[],instruments:[],reminders:[]
});

test('Kart 609 TL + firmaya 500 TL - firmadan 500 TL = net 609 TL',()=>{
 const c=calculate(accountData());
 assert.equal(c.cardDebtTry,60900);
 assert.equal(c.firmPayable,50000);
 assert.equal(c.firmReceivable,50000);
 assert.equal(c.netDebt,60900);
});
test('Kart limiti mevcutsa aynı ekstreden ikinci kez borç eklenmez',()=>{
 const data=accountData();
 data.statements=[{id:'s1',card_id:'c',amount_kurus:80000,due_date:'2026-11-20'}];
 data.payments=[{statement_id:'s1',amount_kurus:15000}];
 const c=calculate(data);
 assert.equal(c.cardDebtTry,60900);
 assert.equal(c.netDebt,60900);
 assert.equal(c.cardItems[0].method,'limit');
});
test('Limit alanları boş eski kart ekstre bakiyesiyle takip edilir',()=>{
 const data=accountData();
 data.cards=[{id:'c',bank:'Akbank',credit_limit_kurus:null,available_limit_kurus:null}];
 data.statements=[{id:'s1',card_id:'c',amount_kurus:40000}];
 data.payments=[{statement_id:'s1',amount_kurus:10000}];
 const result=calculate(data);
 assert.equal(result.cardDebtTry,30000);
 assert.equal(result.cardItems[0].method,'statement');
});
test('Firma ödemeleri ve tahsilatları doğru borç/alacak bakiyesini bırakır',()=>{
 const data=accountData();
 data.firmMovements.push(
  {firm_id:'p',kind:'settlement',amount_kurus:30000,on_date:'2026-11-17'},
  {firm_id:'r',kind:'settlement',amount_kurus:10000,on_date:'2026-11-17'});
 const result=calculate(data);
 assert.equal(result.firmPayable,20000);
 assert.equal(result.firmReceivable,40000);
 assert.equal(result.netDebt,40900);
});
test('Kasa, banka ve çek/senet bilgilerinin çift sayımı önlenir',()=>{
 const data=accountData();
 data.accounts=[{id:'a',opening_kurus:100000}];
 data.entries=[{account_id:'a',direction:'out',category:'expense',amount_kurus:10000,entry_date:'2026-11-17'}];
 data.instruments=[{direction:'payable',status:'pending',amount_kurus:40000},{direction:'receivable',status:'pending',amount_kurus:30000}];
 const result=calculate(data);
 assert.equal(result.cashBalance,90000);
 assert.equal(result.checkPayable,40000);
 assert.equal(result.checkReceivable,30000);
 assert.equal(result.netDebt,60900);
 assert.equal(result.netCashPosition,29100);
});
test('USD kartlar TRY borç toplamına yanlışlıkla eklenmez',()=>{
 const data=accountData();
 data.cards.push({id:'usd',bank:'Example Bank',credit_limit_kurus:100000,
   available_limit_kurus:50000,currency:'USD'});
 const result=calculate(data);
 assert.equal(result.cardDebtTry,60900);
 assert.equal(result.currencies.get('USD'),50000);
});
test('Kurumlar ve fotoğraftaki yemek kartı/POS markaları seçilebilir',()=>{
 const required=['setcard','setpos','multinet','multipos','multipay','edenred',
   'metropolcard','metropol-pos','tokenflex','tokenflex-pos','pluxee','pluxee-ceppos'];
 for(const id of required)assert.ok(institutionSeeds.find(x=>x.id===id),'Eksik '+id);
 assert.equal(new Set(institutionSeeds.map(x=>x.id)).size,institutionSeeds.length);
 assert.ok(!institutionSeeds.some(x=>x.name==='e-Devlet'),'e-Devlet finans kurum listesi olamaz');
 assert.match(cardSource,/mealBrandIds/);
 assert.match(html,/mealBrandShortcuts/);
});
test('GG.AA.YYYY görünür formatı; veritabanına ISO yollayan formlar korunur',()=>{
 const start=frontend.indexOf('function showDate('),end=frontend.indexOf('function monthNow()',start);
 assert.ok(start>0&&end>start);
 const context={};
 vm.runInNewContext(frontend.slice(start,end),context);
 assert.equal(context.showDate('2026-11-18'),'18.11.2026');
 assert.equal(context.showDate('2026-11-18T14:05:00'),'18.11.2026 14:05');
 assert.equal(context.showMonth('2026-11'),'11.2026');
 assert.equal(context.showDate(''),'');
 assert.match(frontend,/type='date'|,'date'/);
 assert.match(firmSource,/showDate\(m\.on_date\)/);
 assert.match(reportSource,/showDate\(m\.on_date\)/);
});
test('Rapor net borcu aynı ortak hesapla hesaplar ve ekstreleri iki kez saymaz',()=>{
 assert.match(frontend,/window\.renderFinanceOverview/);
 assert.match(reportSource,/window\.computeFinancialOverview\(state\)/);
 assert.match(html,/id="overviewLedger"/);
 assert.match(html,/id="overviewCash"/);
 assert.match(html,/id="overviewFirms"/);
 assert.match(html,/id="overviewRecent"/);
});
