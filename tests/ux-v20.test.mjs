import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initializeFinanceAccountLinks, accountBalance, financeRoute} from '../src/finance.js';
import {firmRoute} from '../src/firms.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html'),form=read('public/finance-suite.js'),
 cards=read('public/cards-pro.js'),nav=read('public/navigation-v18.js'),
 directory=read('public/directory-v17.js'),v9=read('public/receivables-v9.js'),
 moneyCode=read('public/currency-v20.js'),src=read('src/finance.js');

test('Kart sahibi: iki hazır isim ve manuel kişi; eski kart ID ve tutarları korunuyor',()=>{
 assert.match(cards,/Neslihan Uslu/);
 assert.match(cards,/Veysi Uslu/);
 assert.match(cards,/owner_manual/);
 assert.match(cards,/state\.cards\|\|\[\]\)\.map\(c=>String\(c.owner/);
 assert.match(cards,/const owner=\(d\.owner==='__manual__'/);
 assert.doesNotMatch(cards,/owner:c\?\.owner\|\|'Kart Sahibi'/);
 assert.match(cards,/await api\('cards'\+\(id\?'\/'\+id:''\),id\?'PATCH':'POST'/);
 assert.match(src,/\['institution_id','TEXT'\]/);
 assert.match(src,/\['is_pos','INTEGER NOT NULL DEFAULT 0/);
});

test('Tutar alanları bankacılık formatında iki kuruş hanesi gösterir',()=>{
 const callbacks={};
 class FakeInput {
  constructor(value=''){this.name='amount';this.type='number';this.value=value;this.disabled=false;
   this.readOnly=false;this.dataset={};this.classList={add(){}};
   this.parentElement=null;}
  setAttribute(k,v){this[k]=v;}
  select(){this.selected=true;}
  setSelectionRange(){}
 }
 const ctx={window:{},HTMLInputElement:FakeInput,document:{addEventListener(name,cb){callbacks[name]=cb;}}};
 vm.runInNewContext(moneyCode,ctx);
 const {formatDigits,fromExisting}=ctx.window.HTCurrency20;
 for(const [typed,expected] of [['1','0,01'],['10','0,10'],['1000','10,00'],
  ['100000','1.000,00'],['100000000','1.000.000,00']]){
  assert.equal(formatDigits(typed),expected);
 }
 assert.equal(fromExisting('524.00'),'524,00');
 assert.equal(fromExisting('1000.00'),'1.000,00');
 const input=new FakeInput('524.00');
 callbacks.focusin({target:input});
 assert.equal(input.value,'524,00');
 assert.equal(input.type,'text');
 assert.equal(input.selected,true);
 input.value='1000';callbacks.input({target:input});
 assert.equal(input.value,'10,00');
 // First render never changes a stored kurus value.
 assert.equal(accountBalance({id:'old',opening_kurus:52400},[]),52400);
});

test('Tutarı veri tabanına gönderirken Türkçe binlik/ondalık ayracı güvenle çözülür',()=>{
 const app=read('public/app.js');
 const block=app.match(/function amountValue\(raw\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(block);
 const ctx={};
 vm.runInNewContext(block+'\nthis.parse=amountValue;',ctx);
 assert.equal(ctx.parse('0,01'),1);
 assert.equal(ctx.parse('10,00'),1000);
 assert.equal(ctx.parse('1.000,00'),100000);
 assert.equal(ctx.parse('1000.00'),100000);
 assert.throws(()=>ctx.parse('1,001'),/ondalık/);
});

test('Temsilciler hızlı erişimi kişiyi, firmayı, telefonu ve ziyaret gününü gösterir',()=>{
 const start=directory.indexOf(' function renderQuickRepresentatives()');
 const end=directory.indexOf(' function renderDirectory()',start);
 assert.ok(start>=0&&end>start);
 const nodes={dirQuickSearch:{value:''},dirQuickList:{innerHTML:''}};
 const ctx={directory:()=>({companies:[{id:'f1',name:'Algida',visit_day:'Salı'}],
   contacts:[{id:'c1',company_id:'f1',full_name:'Ahmet Bekar',phone:'+90 532 222 22 22',visit_day:'Cuma'}]}),
  norm:x=>String(x||'').toLocaleLowerCase('tr-TR').trim(),safe:x=>String(x??''),
  el:id=>nodes[id]};
 vm.runInNewContext(directory.slice(start,end)+'\nthis.show=renderQuickRepresentatives;',ctx);
 ctx.show();
 for(const label of ['Algida','Ahmet Bekar','+90 532 222 22 22','Ziyaret: Cuma','WhatsApp / Business'])
  assert.ok(nodes.dirQuickList.innerHTML.includes(label),label);
 nodes.dirQuickSearch.value='AhMeT';ctx.show();
 assert.match(nodes.dirQuickList.innerHTML,/Ahmet Bekar/);
 nodes.dirQuickSearch.value='Ulaşılamayan';ctx.show();
 assert.match(nodes.dirQuickList.innerHTML,/Temsilci bulunamadı/);
 assert.match(nav,/renderQuickRepresentatives/);
});

test('WhatsApp şablonu placeholder olmasa bile firma ve temsilci adını içerir',()=>{
 const start=directory.indexOf(' function templateFill('),end=directory.indexOf(' function openChat(',start);
 assert.ok(start>0&&end>start);
 const ctx={};vm.runInNewContext(directory.slice(start,end)+'\nthis.fill=templateFill;',ctx);
 const c={name:'Algida',phone:'+90 532 111 11 11'};
 const p={full_name:'Ahmet Bekar',phone:'+90 532 222 22 22'};
 const fixed=ctx.fill({body:'Merhaba {temsilci}, {firma} sipariş hakkında yazıyorum.'},c,p);
 assert.match(fixed,/Firma: Algida/);assert.match(fixed,/Temsilci: Ahmet Bekar/);
 assert.match(fixed,/Merhaba Ahmet Bekar, Algida/);
 const custom=ctx.fill({body:'Merhaba, müsait misiniz?'},c,p);
 assert.match(custom,/Firma: Algida/);assert.match(custom,/Temsilci: Ahmet Bekar/);
 assert.match(custom,/Merhaba, müsait misiniz/);
});

test('Banka/ödeme kuruluşları PayTR, iyzico ve Tami seçimi ile manuel alanı sunar',()=>{
 assert.match(form,/bankInstitutionSelect/);
 assert.match(form,/group\('payment','Ödeme kuruluşları \/ POS'\)/);
 assert.match(form,/PayTR, Kuveyt Türk, iyzico, Tami/);
 assert.match(form,/Manuel \/ özel banka hesabı/);
 assert.match(form,/institution_id:d\.type==='bank'/);
 assert.match(html,/data-suite-action="account">\+ Banka \/ Kuruluş Ekle/);
});

test('D1 banka kuruluşu sütunu sadece eklenir, kayıtlar yeniden oluşturulmaz',async()=>{
 const queries=[];
 const env={DB:{prepare(sql){
  queries.push(sql);
  return {async all(){return {results:[{name:'id'},{name:'name'}]};},
   async run(){return {success:true}}};
 }}};
 await initializeFinanceAccountLinks(env);
 assert.equal(queries.filter(s=>s.startsWith('ALTER TABLE')).length,2);
 assert.doesNotMatch(queries.join('\n'),/DELETE FROM|DROP TABLE|UPDATE cash_entries/i);
 const envExisting={DB:{prepare(sql){
  return {async all(){return {results:[{name:'institution_id'},{name:'is_pos'}]};},
   async run(){throw Error('Existing schema should not change');}};
 }}};
 await initializeFinanceAccountLinks(envExisting);
});

test('Banka hesabı mevcut kurum kodu ile açılır; hareket yaratmaz',async()=>{
 const events=[];
 const env={DB:{prepare(sql){
  const rec={sql,args:[]};
  events.push(rec);
  return {bind(...args){rec.args=args;return this;},
   async first(){return {id:'paytr'};},
   async run(){return {success:true};}};
 }}};
 const response=await financeRoute(new Request('https://example.test/api/accounts',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'PayTR Tahsilat',type:'bank',institution_id:'paytr',opening_kurus:0})
 }),env,'/api/accounts','POST');
 assert.equal(response.ok,true);
 const insert=events.find(x=>x.sql.startsWith('INSERT INTO cash_accounts'));
 assert.ok(insert);assert.match(insert.sql,/institution_id/);
 assert.equal(insert.args.at(-2),'paytr');
 assert.equal(insert.args.at(-1),0);
 assert.ok(!events.some(x=>/cash_entries|firm_movements/.test(x.sql)));
});

test('POS tahsilatında banka zorunlu; ödeme çifte gelir sayılmaz',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const account='00000000-0000-4000-8000-000000000002';
 const queryLog=[],batched=[];
 let accountType='bank';
 const env={DB:{
  prepare(sql){
   const step={sql,args:[]};queryLog.push(step);
   return {bind(...args){step.args=args;return this;},
    async first(){
     if(sql.includes('FROM firms WHERE id='))return {id,category:'receivable',receivable_group:'pos'};
     if(sql.includes("FROM firm_movements WHERE firm_id="))return {balance:100000};
     if(sql.includes('FROM cash_accounts WHERE id='))return {id:account,type:accountType,opening_kurus:0};
     return null;
    }};
  },
  async batch(){throw Error('wrong method');}
 }};
 env.DB.batch=async statements=>{batched.push(...statements);return [];};
 const request=(account_id)=>new Request('https://example.test/api/settlements',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({firm_id:id,amount_kurus:50000,on_date:'2026-11-18',
   ...(account_id?{account_id}:{})})
 });
 await assert.rejects(()=>firmRoute(request(null),env,'/api/settlements','POST'),/banka hesabı seçilmelidir/);
 accountType='cash';
 await assert.rejects(()=>firmRoute(request(account),env,'/api/settlements','POST'),/yalnızca banka hesabına/);
 accountType='bank';
 const result=await firmRoute(request(account),env,'/api/settlements','POST');
 assert.equal(result.ok,true);
 assert.ok(queryLog.some(q=>q.sql.includes('INSERT INTO cash_entries')&&q.args.includes('other')));
 assert.ok(queryLog.some(q=>q.sql.includes('INSERT INTO firm_movements')));
 assert.ok(queryLog.some(q=>q.sql.includes('INSERT INTO linked_settlements')));
 assert.equal(batched.length,3);
});

test('Yemek kartında 6 hazır seçenek, manuel isim ve önceki özel kayıtlar korunur',()=>{
 for(const name of ['Setcard','Pluxee','Multinet','Edenred','Metropolcard','Tokenflex'])
  assert.ok(v9.includes("'"+name+"'"),name);
 assert.match(v9,/Manuel firma ekle/);
 assert.match(v9,/const saved=\(state\.firms\|\|\[\]\)/);
 assert.doesNotMatch(read('public/navigation-v18.css'),/#v9MealInline,#v9CardMealInline/);
 assert.match(nav,/case 'meal-sale':[\s\S]*window\.tab\('meal'\)/);
 assert.match(html,/id="v9MealInline"/);
});

test('Banka, kart, firma, POS ve yemek kartı verileri yenilikte silinmez',()=>{
 const sources=[read('src/finance.js'),read('src/index.js'),read('public/cards-pro.js'),
  read('public/receivables-v9.js'),read('src/firms.js')];
 const changes=[read('src/finance.js'),read('src/card-catalog.js')];
 assert.ok(sources.some(x=>x.includes("PATCH")));
 assert.ok(changes.some(x=>x.includes("['institution_id','TEXT']")));
 assert.ok(changes.some(x=>x.includes("['is_pos','INTEGER NOT NULL DEFAULT 0")));
 assert.match(read('src/card-catalog.js'),/FROM cash_accounts WHERE institution_id=\?/);
 assert.match(read('src/firms.js'),/cash_entries/);
 assert.doesNotMatch(read('public/currency-v20.js'),/fetch\(|\bapi\(/);
});