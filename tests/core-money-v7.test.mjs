import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validReceivableGroup, initializeFirmGroups, firmSchema} from '../src/firms.js';

const coreSource=readFileSync(new URL('../public/core-money.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const overview=readFileSync(new URL('../public/overview.js',import.meta.url),'utf8');

test('Beş sade ana bölümün dışında çek/senet/rapor menüsü yok',()=>{
 const sidebar=html.match(/<nav id="nav" class="nav"[\s\S]*?<\/nav>/)?.[0]||'';
 for(const title of ['Genel Bakış','Finans','Hesaplar','Firmalar','Ayarlar'])
  assert.ok(sidebar.includes(title),title);
 for(const unwanted of ['Çek ve senet','Gelişmiş arama','Gelir ve gider','Yedekleme'])
  assert.ok(!sidebar.includes(unwanted),unwanted);
});
test('Getir, Trendyol, Yemeksepeti ve iki Usmar Market sitesi ayrı alacak hesabıdır',()=>{
 const context={document:{addEventListener(){}},window:{}};
 vm.runInNewContext(coreSource+'\nwindow.__groups=coreGroups;',context);
 const platforms=context.window.__groups.platform.brands;
 assert.deepEqual(Array.from(platforms.map(x=>x[0])),['Getir','Trendyol','Yemeksepeti',
   'Usmar Market (.com)','Usmar Market (.com.tr)']);
 assert.equal(platforms[3][1],'usmarmarket.com');
 assert.equal(platforms[4][1],'usmarmarket.com.tr');
});
test('Yemek kartlarında markalar bireysel alacak hesabına dönüşebilir',()=>{
 const context={document:{addEventListener(){}},window:{}};
 vm.runInNewContext(coreSource+'\nwindow.__groups=coreGroups;',context);
 const names=Array.from(context.window.__groups.meal.brands.map(x=>x[0]));
 assert.deepEqual(names,['Setcard','Multinet','Edenred','Metropolcard','Tokenflex','Pluxee']);
 assert.ok(html.includes('coreMealPresets'));
 assert.ok(html.includes('coreMealList'));
});
test('Yeni alacak türleri doğrulanır ve eski kayıtlar genel kalır',()=>{
 for(const name of ['general','meal','platform','person'])assert.equal(validReceivableGroup(name),name);
 assert.throws(()=>validReceivableGroup('foreign'),/Alacak türü/);
 const firms=firmSchema.join('\n');
 assert.ok(firms.includes('CREATE TABLE IF NOT EXISTS firms'));
 assert.match(worker,/initializeFirmGroups\(env\)/);
});
test('D1 kolon eklemesi yalnız eksik olduğunda çalışır ve mevcut kayıtları silmez',async()=>{
 const actions=[];
 const env={DB:{prepare(sql){
  actions.push(sql);
  if(sql.startsWith('PRAGMA'))return {all:async()=>({results:[{name:'id'},{name:'category'}]})};
  return {run:async()=>({success:true})};
 }}};
 await initializeFirmGroups(env);
 assert.equal(actions.length,5);
 assert.ok(actions[1].includes("ALTER TABLE firms ADD COLUMN receivable_group"));
 assert.ok(actions[2].includes('payout_institution_id'));
 assert.ok(actions[3].includes('payout_is_pos'));
 assert.ok(actions[4].includes('logo_data'));
 const already={DB:{prepare(sql){
  if(sql.startsWith('PRAGMA'))return {all:async()=>({results:[{name:'receivable_group'},{name:'payout_institution_id'},{name:'payout_is_pos'},{name:'logo_data'}]})};
  throw new Error('Var olan veriye müdahale edilmeyecek');
 }}};
 await initializeFirmGroups(already);
});
test('Önceki alacaklar yeni başlıklardan birine yanlış aktarılmaz',()=>{
 const context={document:{addEventListener(){}},window:{},
   state:{firms:[{id:'old',category:'receivable'},
     {id:'meal',category:'receivable',receivable_group:'meal'}]}};
 vm.runInNewContext(coreSource+'\nwindow.__groupFirms=groupFirms;',context);
 assert.equal(context.window.__groupFirms('general').length,1);
 assert.equal(context.window.__groupFirms('meal').length,1);
 assert.equal(context.window.__groupFirms('person').length,0);
});
test('Genel Bakış eskiden olduğu gibi tüm alacakları tek kez düşer',()=>{
 const context={window:{}};
 vm.runInNewContext(overview,context);
 const sample={cards:[{id:'c1',credit_limit_kurus:100000,available_limit_kurus:39100}],
  statements:[],payments:[],firms:[
    {id:'f1',category:'payable'},{id:'f2',category:'receivable',receivable_group:'meal'},
    {id:'f3',category:'receivable',receivable_group:'platform'},
    {id:'f4',category:'receivable',receivable_group:'person'}],
  firmMovements:[
    {firm_id:'f1',kind:'charge',amount_kurus:50000,on_date:'2026-11-16'},
    {firm_id:'f2',kind:'charge',amount_kurus:20000,on_date:'2026-11-16'},
    {firm_id:'f3',kind:'charge',amount_kurus:20000,on_date:'2026-11-16'},
    {firm_id:'f4',kind:'charge',amount_kurus:10000,on_date:'2026-11-16'}],
  accounts:[],entries:[],instruments:[],reminders:[]};
 const result=context.window.computeFinancialOverview(sample);
 assert.equal(result.netDebt,60900);
 assert.equal(result.firmReceivable,50000);
});
test('Banka kartı ve POS kayıtları kredi kartı borcuna katılmaz',()=>{
 const context={window:{}};
 vm.runInNewContext(overview,context);
 const result=context.window.computeFinancialOverview({
  cards:[
   {id:'debit',card_type:'debit',credit_limit_kurus:100000,available_limit_kurus:20000},
   {id:'pos',card_type:'pos',credit_limit_kurus:100000,available_limit_kurus:20000},
   {id:'credit',card_type:'credit',credit_limit_kurus:100000,available_limit_kurus:39100}],
  statements:[],payments:[],firms:[],firmMovements:[],accounts:[],entries:[],instruments:[],reminders:[]
 });
 assert.equal(result.cardDebtTry,60900);
 assert.equal(result.cardsCount,1);
});
test('Yeni kayıt penceresi satış ve tahsilatları ayrı sunar',()=>{
 const dialog=html.match(/<dialog id="quickDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
 const types=Array.from(dialog.matchAll(/data-v18-quick="([^"]+)"/g)).map(x=>x[1]);
 assert.deepEqual(types,['firm-create','firm-charge','firm-payment','platform-sale','platform-payment',
  'card-create','card-payment','meal-sale','meal-payment','bank-create',
  'pos-account-create','pos-sale','plan-create','person-create','veresiye-create','veresiye-payment']);
 assert.doesNotMatch(dialog,/instruments|cheque|senet|report/i);
 assert.match(app,/window\.renderCoreMoney\(\)/);
 assert.match(app,/window\.renderCoreOverview\(\)/);
});
