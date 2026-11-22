import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/settings-flow-v84.css');
const users=read('public/users-v26.js');
const nav=read('public/navigation-v18.js');

function fakeNode(tag='div'){
 return {
  tagName:tag, children:[], className:'',textContent:'',attributes:{},
  setAttribute(k,v){this.attributes[k]=String(v)},
  append(...nodes){this.children.push(...nodes)},
  replaceChildren(...nodes){this.children=[...nodes]}
 };
}
function evaluateRoster(members,isAdmin=true){
 const counts=fakeNode('div'),list=fakeNode('ul');
 const start=users.indexOf(' function renderMembersSummary(){');
 const end=users.indexOf(' function renderMembers(){');
 assert.ok(start>=0&&end>start,'read-only roster renderer found');
 const code=users.slice(start,end)+'\nrenderMembersSummary();';
 const env={members,admin:()=>isAdmin,el:id=>id==='v84MembersCounts'?counts:id==='v84ApprovedMembers'?list:null,
  document:{createElement:fakeNode}};
 vm.runInNewContext(code,env);
 return {counts,list};
}

test('v84 loads after existing light/dark styling and keeps correct real route',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v88');
 assert.match(html,/name="ht-build" content="v88"/);
 assert.match(html,/href="\/settings-flow-v84\.css\?v=84"/);
 assert.ok(html.indexOf('settings-flow-v84.css')>html.indexOf('finance-card-dark-v83.css'));
 assert.match(nav,/vault:'Giriş Bilgileri'/);
 assert.match(nav,/useraccounts:'Üye ve Yetki Yönetimi'/);
 assert.match(nav,/window\.HTIdentity\?\.role==='admin'/);
 assert.match(html,/data-v69-open-members/);
 assert.match(html,/id="v26UsersPanel"/);
 assert.match(html,/id="v26UsersList"/);
});

test('administrator sees an obvious real member roster before the control center',()=>{
 const m=html.match(/<section id="v69MembersShortcut"[^>]*>/)?.[0]||'';
 assert.match(m,/aria-labelledby="v84MembersHeading"/);
 assert.match(m,/\bhidden\b/,'hidden before auth and app initialization');
 const at=html.indexOf('id="v69MembersShortcut"'),center=html.indexOf('id="v60Center"');
 assert.ok(at>html.indexOf('id="v68BillsTile"'));
 assert.ok(at<center,'roster must not be buried in the control center');
 for(const id of ['v84MembersCounts','v84ApprovedMembers','v84MembersHint']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/Üyeleri yönet/);
 assert.match(html,/Giriş Bilgileri/);
 assert.match(html,/Banka ve platform şifre kasası/);
});

test('approved names and usernames come from actual member data, not mock records',()=>{
 const rows=[
  {display_name:'Ayşe Yılmaz',username:'ayse',status:'approved'},
  {display_name:'Mehmet Kaya',username:'mehmet',status:'pending'},
  {display_name:'Zeynep Demir',username:'zeynep',status:'approved'},
  {display_name:'Kadir',username:'kadir',status:'blocked'}
 ];
 const {counts,list}=evaluateRoster(rows);
 assert.deepEqual(counts.children.map(n=>n.textContent),['2 onaylı','1 bekliyor','1 engelli']);
 assert.equal(list.children.length,2);
 const names=list.children.map(li=>li.children[1].children[0].textContent);
 assert.deepEqual(names,['Ayşe Yılmaz','Zeynep Demir']);
 const handles=list.children.map(li=>li.children[1].children[1].textContent);
 assert.deepEqual(handles,['@ayse','@zeynep']);
 assert.ok(list.children.every(li=>li.children[2].textContent==='Onaylı'));
 assert.doesNotMatch(JSON.stringify(list),/Mehmet Kaya|kadir/i);
});

test('no roster for non-admin roles; backend enforces admin authorization',()=>{
 const {list,counts}=evaluateRoster([{display_name:'Hidden',username:'private',status:'approved'}],false);
 assert.equal(list.children.length,0);
 assert.equal(counts.children.length,0);
 const server=read('src/members-v26.js');
 assert.match(server,/principal\?\.role!=='admin'/);
 assert.match(server,/SELECT id,username,display_name,status,permissions,created_at,updated_at FROM app_members/);
 assert.match(users,/if\(!admin\(\)\)return;/);
 assert.match(users,/if\(membersLink\)membersLink\.hidden=true/);
});

test('member names use safe DOM textContent, with explicit empty and error states',()=>{
 const payload='<img src=x onerror=alert(1)>';
 const {list}=evaluateRoster([{display_name:payload,username:'x',status:'approved'}]);
 assert.equal(list.children[0].children[1].children[0].textContent,payload);
 assert.match(users,/name\.textContent=String\(m\.display_name/);
 assert.match(users,/handle\.textContent='@'\+String\(m\.username/);
 const empty=evaluateRoster([]);
 assert.match(empty.list.children[0].textContent,/Henüz onaylı üye yok/);
 assert.match(users,/Üye bilgileri alınamadı/);
 assert.match(users,/members=res\.users\|\|\[\];renderMembers\(\)/);
 assert.match(users,/renderMembersSummary\(\)/);
});

test('20 control-center tools are preserved, none forced open, and dark text is legible',()=>{
 assert.equal((html.match(/<details class="v60-tool v60-tone-/g)||[]).length,20);
 assert.doesNotMatch(html,/<details class="v60-tool v60-tone-[^"]+" open>/);
 assert.match(html,/id="v60Center"/);
 assert.match(css,/#settingsView \.v60-tool>summary/);
 assert.match(css,/html\[data-ht-theme="dark"\] #settingsView \.v60-tool>summary/);
 assert.match(css,/background:linear-gradient\(118deg,#22334e,#1c2b43\)!important/);
 assert.match(css,/color:#edf4ff!important/);
 assert.match(css,/#settingsView \.v60-tool-title/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('no record or authorization mutations introduced by the member summary',()=>{
 assert.match(read('public/navigation-v18.js'),/const primary=\{overview:'overview',cardbank:'cards',accounts:'collections',firms:'payables',settings:'settings'\}/);
 assert.doesNotMatch(css,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|setItem)\s*\(/);
 assert.doesNotMatch(css,/\b(?:DROP TABLE|DELETE FROM)\b/);
 assert.match(users,/await api\('users'\)/);
 assert.match(read('docs/SETTINGS_MEMBERS_V84.md'),/veritabanı/);
});
