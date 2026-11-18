import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {firmRoute,validateFirmLogo,validatePayoutInstitution,initializeFirmGroups} from '../src/firms.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const cards=readFileSync(new URL('../public/cards-pro.js',import.meta.url),'utf8');
const v9=readFileSync(new URL('../public/receivables-v9.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../public/receivables-v9.css',import.meta.url),'utf8');
const editor=readFileSync(new URL('../public/firms.js',import.meta.url),'utf8');
const overview=readFileSync(new URL('../public/overview.js',import.meta.url),'utf8');

test('Card form contains exactly the requested fields; all old hidden data is retained',()=>{
 const form=cards.slice(cards.indexOf('function proCardModal('),cards.indexOf('function estimateLocalDates('));
 for(const label of ['Banka seç','Kartın son 4 hanesi','Kart türü','Kullanım','Ek kart var mı?',
 'Para birimi','Toplam kart limiti','Kullanılabilir limit','Hesap kesim günü',
 'Ödeme günü','Hesap kesim tarihi','Son ödeme tarihi',
 'Bir sonraki hesap kesim tarihi','Bir sonraki ödeme tarihi'])
  assert.ok(form.includes(label),label);
 for(const removed of ['Kurum adı','Kart adı / takma ad','Nakit avans limiti',
  'Asgari ödeme oranı (%)','Bağlı hesap IBAN','Faiz notu','Komisyon notu','Diğer not'])
  assert.ok(!form.includes("'"+removed+"'"),removed);
 assert.match(form,/cash_advance_limit_kurus:c\?\.cash_advance_limit_kurus/);
 assert.match(form,/linked_iban:c\?\.linked_iban/);
 assert.match(form,/interest_note:c\?\.interest_note/);
 assert.match(form,/option value="__legacy__"/);
 assert.match(cards,/filter\(x=>x\.type==='bank'/);
});
test('Meal and platform presets have the requested names and realistic domain fallbacks',()=>{
 const context={window:{},document:{addEventListener(){}},trDate:()=>'2026-11-18'};
 vm.runInNewContext(v9+'\nwindow.__presets=window.v9ReceivablePresets;',context);
 const meal=Array.from(context.window.__presets.meal.map(x=>x[0]));
 const platforms=Array.from(context.window.__presets.platform.map(x=>x[0]));
 for(const brand of ['Setcard','Multinet','Edenred','Metropolcard','Tokenflex','Pluxee'])
  assert.ok(meal.includes(brand),brand);
 for(const name of ['Getir Çarşı','Uber Eats','Yemeksepeti Mahalle','USMAR.com','Usmar.com.tr'])
  assert.ok(platforms.includes(name),name);
 assert.match(v9,/https:\/\/www\.google\.com\/s2\/favicons/);
 assert.match(v9,/logo_data/);
});
test('Same-page form has amount date due and payment bank, with admin-only desktop logos',()=>{
 for(const id of ['v9MealInline','v9PlatformInline','v9CardMealInline'])assert.ok(html.includes('id="'+id+'"'));
 for(const name of ['amount','on_date','due_date','payout_institution_id'])assert.ok(v9.includes('name="'+name+'"'));
 for(const text of ['PayTR','iyzico','Kuveyt Türk','Tami POS'])assert.ok(v9.includes(text));
 assert.match(styles,/@media\(max-width:620px\)[\s\S]*\.v9-pc-only/);
 assert.match(styles,/\.v9-desktop-logo\{display:none!important\}/);
 assert.match(editor,/payout_institution_id/);
 assert.match(editor,/reduceLogo\(uploaded\)/);
});
test('Uploaded logo accepts only bounded raster image data, no SVG / HTML / remote URL',()=>{
 assert.equal(validateFirmLogo(''),'');
 assert.equal(validateFirmLogo('data:image/webp;base64,QUJD'),'data:image/webp;base64,QUJD');
 assert.throws(()=>validateFirmLogo('data:image/svg+xml;base64,QUJD'));
 assert.throws(()=>validateFirmLogo('https://evil.example/logo.png'));
 assert.throws(()=>validateFirmLogo('data:image/png;base64,'+'A'.repeat(10000)));
 assert.equal(validatePayoutInstitution('paytr'),'paytr');
 assert.equal(validatePayoutInstitution('garanti-odeme'),'garanti-odeme');
 assert.throws(()=>validatePayoutInstitution('garanti odeme'));
});
test('New receivable and its first amount use atomic D1 batch and institution lookup',async()=>{
 const statements=[],firstQueries=[],batched=[];
 const db={
  prepare(sql){
   const statement={sql,args:[],
    bind(...args){this.args=args;return this;},
    async first(){firstQueries.push(this);return {id:'paytr'};},
    async run(){statements.push(this);return {success:true};}};
   return statement;
  },
  async batch(items){batched.push(...items);return [{success:true},{success:true}];}
 };
 const env={DB:db};
 const payload={name:'Getir Çarşı',category:'receivable',receivable_group:'platform',
  amount_kurus:12500,on_date:'2026-11-18',due_date:'2026-11-25',
  payout_institution_id:'paytr',phone:'',note:'',logo_data:''};
 const response=await firmRoute(new Request('https://example.com/api/firms/with-charge',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
 }),env,'/api/firms/with-charge','POST');
 assert.ok(response.ok);assert.match(response.id,/^[a-f0-9-]{36}$/);
 assert.equal(batched.length,2);
 assert.match(batched[0].sql,/INSERT INTO firms/);
 assert.match(batched[1].sql,/INSERT INTO firm_movements/);
 assert.ok(batched[0].args.includes('paytr'));
 assert.ok(batched[1].args.includes(12500));
 assert.equal(firstQueries.length,1);
 assert.equal(firstQueries[0].args[0],'paytr');
});
test('Payout institution is optional and does not contaminate totals / create bank transfers',()=>{
 const context={window:{}};
 vm.runInNewContext(overview,context);
 const result=context.window.computeFinancialOverview({
  cards:[],statements:[],payments:[],
  firms:[{id:'f',category:'receivable',receivable_group:'platform',payout_institution_id:'iyzico'}],
  firmMovements:[{firm_id:'f',kind:'charge',amount_kurus:50000,on_date:'2026-11-18'}],
  accounts:[],entries:[],instruments:[],reminders:[]
 });
 assert.equal(result.firmReceivable,50000);
 assert.equal(result.cashBalance,0);
 assert.equal(result.netDebt,-50000);
});
test('Existing firm columns survive additive migration',async()=>{
 const queries=[];
 const db={prepare(sql){queries.push(sql);return {
  all:async()=>({results:[{name:'id'},{name:'receivable_group'}]}),
  run:async()=>({success:true})
 }}};
 await initializeFirmGroups({DB:db});
 assert.equal(queries.filter(q=>/ALTER TABLE firms ADD COLUMN/.test(q)).length,3);
 assert.ok(queries.some(q=>q.includes('payout_institution_id')));
 assert.ok(queries.some(q=>q.includes('payout_is_pos')));
 assert.ok(queries.some(q=>q.includes('logo_data')));
 assert.ok(!queries.some(q=>/DROP|DELETE FROM/i.test(q)));
});
