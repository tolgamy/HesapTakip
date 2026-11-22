import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function renderDirectory(role='admin'){
 const values=new Map();
 const create=id=>{
  if(!values.has(id))values.set(id,{
   value:'',innerHTML:'',hidden:false,open:false,
   insertAdjacentHTML(){},
   addEventListener(){}
  });
  return values.get(id);
 };
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[ch]);
 const state={firms:[],directory:{
  companies:[{id:'company-1',name:'ALGIDA',phone:'+90 532 123 45 67',
    visit_day:'Pazartesi',note:'',logo_data:''}],
  contacts:[{id:'person-1',company_id:'company-1',full_name:'Hatice Ayhan',
    phone:'+90 539 215 65 83',visit_day:'Pazartesi',note:''}],
  templates:[]
 }};
 const doc={addEventListener(){},body:{insertAdjacentHTML(){}}};
 const context={window:{},document:doc,state,el:create,esc,currentRole:role,console};
 vm.runInNewContext(read('public/directory-v17.js'),context);
 context.window.HTDirectory.render();
 return values.get('directoryList').innerHTML;
}

test('V34 new transaction modal removes Other actions but retains core firm/platform/card/meal shortcuts',()=>{
 const html=read('public/index.html');
 const modal=html.match(/<dialog id="quickDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
 assert.ok(modal);
 assert.doesNotMatch(modal,/Diğer işlemler — tüm seçenekler|v18-other-create/);
 for(const action of ['firm-create','firm-charge','firm-payment','platform-sale','platform-payment',
  'card-create','card-payment','meal-sale','meal-payment'])
  assert.match(modal,new RegExp('data-v18-quick="'+action+'"'));
});

test('V34 mobile firm & representative card HTML includes phone, WhatsApp and a native gear menu',()=>{
 const html=renderDirectory('admin');
 assert.match(html,/ALGIDA/);
 assert.match(html,/Hatice Ayhan/);
 assert.match(html,/WhatsApp \/ Business/);
 assert.match(html,/>Ara<\/a>/);
 assert.match(html,/<details class="dir-mobile-gear">/);
 assert.match(html,/aria-label="İşlemler: ALGIDA \/ Hatice Ayhan"/);
 assert.equal((html.match(/<details class="dir-mobile-gear">/g)||[]).length,1,
  'Bir firma ve tek temsilci için yalnızca bir dişli menüsü olmalı');
 assert.doesNotMatch(html,/<div class="dir-card-head">[\s\S]*?<details class="dir-mobile-gear">[\s\S]*?<div class="dir-contact-list">/,
  'Dişli firma başlığında değil, WhatsApp ve Ara ile aynı satırda yer almalı');
 const actions=html.slice(html.indexOf('<div class="dir-contact-actions">'),
  html.indexOf('</div></div>',html.indexOf('<div class="dir-contact-actions">')));
 assert.match(actions,/WhatsApp \/ Business/);
 assert.match(actions,/>Ara<\/a>/);
 assert.match(actions,/<details class="dir-mobile-gear">/);
 assert.match(actions,/Firma işlemleri/);
 assert.match(actions,/Temsilci işlemleri/);
 for(const action of ['data-dir-new-contact','data-dir-edit-company',
  'data-dir-logo','data-dir-delete-company',
  'data-dir-edit-contact','data-dir-delete-contact'])
  assert.match(html,new RegExp(action+'='));
 assert.match(html,/<span class="dir-desktop-tools">/);
 assert.match(read('public/directory-v17.js'),/if\(mobileMenu\)mobileMenu.open=false;/);
});

test('V34 read-only users never get privileged mobile gear actions',()=>{
 const html=renderDirectory('viewer');
 assert.match(html,/WhatsApp \/ Business/);
 assert.doesNotMatch(html,/dir-mobile-gear|data-dir-delete-contact|data-dir-delete-company/);
});

test('V34 POS layout keeps full-width names and separates amounts from actions on narrow devices',()=>{
 const css=read('public/mobile-v34.css');
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/#v21PosStats \.v21-pos-stat>strong\{display:block/);
 assert.match(css,/#v21PosStats \.v21-pos-stat>small\{display:block/);
 assert.match(css,/#v21PosList \.v21-pos-row>div\{/);
 assert.match(css,/grid-column:1\/-1/);
 assert.match(css,/#v21PosList \.v21-pos-row>b\{/);
 assert.match(css,/#v21PosList \.v21-pos-row>button\{/);
 assert.match(css,/grid-column:2;min-height:44px/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/\.dir-desktop-tools\{display:none!important\}/);
 assert.match(css,/\.dir-mobile-gear\{display:block/);
 assert.match(css,/\.dir-mobile-gear-panel/);
 assert.match(read('public/index.html'),/href="\/mobile-v34.css"/);
});

test('V34 is CSS and UI only, without altering financial schema or stored transactions',()=>{
 const v=JSON.parse(read('public/version.json'));
 assert.equal(v.version,'v96');
 assert.match(read('public/index.html'),/name="ht-build" content="v96"/);
 const pos=read('public/pos-v21.js');
 assert.match(pos,/const pending=firms.reduce/);
 assert.match(pos,/const received=posCashIn.reduce/);
 assert.match(pos,/const accountAmount=posAccounts.reduce/);
});
