import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),nav=read('navigation-v18.js'),
 users=read('users-v26.js'),app=read('app.js'),css=read('layout-v69.css');
const section=id=>html.slice(html.indexOf('id="'+id+'"'),id==='billsView'?html.indexOf('id="receivablesView"'):html.indexOf('</section>',html.indexOf('id="'+id+'"'))+10);

test('Settings has exactly two adjacent account and bill choices; vault no longer has a third tile',()=>{
 const settings=html.slice(html.indexOf('id="settingsView"'),html.indexOf('id="v60Center"'));
 assert.match(settings,/id="v68UserAccountsTile"[\s\S]*id="v68BillsTile"/);
 assert.match(settings,/data-v68-open-users/);
 assert.doesNotMatch(settings,/id="v67VaultTile"|data-v67-vault-open/);
 assert.match(settings,/Banka ve platform giriş bilgileri/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('User Accounts opens the existing encrypted vault; membership management stays admin-only',()=>{
 assert.match(nav,/data-v68-open-users/);
 assert.match(nav,/if\(window\.HTV26\?\.can\?\.\('vault'\)\)\{window\.tab\('vault'\)/);
 assert.match(nav,/data-v69-open-members/);
 assert.match(nav,/window\.HTIdentity\?\.role==='admin'\)\{window\.tab\('useraccounts'\)/);
 assert.match(app,/vault:\['Kullanıcı Hesapları'/);
 assert.match(app,/useraccounts:\['Üye ve Yetki Yönetimi'/);
 assert.match(html,/id="v26VaultPanel"/);
 assert.match(html,/id="v26UsersPanel"/);
 assert.match(html,/id="v26UsersList"/);
 assert.match(html,/id="v69MembersShortcut"/);
 assert.match(html,/data-v69-open-members/);
 assert.match(users,/const usersEntry=el\('v68UserAccountsTile'\);if\(usersEntry\)usersEntry\.hidden=!can\('vault'\)/);
 assert.match(users,/membersLink\.hidden=true/);
 assert.match(users,/api\('users'\)/);
 assert.match(users,/api\('vault'\)/);
});
test('Bill screen has return to Settings and no duplicate heading; all controls retained',()=>{
 const bill=section('billsView');
 assert.match(bill,/data-v68-settings-back/);
 assert.match(bill,/Ayarlar’a dön/);
 assert.doesNotMatch(bill,/<h2>Faturalar<\/h2>/);
 for(const id of ['v50BillAdd','v50BillStats','v50BillSearch','v50BillCategory',
  'v50BillStatus','v50BillPeriod','v50BillList'])
  assert.ok(bill.includes('id="'+id+'"'),id);
 assert.match(nav,/data-v68-settings-back/);
 assert.match(read('bills-v50.js'),/\['Açık fatura tutarı',money\(open\)\]/);
 assert.match(css,/#billsView \.v50-bill-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('Live vault search filters only already listed metadata, never decrypted secrets',async()=>{
 const nodes=new Map(),listeners={};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,addEventListener(){}});return nodes.get(id)};
 const ctx={window:{HTIdentity:{role:'admin'}},el,
  esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  api:async endpoint=>{
   assert.equal(endpoint,'vault');
   return {vault:[
    {id:'one',institution_name:'Örnek Banka',category:'bank',login_name:'cari',
      has_password:true,notes:''},
    {id:'two',institution_name:'Test Platformu',category:'platform',login_name:'panel',
      has_password:true,notes:''}
   ]};
  },
  document:{addEventListener:(type,fn)=>{listeners[type]=fn}},
  currentRole:'admin',
  navigator:{},notice(){},setTimeout(){},console
 };
 vm.runInNewContext(users,ctx);
 await ctx.window.HTV26.loadVault();
 assert.match(el('v26VaultList').innerHTML,/Örnek Banka/);
 assert.match(el('v26VaultList').innerHTML,/Test Platformu/);
 assert.match(el('v26VaultList').innerHTML,/••••••••/);
 assert.doesNotMatch(el('v26VaultList').innerHTML,/password-123/);
 el('v69VaultSearch').value='TEST PLAT';
 listeners.input({target:{id:'v69VaultSearch'}});
 assert.doesNotMatch(el('v26VaultList').innerHTML,/Örnek Banka/);
 assert.match(el('v26VaultList').innerHTML,/Test Platformu/);
 assert.match(el('v26VaultList').innerHTML,/data-v32-password-copy/);
 el('v69VaultSearch').value='';
 listeners.input({target:{id:'v69VaultSearch'}});
 assert.match(el('v26VaultList').innerHTML,/Örnek Banka/);
});
test('Version is consistent and no schema or user records were touched',()=>{
 const version=JSON.parse(read('version.json'));
 assert.equal(version.version,'v80');
 assert.match(html,/name="ht-build" content="v80"/);
 assert.match(html,/layout-v69\.css\?v=69/);
 assert.match(html,/users-v26\.js\?v=69/);
 assert.match(html,/navigation-v18\.js\?v=75/);
 assert.doesNotMatch(nav,/DELETE FROM|UPDATE vault|INSERT INTO/);
 assert.doesNotMatch(css,/display:\s*none!important\s*;\s*#v26VaultPanel/);
});
