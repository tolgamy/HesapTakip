import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {catalogPreferenceSchema,catalogPreferenceRoute,normalizeCatalogName} from '../src/catalog-prefs.js';
import {directoryRoute} from '../src/directory.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html'),catalog=read('public/catalog-v21.js'),
 pos=read('public/pos-v21.js'),directory=read('public/directory-v17.js');

function dbMock({institution={id:'paytr',type:'payment',name:'PayTR'},rows=[]}={}){
 const executed=[],batches=[];
 const DB={prepare(sql){
  const record={sql,args:[]};executed.push(record);
  return {bind(...args){record.args=args;return this;},
   async first(){if(sql.includes('FROM institutions WHERE id='))return institution;return null;},
   async all(){return {results:rows};},
   async run(){return {success:true};}};
 },async batch(statements){batches.push(statements);return [];}}
 return {DB,executed,batches};
}
function req(body,method='POST'){return new Request('https://example.test/api/catalog-prefs',{
 method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function catalogContext(state){
 const view={querySelector(){return {insertAdjacentHTML(){}}}};
 const ctx={state,currentRole:'admin',esc:x=>String(x??''),
  el:id=>id==='settingsView'?view:null,
  document:{addEventListener(){}},
  window:{v9ReceivablePresets:{
    meal:[['Setcard','setcard.com.tr'],['Pluxee','pluxee.com.tr']],
    platform:[['Getir','getir.com'],['Trendyol','trendyol.com']]
  },renderSettings(){}}};
 vm.runInNewContext(catalog,ctx);
 return ctx.window.HTCatalog21;
}

test('PC HesapTakip logo and brand opens the existing Genel Bakış navigation, not a reload',()=>{
 const desktop=index.slice(index.indexOf('<aside class="sidebar">'),index.indexOf('</aside>'));
 assert.match(desktop,/<button class="brand v21-home-brand"/);
 assert.match(desktop,/data-v18-section="overview"/);
 assert.match(desktop,/HesapTakip/);
 const nav=read('public/navigation-v18.js');
 assert.match(nav,/nav\.dataset\.v18Section/);
 assert.doesNotMatch(desktop,/location\.reload/);
});

test('Catalog selection schema is additive and does not touch cards, balances or firms',()=>{
 assert.match(catalogPreferenceSchema[0],/CREATE TABLE IF NOT EXISTS catalog_preferences/);
 assert.match(catalogPreferenceSchema[0],/PRIMARY KEY\(group_key,item_key\)/);
 const indexCode=read('src/index.js');
 assert.match(indexCode,/catalogPreferenceSchema/);
 assert.match(indexCode,/catalogPreferenceRoute/);
 assert.match(indexCode,/ensureSchema/);
 const app=read('public/app.js');
 assert.match(app,/api\('catalog-prefs'\)/);
 assert.match(app,/catalogPrefs:catalog\.catalogPrefs/);
 assert.doesNotMatch(read('src/catalog-prefs.js'),/DELETE FROM|UPDATE cash_accounts|UPDATE cards|UPDATE firms|UPDATE firm_movements/);
});

test('Ayarlar whitelist: unknown payment providers are hidden; used and enabled choices remain',()=>{
 const state={
  institutions:[
   {id:'paytr',type:'payment',name:'PayTR',is_active:1},
   {id:'mps-odeme',type:'payment',name:'MPS Ödeme',is_active:1},
   {id:'turkonay',type:'payment',name:'Turkonay',is_active:1},
   {id:'akbank',type:'bank',name:'Akbank',is_active:1},
   {id:'kuveytturk',type:'bank',name:'Kuveyt Türk',is_active:1},
   {id:'custom-x',type:'payment',name:'Benim Firmam',is_active:1,is_custom:1}
  ],
  accounts:[],cards:[],firms:[],catalogPrefs:[]
 };
 const ui=catalogContext(state);
 assert.equal(ui.isInstitutionAllowed(state.institutions[0]),true);
 assert.equal(ui.isInstitutionAllowed(state.institutions[1]),false);
 assert.equal(ui.isInstitutionAllowed(state.institutions[2]),false);
 assert.equal(ui.isInstitutionAllowed(state.institutions[3]),true);
 assert.equal(ui.isInstitutionAllowed(state.institutions[4]),true);
 assert.equal(ui.isInstitutionAllowed(state.institutions[5]),true);
 state.catalogPrefs=[{group_key:'payment',item_key:'mps-odeme',enabled:1},
   {group_key:'payment',item_key:'paytr',enabled:0}];
 assert.equal(ui.isInstitutionAllowed(state.institutions[1]),true);
 assert.equal(ui.isInstitutionAllowed(state.institutions[0]),false);
 state.firms=[{payout_institution_id:'turkonay'}];
 assert.equal(ui.isInstitutionAllowed(state.institutions[2]),true);
 state.catalogPrefs.push({group_key:'payment',item_key:'turkonay',enabled:0});
 assert.equal(ui.isInstitutionAllowed(state.institutions[2]),false);
});

test('Six meal presets can be hidden without losing existing firm records',()=>{
 const state={institutions:[],accounts:[],cards:[],firms:[
  {name:'Setcard',category:'receivable',receivable_group:'meal'}
 ],catalogPrefs:[{group_key:'meal',item_key:'setcard',enabled:0,display_name:'Setcard'}]};
 const ui=catalogContext(state);
 assert.equal(ui.isNameAllowed('meal','Setcard'),false);
 assert.equal(ui.isNameAllowed('meal','Pluxee'),true);
 state.catalogPrefs.push({group_key:'meal',item_key:'özel yemek',enabled:1,display_name:'Özel Yemek'});
 assert.equal(ui.isNameAllowed('meal','Özel Yemek'),true);
 assert.match(read('public/receivables-v9.js'),/HTCatalog21\.isNameAllowed\(group,name\)/);
 assert.doesNotMatch(read('public/index.html'),/id="htSettingsMealLogos"/);
 assert.match(read('public/receivables-v9.js'),/meal:\[/);
 assert.match(read('public/settings-v12.js'),/const mealPresets=\[/);
});

test('User choices can be saved and retrieved by role; bank type is validated',async()=>{
 const fake=dbMock();
 const r=await catalogPreferenceRoute(req({group:'payment',item_key:'paytr',
  display_name:'PayTR',enabled:true}),{DB:fake.DB},'/api/catalog-prefs','POST','admin');
 assert.equal(r.ok,true);
 assert.ok(fake.executed.some(x=>x.sql.includes('INSERT INTO catalog_preferences')&&
    x.args[0]==='payment'&&x.args[1]==='paytr'&&x.args[3]===1));
 await assert.rejects(()=>catalogPreferenceRoute(req({group:'payment',item_key:'paytr',enabled:true}),
   {DB:fake.DB},'/api/catalog-prefs','POST','viewer'),/yalnız yönetici/i);
 const found=await catalogPreferenceRoute(new Request('https://example.test/api/catalog-prefs'),
   {DB:fake.DB},'/api/catalog-prefs','GET','viewer');
 assert.ok(Array.isArray(found.catalogPrefs));
 await assert.rejects(()=>catalogPreferenceRoute(req({group:'bank',item_key:'paytr',enabled:true}),
   {DB:fake.DB},'/api/catalog-prefs','POST','admin'),/bu kategoriye ait değil/);
});

test('Rename only updates the catalog preference; old firm movements remain untouched',async()=>{
 const mock=dbMock();
 const r=await catalogPreferenceRoute(req({group:'meal',item_key:'Setcard',
  old_name:'Setcard',new_name:'Setcard Yeni'},'PATCH'),{DB:mock.DB},
   '/api/catalog-prefs','PATCH','admin');
 assert.equal(r.ok,true);assert.equal(mock.batches.length,1);
 assert.equal(mock.batches[0].length,2);
 assert.match(normalizeCatalogName('  İYİ   Pos  '),/iyi pos/);
 assert.ok(mock.executed.every(x=>!/firm_movements|cash_entries|payments|cards/i.test(x.sql)));
});

test('Firma ekranı temsilci adını belirgin gösterir ve finans firmasına temsilci ekleme yolu sunar',()=>{
 assert.match(directory,/Firma iş temsilcisi/);
 assert.match(directory,/data-dir-contact-start/);
 assert.match(directory,/const financialOnly=/);
 assert.match(directory,/data-dir-new-contact/);
 assert.match(directory,/directory\/with-contact/);
 assert.match(directory,/contact_name/);
 assert.match(directory,/contact_visit_day/);
 assert.match(read('src/directory.js'),/path==='\/api\/directory\/with-contact'/);
});

test('New firm plus work representative uses one atomic D1 batch',async()=>{
 const events=[],batches=[];
 const DB={
  prepare(sql){const rec={sql,args:[]};events.push(rec);return {
   bind(...args){rec.args=args;return this;},
   async first(){return null;}
  };},async batch(statements){batches.push(statements);return [];}}
 const response=await directoryRoute(new Request('https://example.test/api/directory/with-contact',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({name:'Örnek Firma',phone:'',visit_day:'',note:'',
    contact:{full_name:'Temsilci Adı',phone:'+90 532 111 22 33',visit_day:'Cuma',note:''}})
 }),{DB},'/api/directory/with-contact','POST');
 assert.ok(response.id);assert.ok(response.contact_id);
 assert.equal(batches.length,1);assert.equal(batches[0].length,2);
 assert.ok(events.some(x=>x.sql.includes('INSERT INTO directory_companies')));
 assert.ok(events.some(x=>x.sql.includes('INSERT INTO directory_contacts')));
 assert.ok(!events.some(x=>/cash_entries|firm_movements|DELETE FROM/i.test(x.sql)));
});

test('Finans POS summary shows pending POS, payment-provider receivables and actual bank deposits separately',()=>{
 const id1='11111111-1111-4111-8111-111111111111';
 const id2='22222222-2222-4222-8222-222222222222';
 const id3='33333333-3333-4333-8333-333333333333';
 const fake={insertAdjacentHTML(){}};
 const ctx={
  state:{institutions:[{id:'paytr',name:'PayTR',type:'payment'}],
   firms:[{id:id1,name:'PayTR POS',category:'receivable',receivable_group:'pos'},
    {id:id2,name:'Getir',category:'receivable',receivable_group:'platform',payout_institution_id:'paytr'},
    {id:id3,name:'Borç Hesabı',category:'payable',payout_institution_id:'paytr'}],
   accounts:[{id:'a1',type:'bank',institution_id:'paytr',name:'PayTR hesabı'}],
   entries:[{account_id:'a1',direction:'in',amount_kurus:30000,note:'Cari tahsilat: '+id1}]},
  el:id=>id==='coreBankStats'?fake:null,
  firmBalance:id=>id===id1?{remaining:70000}:id===id2?{remaining:80000}:{remaining:150000},
  currentBalance:id=>id==='a1'?30000:0,esc:x=>String(x),
  document:{addEventListener(){}},window:{renderCoreMoney(){}}
 };
 vm.runInNewContext(pos,ctx);
 const result=ctx.window.HTPOS21.readPos(ctx.state);
 assert.equal(result.firms.length,2);
 assert.equal(result.pending,150000);
 assert.equal(result.received,30000);
 assert.equal(result.accountAmount,30000);
 assert.match(index,/pos-v21\.js/);
 assert.match(read('public/catalog-v21.css'),/v21-pos-stats/);
});

test('New finance lists keep old bank accounts and firm balances unmodified',()=>{
 const code=read('public/pos-v21.js');
 assert.doesNotMatch(code,/\bapi\(|\bfetch\(|DELETE FROM|UPDATE firm_movements/);
 assert.match(code,/cash_entries|stateSnapshot\.entries/);
 assert.match(code,/payment/);
 assert.match(read('public/finance-suite.js'),/HTCatalog21\.isInstitutionAllowed/);
 assert.match(read('public/cards-pro.js'),/HTCatalog21\.isInstitutionAllowed/);
 assert.match(read('public/firms.js'),/HTCatalog21\.isInstitutionAllowed/);
});
