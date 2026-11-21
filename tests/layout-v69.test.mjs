import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=x=>readFileSync(new URL('../public/'+x,import.meta.url),'utf8');
const html=read('index.html'),nav=read('navigation-v18.js'),
 members=read('users-v26.js'),app=read('app.js'),css=read('layout-v69.css');
const count=(x,re)=>Array.from(x.matchAll(re)).length;

test('Settings shows two adjacent tiles: User Accounts opens the existing secure vault, Bills stays separate',()=>{
 const settings=html.slice(html.indexOf('id="settingsView"'),html.indexOf('id="calendarView"'));
 assert.ok(settings.includes('id="v68UserAccountsTile"'));
 assert.ok(settings.includes('id="v68BillsTile"'));
 assert.ok(settings.indexOf('id="v68UserAccountsTile"')<settings.indexOf('id="v68BillsTile"'));
 assert.doesNotMatch(settings,/id="v67VaultTile"|data-v67-vault-open/);
 assert.match(settings,/data-v68-open-users/);
 assert.match(nav,/data-v68-open-users[\s\S]*?window\.tab\('vault'\)/);
 assert.match(nav,/data-v68-open-bills[\s\S]*?window\.tab\('bills'\)/);
 assert.match(app,/vault:\['Kullanıcı Hesapları','Banka ve platform giriş bilgileri'\]/);
 assert.match(nav,/vault:'Kullanıcı Hesapları'/);
 assert.equal(count(html,/id="v26VaultPanel"/g),1);
 assert.equal(count(html,/id="v26VaultList"/g),1);
 assert.equal(count(html,/id="v26VaultForm"/g),1);
 assert.match(css,/\.v69-vault-search/);
});
test('Membership approvals retain their original data/API and move under the administrator Control Center',()=>{
 const settings=html.slice(html.indexOf('id="settingsView"'),html.indexOf('id="calendarView"'));
 const membership=html.slice(html.indexOf('id="useraccountsView"'),html.indexOf('id="settingsView"'));
 assert.match(settings,/id="v60Center"[\s\S]*id="v69MemberManagement"/);
 assert.match(membership,/id="v26UsersPanel"/);
 assert.match(membership,/id="v26UsersList"/);
 assert.match(membership,/Üye ve Yetki Yönetimi/);
 assert.equal(count(html,/id="v26UsersPanel"/g),1);
 assert.equal(count(html,/id="v69MemberManagement"/g),1);
 assert.match(nav,/data-v69-open-members[\s\S]*?window\.tab\('useraccounts'\)/);
 assert.match(nav,/name==='useraccounts'&&window\.HTIdentity\?\.role!=='admin'/);
 assert.match(members,/membersControl\.hidden=!admin\(\)/);
 assert.match(members,/usersEntry\.hidden=!can\('vault'\)/);
 assert.match(members,/async function loadMembers\(\)/);
 assert.match(members,/api\('users'\)/);
 assert.match(members,/api\('users\/'\+form\.dataset\.v26User,'PATCH'/);
 assert.match(css,/#useraccountsView \.v26-permission-grid/);
});
test('Faturalar has working Settings back action, no repeated heading, and original invoice controls',()=>{
 const invoice=html.slice(html.indexOf('id="billsView"'),html.indexOf('id="receivablesView"'));
 assert.match(invoice,/data-v68-settings-back/);
 assert.match(nav,/data-v68-settings-back[\s\S]*?window\.tab\('settings'\)/);
 assert.doesNotMatch(invoice,/<h2>Faturalar<\/h2>/);
 for(const id of ['v50BillAdd','v50BillStats','v50BillSearch','v50BillCategory',
  'v50BillStatus','v50BillPeriod','v50BillList'])assert.ok(invoice.includes('id="'+id+'"'),id);
 assert.match(css,/#billsView \.v69-bills-back/);
 assert.match(css,/#billsView \.v50-bill-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('Search filters the existing vault entries by institution or username, without revealing passwords',async()=>{
 const nodes=new Map(),events=new Map();
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{id,value:'',innerHTML:'',textContent:'',hidden:false,
   addEventListener(){},classList:{add(){},remove(){},contains(){return false;}},
   children:[],setAttribute(){},querySelectorAll(){return [];}});
  return nodes.get(id);
 };
 const sample=[
  {id:'bank1',institution_name:'Akbank Sanal POS',category:'bank_pos',login_name:'pos-admin',
   has_password:true,extra_fields:[]},
  {id:'platform1',institution_name:'Setcard',category:'platform',login_name:'office',
   has_password:true,extra_fields:[]}
 ];
 const document={addEventListener(name,handler){events.set(name,handler);},querySelectorAll(){return [];}};
 const ctx={window:{HTIdentity:{role:'admin',permissions:['vault']}},document,el,
  esc:s=>String(s),api:async path=>{assert.equal(path,'vault');return {vault:sample};},
  notice(){},state:{},currentRole:'admin'};
 vm.runInNewContext(members,ctx);
 await ctx.window.HTV26.loadVault();
 assert.equal(el('v26VaultStatus').textContent,'2 giriş kaydı');
 assert.match(el('v26VaultList').innerHTML,/Akbank Sanal POS/);
 assert.match(el('v26VaultList').innerHTML,/Setcard/);
 assert.doesNotMatch(el('v26VaultList').innerHTML,/password-123/);
 el('v69VaultSearch').value='setcard';
 events.get('input')({target:el('v69VaultSearch')});
 assert.match(el('v26VaultStatus').textContent,/1 eşleşme \/ 2 giriş kaydı/);
 assert.match(el('v26VaultList').innerHTML,/Setcard/);
 assert.doesNotMatch(el('v26VaultList').innerHTML,/Akbank Sanal POS/);
 assert.equal(sample.length,2);
 el('v69VaultSearch').value='asla-bulunmaz';
 events.get('input')({target:el('v69VaultSearch')});
 assert.match(el('v26VaultList').innerHTML,/eşleşen giriş bilgisi bulunamadı/);
});
test('V69 is a UI release only, never copies account credentials into membership records',()=>{
 assert.match(html,/name="ht-build" content="v69"/);
 assert.equal(JSON.parse(read('version.json')).version,'v69');
 assert.match(html,/layout-v69\.css\?v=69/);
 assert.match(html,/users-v26\.js\?v=69/);
 assert.match(html,/navigation-v18\.js\?v=69/);
 assert.doesNotMatch(nav,/POST \/api|DELETE FROM|UPDATE vault/);
 assert.doesNotMatch(app,/DELETE FROM|UPDATE users/);
 assert.match(read('bills-v50.js'),/state\.bills/);
});
