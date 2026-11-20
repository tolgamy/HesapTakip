import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const firms=[
 {id,name:'Tokenflex',category:'receivable',receivable_group:'meal'},
 {id:id2,name:'Coca Cola',category:'payable'}
];
const movements=[
 {id:'33333333-3333-4333-8333-333333333333',firm_id:id,kind:'charge',
  amount_kurus:2000000,on_date:'2026-11-18',note:'Deneme alacağı'},
 {id:'44444444-4444-4444-8444-444444444444',firm_id:id,kind:'settlement',
  amount_kurus:500000,on_date:'2026-11-18',note:'Yemek kartı tahsilatı'},
 {id:'55555555-5555-4555-8555-555555555555',firm_id:id2,kind:'charge',
  amount_kurus:70000,on_date:'2026-11-17',note:'Tedarik'}
];
function scenario(identity={role:'admin',permissions:[]},role='admin'){
 const nodes=new Map();
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',
   addEventListener(){}});
  return nodes.get(id);
 };
 for(const key of ['v39ActivitySearch','v39ActivityGroup','v39ActivityKind',
  'v39ActivityFrom','v39ActivityTo'])el(key);
 const context={window:{HTIdentity:identity},state:{firms,firmMovements:movements},
  el,esc:v=>String(v),money:amount=>'₺'+(amount/100).toFixed(2),
  showDate:value=>value,currentRole:role};
 vm.runInNewContext(read('public/firm-activity-v39.js'),context);
 return {el,ui:context.window.HTFirmActivity39};
}
test('V39 firm history lists existing meal, supplier and settlement entries without modifying state',()=>{
 const x=scenario();
 x.ui.render();
 const html=x.el('v39ActivityList').innerHTML;
 assert.match(html,/Tokenflex/);
 assert.match(html,/Coca Cola/);
 assert.match(html,/Yemek kartı tahsilatı/);
 assert.match(html,/data-firm-movement-edit/);
 assert.match(html,/data-firm-movement-delete/);
 assert.equal(x.ui.rows().length,3);
 assert.match(x.el('v39ActivityCount').textContent,/3 hareket/);
 assert.equal(movements[0].amount_kurus,2000000);
});
test('V39 filters existing firm transaction entries by type, kind, name and date',()=>{
 const x=scenario();
 x.el('v39ActivityGroup').value='meal';
 x.el('v39ActivityKind').value='settlement';
 assert.equal(x.ui.rows().length,1);
 assert.equal(x.ui.rows()[0].movement.amount_kurus,500000);
 x.el('v39ActivitySearch').value='Token';
 assert.equal(x.ui.rows().length,1);
 x.el('v39ActivityFrom').value='2026-11-19';
 assert.equal(x.ui.rows().length,0);
 x.el('v39ActivityFrom').value='';
 x.el('v39ActivityKind').value='all';
 assert.equal(x.ui.rows().length,2);
});
test('V39 user with payables permission sees only payable company entries',()=>{
 const x=scenario({role:'user',permissions:['payables']},'user');
 assert.equal(x.ui.rows().length,1);
 assert.equal(x.ui.rows()[0].firm.name,'Coca Cola');
 const notAllowed=scenario({role:'user',permissions:['directory']},'user');
 assert.equal(notAllowed.ui.rows().length,0);
 const viewer=scenario({role:'admin',permissions:[]},'viewer');
 viewer.ui.render();
 assert.doesNotMatch(viewer.el('v39ActivityList').innerHTML,/data-firm-movement-delete/);
});
test('V39 meal card correction dialog has delete action for a single amount and each movement',()=>{
 const firmsSource=read('public/firms.js');
 assert.match(firmsSource,/singleCharge\?'<div class="v39-edit-delete">/);
 assert.match(firmsSource,/editing&&existingMoves\.length===1&&chargeMoves\.length===1/);
 assert.match(firmsSource,/data-firm-movement-delete/);
 assert.match(firmsSource,/singleCharge\.id/);
 assert.match(firmsSource,/m\.id/);
 assert.match(firmsSource,/api\('firm-movements\/'\+id,'DELETE'\)/);
 assert.match(firmsSource,/await load\(\)/);
 const correction=read('public/correction-v13.js');
 assert.match(correction,/id="v39DeleteCorrectionRecord"/);
 assert.match(correction,/await api\(deleteEndpoint,'DELETE'\)/);
 assert.match(correction,/fields,true,'firm-movements\/'\+id/);
 assert.match(correction,/fields,true,'entries\/'\+id/);
 assert.match(correction,/fields,true,'payments\/'\+id/);
 assert.match(correction,/confirm\(title\+' · '\+formatMoney\(oldAmount\)/);
});
test('V39 registered firm screen and navigation are consistent across desktop/mobile',()=>{
 const html=read('public/index.html');
 const nav=read('public/navigation-v18.js'),app=read('public/app.js');
 const permissions=read('public/users-v26.js'),search=read('public/home-search-v36.js');
 assert.match(html,/id="firmactivityView"/);
 for(const id of ['v39ActivityList','v39ActivitySearch','v39ActivityGroup',
  'v39ActivityKind','v39ActivityFrom','v39ActivityTo'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(nav,/f[i]rms:\['payables','directory','bills','representatives'\]/);
 assert.match(nav,/firmactivity:'Firma Hareketleri'/);
 assert.match(app,/firmactivity:\['Firma Hareketleri'/);
 assert.match(app,/window\.renderFirmActivity/);
 assert.match(permissions,/\['firmactivity','bills'\]\.includes\(node\.dataset\.v18Sub\)\?'payables'/);
 assert.match(search,/title:'Faturalar'/);
 assert.match(html,/firm-activity-v39\.js\?v=47/);
 assert.match(html,/firm-activity-v39\.css\?v=39/);
 assert.match(read('public/firm-activity-v39.css'),/@media\(max-width:620px\)/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v56');
 assert.match(html,/name="ht-build" content="v56"/);
});
test('V39 monetary deletion continues using balance-linked server safeguards',()=>{
 const api=read('src/firms.js'),bank=read('src/finance.js');
 assert.match(api,/if\(movementMatch && method==='DELETE'\)/);
 assert.match(api,/linked\.cash_entry_id/);
 assert.match(api,/linked\.card_id/);
 assert.match(api,/await env\.DB\.batch\(\[/);
 assert.match(api,/Bu borcu\/alacağı silmek bakiyeyi eksiye düşürür/);
 assert.match(bank,/if\(em&&method==='DELETE'\)/);
 assert.match(bank,/bir firma tahsilatı\/ödemesine bağlıdır/i);
 assert.match(read('public/finance-suite.js'),/data-suite-delete-entry/);
});
