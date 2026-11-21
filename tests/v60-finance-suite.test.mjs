import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const coreSource=read('public/v60-core.js'),uiSource=read('public/v60-ui.js');
const html=read('public/index.html'),app=read('public/app.js');
const backend=read('src/index.js');
function model(){
 const root={};
 vm.runInNewContext(coreSource,{window:root,Intl,Date,Number,String,Array,Set,Map,Math});
 return root.HTV60Core;
}
const record={
 cards:[{id:'card1',bank:'Akbank',nickname:'İş kartı',last4:'4468',currency:'TRY'}],
 statements:[{id:'stmt1',card_id:'card1',period:'2026-11',due_date:'2026-11-20',amount_kurus:150000}],
 payments:[{id:'pay1',statement_id:'stmt1',paid_on:'2026-11-19',amount_kurus:50000},
           {id:'pay2',statement_id:'stmt1',paid_on:'2026-11-19',amount_kurus:50000}],
 firms:[{id:'firm1',name:'Tedarikçi',category:'payable'},{id:'firm2',name:'POS Firma',category:'receivable',receivable_group:'pos'}],
 firmMovements:[
  {id:'fm1',firm_id:'firm1',kind:'charge',on_date:'2026-11-01',due_date:'2026-11-21',amount_kurus:20000},
  {id:'fm2',firm_id:'firm1',kind:'settlement',on_date:'2026-11-12',amount_kurus:25000},
  {id:'fm3',firm_id:'firm2',kind:'charge',on_date:'2026-11-01',due_date:'2026-11-22',amount_kurus:80000}
 ],
 accounts:[{id:'bank1',name:'Enpara',type:'bank',opening_kurus:100000}],
 entries:[{id:'entry1',account_id:'bank1',direction:'in',amount_kurus:1000,entry_date:'2026-11-20',note:'POS'},
          {id:'entry2',account_id:'bank1',direction:'out',amount_kurus:2000,entry_date:'2026-11-20'}],
 bills:[{id:'bill1',provider:'İSKİ',due_date:'2026-11-19',amount_kurus:8000,paid_kurus:2000}],
 paymentPlans:[],planDues:[],instruments:[],
 directory:{companies:[{id:'comp1',name:'Gıda LTD',visit_day:'Cuma',phone:'905550000000'}],contacts:[]}
};
const today='2026-11-20';

