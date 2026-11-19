import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validReceivableGroup} from '../src/firms.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html'),nav=read('navigation-v18.js'),ux=read('ux-v19.js');
const css=read('ux-v19.css'),directory=read('directory-v17.js'),logos=read('logos-v17.js');
const core=read('core-money.js'),receivables=read('receivables-v9.js');

test('Finans replaces the long bottom label and shortcuts precede the monthly chart',()=>{
 const bottom=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.match(bottom,/data-v18-section="cardbank"[^>]*>[\s\S]*?<small>Finans<\/small>/);
 assert.doesNotMatch(bottom,/Kartlar &amp; Bankalar/);
 assert.match(nav,/cardbank:'Finans'/);
 assert.ok(html.indexOf('v8-shortcuts-heading')<html.indexOf('v8MonthlyChart'));
 assert.match(css,/v19-rep-card/);
});
test('Quick representatives show people, search and WhatsApp only; full directory remains separate',()=>{
 assert.match(directory,/id="representativesView"/);
 assert.match(directory,/id="dirQuickSearch"/);
 assert.match(directory,/id="dirQuickList"/);
 assert.match(directory,/function renderQuickRepresentatives\(/);
 assert.match(directory,/data-dir-chat-contact/);
 assert.match(html,/data-v18-link="representatives"/);
 assert.match(nav,/representatives:'Temsilci İletişimi'/);
 assert.match(html,/data-v18-section="firms"/);
 assert.match(directory,/id="dirTemplateDownload"/);
 const fast=directory.slice(directory.indexOf("'<section id=\"representativesView\""),
                            directory.indexOf("'<section id=\"directoryView\""));
 assert.doesNotMatch(fast,/data-dir-new-company|dirExcelInput|data-dir-delete|data-dir-edit-company/);
});
test('Veresiye records are grouped with Şahıs and no duplicate visible tab is shown',()=>{
 assert.equal(validReceivableGroup('veresiye'),'person');
 assert.match(core,/veresiye:\{title:'Veresiye Alacaklarım'/);
 assert.match(html,/id="coreVeresiyeStats"/);
 assert.match(html,/id="coreVeresiyeList"/);
 assert.doesNotMatch(html,/data-v19-platform="veresiye"/);
 // V51 restores the shortcuts in the create dialog without adding a duplicate navigation tab.
 assert.match(html,/data-v18-quick="veresiye-create"/);
 assert.match(html,/data-v18-quick="veresiye-payment"/);
 assert.match(nav,/case 'veresiye-create'/);
 assert.match(nav,/case 'veresiye-payment'/);
 assert.doesNotMatch(receivables,/data-v9-payout=/);
 assert.match(receivables,/institutionSelect\(\)/);
});
test('Logo management is collapsed, search-first, and can edit names without touching balances',()=>{
 assert.match(directory,/details class="ht-settings-panel v19-logo-details"/);
 assert.match(directory,/id="htLogoPanel"/);
 assert.match(logos,/if\(!term\)/);
 assert.match(logos,/data-v19-rename/);
 assert.match(logos,/window\.openFirmForm\('edit',id\)/);
 assert.match(logos,/window\.openInstitutionManager\(\{editId:id/);
 assert.doesNotMatch(logos,/\bapi\('firm-movements'/);
});
test('Catalog shows only active connections unless the full catalogue is requested',()=>{
 const map=new Map();
 const el=id=>{
  if(!map.has(id))map.set(id,{value:'bank',open:true,hidden:false,textContent:'',innerHTML:'',
   insertAdjacentHTML(){},classList:{toggle(){}},setAttribute(){}});
  return map.get(id);
 };
 const state={firms:[
  {id:'f1',name:'Getir',category:'receivable',receivable_group:'platform',payout_institution_id:'paytr'},
  {id:'f2',name:'Eminevim',category:'payable'}],
  accounts:[{id:'a',type:'bank',name:'Enpara'}],
  institutions:[{id:'paytr',type:'payment',is_active:1,name:'PayTR'},
                {id:'tami',type:'payment',is_active:1,name:'Tami POS'},
                {id:'qnb',type:'bank',is_active:1,name:'QNB'}],
  directory:{companies:[]}};
 const ctx={state,window:{v9ReceivablePresets:{platform:[['Getir','getir.com'],['Yemeksepeti','yemeksepeti.com']]}},
  document:{querySelectorAll(){return []},addEventListener(){}},
  el,esc:s=>String(s??''),currentRole:'admin'};
 vm.runInNewContext(ux,ctx);
 const bank=Array.from(ctx.window.HTV19.catalogItems('bank',false));
 assert.deepEqual(bank.map(x=>x.name),['Enpara']);
 const bankAll=Array.from(ctx.window.HTV19.catalogItems('bank',true));
 assert.ok(bankAll.some(x=>x.name==='QNB'));
 assert.deepEqual(Array.from(ctx.window.HTV19.catalogItems('payment',false)).map(x=>x.name),['PayTR']);
 assert.ok(ctx.window.HTV19.catalogItems('payment',true).some(x=>x.name==='Tami POS'));
 assert.deepEqual(Array.from(ctx.window.HTV19.catalogItems('platform',false)).map(x=>x.name),['Getir']);
 assert.ok(ctx.window.HTV19.catalogItems('platform',true).some(x=>x.name==='Yemeksepeti'));
});
