import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {firmRoute} from '../src/firms.js';
import {financeRoute,initializeFinanceAccountLinks} from '../src/finance.js';
import {institutionRoute,institutionNameKey} from '../src/card-catalog.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ID='10000000-0000-4000-8000-000000000001';
const ACC='20000000-0000-4000-8000-000000000002';
const req=(path,body,method='POST')=>new Request('https://example.test/api/'+path,{
 method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function mockFirm({category='payable',balance=765000,cash=850000}={}){
 const queries=[],batch=[];
 const DB={prepare(sql){
  const data={sql,args:[]};queries.push(data);
  return {bind(...args){data.args=args;return this;},
   async first(){
    if(sql.includes('FROM firms WHERE id='))return {id:ID,category,receivable_group:'general'};
    if(sql.includes('FROM firm_movements WHERE firm_id=')&&sql.includes('AS balance'))return {balance};
    if(sql.includes('FROM cash_accounts WHERE id='))return {id:ACC,type:'bank'};
    if(sql.includes('FROM cash_entries WHERE account_id=')&&sql.includes('AS balance'))return {balance:cash};
    return null;
   },
   async run(){return {meta:{changes:1}};}};
 },async batch(statements){batch.push(statements);return statements.map(()=>({meta:{changes:1}}));}};
 return {DB,queries,batch};
}

test('Firma 7650 TL borç, 8000 TL ödeme: 350 TL alacağım; banka/kart hareketi bağlı',async()=>{
 const d=mockFirm();
 const response=await firmRoute(req('settlements',{
  firm_id:ID,amount_kurus:800000,on_date:'2026-11-18',account_id:ACC
 }),{DB:d.DB},'/api/settlements','POST');
 assert.equal(response.ok,true);
 assert.equal(765000-800000,-35000);
 assert.equal(d.batch.length,1);
 assert.ok(d.queries.some(q=>q.sql.includes('INSERT INTO firm_movements')&&q.args.includes(800000)));
 assert.ok(d.queries.some(q=>q.sql.includes('INSERT INTO cash_entries')&&q.args.includes('out')&&q.args.includes(800000)));
 assert.ok(d.queries.some(q=>q.sql.includes('INSERT INTO linked_settlements')&&q.args.includes(800000)));
});

test('Şahıstan/platformdan fazla tahsilat yapılması hâlâ engelleniyor',async()=>{
 const db=mockFirm({category:'receivable'});
 await assert.rejects(()=>firmRoute(req('settlements',{firm_id:ID,amount_kurus:800000,
  on_date:'2026-11-18'}),{DB:db.DB},'/api/settlements','POST'),/mevcut alacağı aşamaz/);
 assert.equal(db.batch.length,0);
});

test('Fazla firmaya ödeme yapılırken banka bakiyesinin yeterli olması gerekir',async()=>{
 const db=mockFirm({cash:300000});
 await assert.rejects(()=>firmRoute(req('settlements',{firm_id:ID,amount_kurus:800000,
  on_date:'2026-11-18',account_id:ACC}),{DB:db.DB},'/api/settlements','POST'),/yetersiz/);
 assert.equal(db.batch.length,0);
});

test('Basit cari ödeme de tedarikçi fazlasını kabul eder fakat tahsilatı sınırlar',async()=>{
 const db=mockFirm();
 const response=await firmRoute(req('firm-movements',{
  firm_id:ID,kind:'settlement',amount_kurus:800000,on_date:'2026-11-18',note:'Fazla ödeme'
 }),{DB:db.DB},'/api/firm-movements','POST');
 assert.equal(response.ok,true);
 const insert=db.queries.find(q=>q.sql.startsWith('INSERT INTO firm_movements'));
 assert.match(insert.sql,/\\? = 'payable' OR/);
 assert.equal(insert.args.at(-3),'payable');
 assert.equal(insert.args.at(-1),800000);
 assert.match(read('public/ledger-v10.js'),/Fazla ödeme uyarısı/);
 assert.match(read('public/ledger-v10.js'),/fazladan '\\+money\(excess\)/);
 assert.match(read('public/firms.js'),/FİRMALARDAN ALACAĞIM/);
});

test('Genel Bakış fazla firmaya ödemeyi borçtan ayırıp gerçek alacak sayar',()=>{
 const js=read('public/overview.js'),ctx={window:{}};
 vm.runInNewContext(js,ctx);
 const p=ctx.window.computeFinancialOverview({
  cards:[],statements:[],payments:[],
  firms:[{id:'supplier',name:'Kopyala',category:'payable'}],
  firmMovements:[{firm_id:'supplier',kind:'charge',amount_kurus:765000},
   {firm_id:'supplier',kind:'settlement',amount_kurus:800000}],
  accounts:[],entries:[],instruments:[],reminders:[]
 });
 assert.equal(p.firmPayable,0);
 assert.equal(p.supplierCredit,35000);
 assert.equal(p.netDebt,-35000);
 assert.match(read('public/overview-render.js'),/p\.supplierCredit/);
});

test('POS account schema and migration are additive and keep historical IDs',async()=>{
 const q=[];
 const env={DB:{prepare(sql){q.push(sql);return {
  async all(){return {results:[{name:'id'},{name:'institution_id'}]};},
  async run(){return {meta:{changes:1}};}
 };}}};
 await initializeFinanceAccountLinks(env);
 assert.ok(q.some(x=>x.includes('ALTER TABLE cash_accounts ADD COLUMN is_pos')));
 assert.ok(q.every(x=>!/DELETE FROM cash_entries|DROP TABLE|UPDATE cash_accounts SET is_pos/i.test(x)));
});

test('Sanal POS banka hesabı ayrı olarak açılır ve ödeme kuruluşu kimliği korunur',async()=>{
 const q=[];
 const DB={prepare(sql){
  const r={sql,args:[]};q.push(r);
  return {bind(...args){r.args=args;return this;},
   async first(){return {id:'paytr'};},
   async run(){return {meta:{changes:1}};}};
 }};
 const ret=await financeRoute(req('accounts',{
  name:'PayTR Sanal POS',type:'bank',institution_id:'paytr',is_pos:true,opening_kurus:0
 }),{DB},'/api/accounts','POST');
 assert.equal(ret.ok,true);
 const insert=q.find(x=>x.sql.includes('INSERT INTO cash_accounts'));
 assert.match(insert.sql,/institution_id,is_pos/);
 assert.equal(insert.args.at(-2),'paytr');
 assert.equal(insert.args.at(-1),1);
 assert.ok(!q.some(x=>/INSERT INTO cash_entries/.test(x.sql)));
});

test('POS list recognizes flagged QNB, Akbank etc even though institution type is bank',()=>{
 const src=read('public/pos-v21.js');
 const context={window:{renderCoreMoney(){}},el:()=>null,document:{addEventListener(){}},
  state:{},firmBalance:()=>({remaining:0}),currentBalance:()=>50000};
 vm.runInNewContext(src,context);
 const result=context.window.HTPOS21.readPos({
  institutions:[{id:'qnb',name:'QNB',type:'bank'}],
  firms:[],firmMovements:[],entries:[],
  accounts:[{id:'pos',name:'QNB POS',type:'bank',institution_id:'qnb',is_pos:1},
   {id:'ordinary',name:'QNB banka',type:'bank',institution_id:'qnb',is_pos:0}]
 });
 assert.deepEqual([...result.posAccounts].map(x=>x.id),['pos']);
 assert.equal(result.accountAmount,50000);
 const ui=read('public/finance-suite.js');
 for(const name of ['PayTR Sanal POS','iyzico Sanal POS','Tami Sanal POS',
  'Akbank Sanal POS','QNB POS','Yapı Kredi POS','Enpara POS'])
  assert.ok(ui.includes(name),name);
});

test('PayTR/paytr and Unicode-equivalent institution names cannot be re-added',async()=>{
 assert.equal(institutionNameKey(' PayTR '),'paytr');
 assert.equal(institutionNameKey('PAYTR'),'paytr');
 assert.equal(institutionNameKey('  İYZİCO  '),'iyzico');
 const q=[];
 const DB={prepare(sql){
  q.push(sql);
  return {bind(){return this;},
   async all(){return {results:[{id:'paytr',name:'PayTR'}]};},
   async run(){return {meta:{changes:1}};}};
 }};
 await assert.rejects(()=>institutionRoute(req('institutions',{
  name:'paytr',type:'payment'
 }),{DB},'/api/institutions','POST','admin'),/zaten kayıtlı/);
 assert.ok(!q.some(x=>x.includes('INSERT INTO institutions')));
 await assert.rejects(()=>institutionRoute(req('institutions/import',{items:[
  {name:'PayTR',type:'payment'}]}),{DB},'/api/institutions/import','POST','admin'),/zaten kayıtlı/);
});

test('Duplicate institution UI preserves original IDs but shows only one PayTR',()=>{
 const js=read('public/ux-v24.js');
 const ctx={state:{institutions:[],cards:[],accounts:[],firms:[]},
  el:()=>null,document:{createElement(){return {};}},
  window:{renderSettings(){}}
 };
 vm.runInNewContext(js,ctx);
 const all=[
  {id:'paytr',name:'PayTR',is_custom:0,is_active:1},
  {id:'custom-copy',name:'paytr',is_custom:1,is_active:1},
  {id:'qnb',name:'QNB',is_custom:0,is_active:1}
 ];
 assert.equal(ctx.window.HTInstitution24.duplicates(all).length,1);
 const shown=ctx.window.HTInstitution24.uniqueInstitutions(all);
 assert.deepEqual([...shown].map(i=>i.id),['paytr','qnb']);
 assert.equal(all.length,3);
});

test('Yeni İşlem buttons are compact and Other choices visible by default even on mobile',()=>{
 const html=read('public/index.html'),css=read('public/ux-v24.css');
 assert.match(html,/<details class="v18-other-create" open>/);
 for(const action of ['pos-account-create','pos-sale','plan-create','bank-create',
  'person-create','veresiye-create'])assert.ok(html.includes('data-v18-quick="'+action+'"'));
 assert.match(read('public/navigation-v18.js'),/case 'pos-account-create'/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/#quickDialog \.v18-other-create \.quick-action-grid/);
});

test('Firma WhatsApp mesaj ayarları allow exactly one user-edited outgoing message',()=>{
 const js=read('public/workflows-v22.js');
 assert.match(js,/v24-message-settings/);
 assert.match(js,/data-v24-share-option/);
 assert.match(js,/Hangi bilgiler|hangi bilgiler gönderilsin/);
 assert.match(js,/const message=d\.message\.trim\(\)/);
 assert.match(js,/encodeURIComponent\(message\)/);
 assert.doesNotMatch(js,/encodeURIComponent\(message\+|encodeURIComponent\(lines/);
 assert.match(js,/addEventListener\('change',sync\)/);
});