test('V60 separate 20 controls, PDF/Excel only, no backup UI, scripts and CSS',()=>{
 assert.equal((html.match(/<details class="v60-tool v60-tone-/g)||[]).length,20);
 for(const id of ['v60Center','v60PdfCard','v60PdfFile','v60Today','v60Issues','v60Undo','v60From','v60SearchType','v60FilteredResults'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const file of ['v60-core.js','v60-ui.js','v60.css'])assert.ok(html.includes(file),file);
 assert.doesNotMatch(html,/id="backupDownloadBtn"|id="backupsView"|id="exportBtn"/);
 assert.match(app,/window\.renderV60\(\)/);
 assert.match(read('public/finance-suite.js'),/if\(!el\('backupRuns'\)\)return/);
 assert.doesNotMatch(backend,/await backupPrivateR2\(env/);
 assert.ok(read('public/version.json').includes('"v73"'));
});
test('V60 tools are in Settings, not General Overview, with one accessible SVG per tool',()=>{
 const overview=html.indexOf('id="overviewView"');
 const settings=html.indexOf('id="settingsView"');
 const center=html.indexOf('id="v60Center"');
 const nextView=html.indexOf('id="calendarView"');
 assert.ok(overview>=0&&settings>overview&&center>settings&&nextView>center);
 const overviewContent=html.slice(overview,settings);
 assert.doesNotMatch(overviewContent,/id="v60Center"|v60-tool/);
 assert.equal((html.match(/class="v60-section-header"/g)||[]).length,7);
 assert.equal((html.match(/class="v60-tool-icon"/g)||[]).length,20);
 assert.equal((html.match(/class="v60-tool-number"/g)||[]).length,20);
 assert.equal((html.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)||[]).length>=21,true);
 const themes=[...html.matchAll(/<details class="v60-tool v60-tone-([a-z]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(themes).size,20);
 const css=read('public/v60.css');
 for(const theme of themes)assert.ok(css.includes('.v60-tone-'+theme+'{'),theme);
 assert.match(css,/#settingsView \.v60-tool-icon/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.doesNotMatch(read('public/app.js'),/await backupPrivateR2/);
});

test('V60 core and UI scripts parse and analysis does not mutate financial records',()=>{
 assert.doesNotThrow(()=>new vm.Script(coreSource));
 assert.doesNotThrow(()=>new vm.Script(uiSource));
 const baseline=JSON.stringify(record),c=model(),out=c.summary(record,today);
 assert.equal(JSON.stringify(record),baseline);
 assert.equal(out.balances[0].balance_kurus,99000);
 assert.equal(out.firms.find(f=>f.id==='firm1').remaining,-5000);
 assert.equal(out.dueToday.length,1);
 assert.equal(out.dueToday[0].amount,50000);
 assert.equal(out.overdue[0].amount,6000);
 assert.ok(out.visits.some(x=>x.company==='Gıda LTD'));
 assert.ok(out.issues.some(x=>x.code==='FIRM_CREDIT'));
});
test('V60 catches exact duplicates and never auto deletes data',()=>{
 const c=model();
 const d=c.duplicateGroups(record);
 assert.equal(d.length,1);
 assert.equal(d[0].length,2);
 assert.equal(d[0][0].type,'Kart ödemesi');
 assert.doesNotMatch(uiSource,/DELETE FROM|DROP TABLE|TRUNCATE/);
});
test('V60 firm settlement allocated once and overdraft reported',()=>{
 const c=model();
 const copy=JSON.parse(JSON.stringify(record));
 copy.entries.push({id:'entry3',account_id:'bank1',direction:'out',amount_kurus:150000,entry_date:'2026-11-20'});
 const result=c.summary(copy,today);
 assert.equal(result.balances[0].balance_kurus,-51000);
 assert.ok(result.issues.some(x=>x.code==='NEGATIVE_BALANCE'));
 assert.equal(result.dues.filter(x=>x.type==='Firma'&&x.name==='Tedarikçi').length,0);
});
test('V60 filters by date and type, keeps currencies separate',()=>{
 const c=model();
 const records=c.search(record,{q:'Akbank',kind:'statement',from:'2026-11-20',to:'2026-11-20'});
 assert.equal(records.length,1);
 assert.equal(records[0].amount,150000);
 assert.equal(c.search(record,{kind:'cash',from:'2026-11-21'}).length,0);
 assert.equal(c.monthly(record,today,1)[0].income,1000);
});
test('V60 report respects user request: XLSX and device PDF, no JSON export',()=>{
 assert.match(uiSource,/makeXlsx\(makeReportTables\(\)\)/);
 assert.match(uiSource,/w\.print\(\)/);
 assert.match(uiSource,/pdfjs-dist@4\.10\.38/);
 assert.match(html,/PDF cihazınızda okunur/);
 assert.match(backend,/pdfjs-dist@4\.10\.38/);
 assert.doesNotMatch(app,/hesaptakip-yedek-.*\.json/);
});

test('V60 browser render: nonzero V56 records stay visible and all 20 tools initialize',async()=>{
 const ids=[...html.matchAll(/id="(v60[A-Za-z0-9]+)"/g)].map(m=>m[1]);
 const nodes=new Map(ids.map(id=>[id,{
  id,value:'',dataset:{},hidden:false,innerHTML:'',textContent:'',
  addEventListener(){},classList:{toggle(){}},
  setAttribute(){},scrollIntoView(){}
 }]));
 const win={HTV60Core:model(),HTIdentity:{role:'admin',permissions:[]},
  HTCardToday28:{recommend(){return null;}}};
 const document={getElementById(id){return nodes.get(id)||null;}};
 const ctx={window:win,document,state:JSON.parse(JSON.stringify(record)),Intl,Date,Number,String,
  Array,Set,Map,Math,console,confirm:()=>false,esc:x=>String(x),
  trDate:()=>today,money:n=>Math.round(n)/100+' TL'};
 assert.doesNotThrow(()=>vm.runInNewContext(uiSource,ctx));
 assert.equal(typeof win.renderV60,'function');
 await win.renderV60();
 assert.match(nodes.get('v60Headline').innerHTML,/990 TL/);
 assert.match(nodes.get('v60Today').innerHTML,/Akbank/);
 assert.match(nodes.get('v60Issues').innerHTML,/FIRM_CREDIT/);
 assert.match(nodes.get('v60RecordCheck').textContent,/1 kart/);
 assert.match(nodes.get('v60FilteredCount').textContent,/kayıt/);
 assert.equal(nodes.get('v60Status').dataset.error,'0');
});
