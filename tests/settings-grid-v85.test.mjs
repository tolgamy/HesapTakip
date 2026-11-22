import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/settings-grid-v85.css');
const js=read('public/settings-grid-v85.js');
const users=read('public/users-v26.js');

test('v86 Settings homepage retains nine functioning category targets',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v96');
 assert.match(html,/name="ht-build" content="v96"/);
 assert.match(html,/href="\/settings-grid-v85\.css\?v=85"/);
 assert.match(html,/src="\/settings-grid-v85\.js\?v=87"/);
 assert.ok(html.indexOf('settings-grid-v85.css')>html.indexOf('settings-flow-v84.css'));
 const tiles=[...html.matchAll(/data-v85-settings="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(tiles,['vault','bills','contacts','control','cards','banks','reports','security','logos']);
 for(const id of ['v85SettingsHub','v85SettingsDetail','v85SettingsDetailTitle','v85SettingsDetailDescription']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/data-v85-settings-back/);
 assert.match(read('public/settings-grid-v86.css'),/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(css,/v85-tile-mint/);
 assert.match(css,/v85-tile-lilac/);
 assert.match(css,/#settingsView\[data-v85-screen\] > :not\(:where\(#v85SettingsHub,#v85SettingsDetail\)\)/);
 assert.match(css,/#settingsView\[data-v85-screen="home"\] > #v85SettingsDetail\{display:none!important\}/);
 assert.match(css,/#settingsView\[data-v85-screen\]:not\(\[data-v85-screen="home"\]\) > #v85SettingsHub\{display:none!important\}/);
 assert.match(js,/hub\.hidden=view\.dataset\.v85Screen!=='home'/);
 assert.match(js,/header\.hidden=view\.dataset\.v85Screen==='home'/);
 
});

test('category routes open real existing screens or reuse controls; no fake transactions',()=>{
 for(const line of ["vault:'vault'","bills:'bills'"]){
  assert.ok(js.includes(line),line);
 }
 for(const actual of ['v60Center','htLogoPanel','v68UpdateFooter','htSettingsLinks','htSettingsRegistered',
  'v26UsersList','v26VaultList','v60PdfInspect','v60PdfCard','v60Gross','v60SearchType',
  'htPinChangeDialog','htCheckUpdates']){
  assert.ok(html.includes('id="'+actual+'"'),actual);
 }
 const tools=(html.match(/<details class="v60-tool v60-tone-/g)||[]).length;
 assert.equal(tools,20,'all twenty controls preserved');
 assert.match(js,/tool\.dataset\.v85Group=groups\[i\]/);
 assert.match(js,/const center=document\.getElementById\('v60Center'\)/);
 assert.doesNotMatch(js,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|setItem)\s*\(/);
 assert.doesNotMatch(js,/\b(?:DELETE FROM|DROP TABLE)\b/i);
});

test('admin-only grid; restricted users keep existing authorized Settings',()=>{
 assert.match(html,/<section id="v85SettingsHub"[^>]*hidden>/);
 assert.match(js,/const admin=\(\)=>window\.HTIdentity\?\.role==='admin'/);
 assert.match(js,/contacts:\['Kişisel Rehber'/);
 assert.match(js,/if\(!allowed\)\{\s*hub\.hidden=true/);
 assert.match(js,/delete view\.dataset\.v85Screen/);
 assert.match(js,/if\(!admin\(\)\|\|!target\)return/);
 assert.match(users,/window\.HTSettingsGrid\?\.applyRole\?\.\(\)/);
 assert.match(users,/el\('v26UsersList'\)\?\.replaceChildren\(\)/);
 assert.match(users,/if\(permissionDialog\?\.open\)permissionDialog\.close\(\)/);
 assert.match(users,/const membersLink=el\('v69MembersShortcut'\);if\(membersLink\)membersLink\.hidden=true/);
 assert.match(read('src/members-v26.js'),/principal\?\.role!=='admin'/);
});

test('permission gear is read-only until existing admin-authorized form submits',()=>{
 assert.match(users,/data-v85-permissions/);
 assert.match(users,/id="v85PermissionsDialog"/);
 assert.match(users,/dialog\.showModal\(\)/);
 assert.match(users,/data-v85-close-permissions/);
 assert.match(users,/contents\.innerHTML=permissionForm\(member\)/);
 assert.match(users,/aria-haspopup="dialog"/);
 assert.match(users,/el\('v26UsersList'\)\.addEventListener\('submit'/);
 assert.match(users,/await api\('users\/'\+form\.dataset\.v26User,'PATCH'/);
 assert.match(users,/d\.getAll\('permissions'\)/);
 assert.match(users,/data-v38-delete-user/);
 const beginning=users.indexOf(' function permissionForm(m){');
 const ending=users.indexOf(' function renderMembers(){',beginning);
 assert.ok(beginning>=0&&ending>beginning);
 const ctx={labels:{overview:'Genel Bakış',banking:'Bankalar',cards:'Kartlar',meal:'Yemek',
  platforms:'Platform',people:'Şahıs',payables:'Firma',directory:'Temsilciler',vault:'Kullanıcı İşlemleri'},
  e:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
 vm.runInNewContext(users.slice(beginning,ending)+'\nresult=permissionForm({id:"abc",display_name:"Deneme",username:"tester",status:"approved",permissions:["overview","cards"]});',ctx);
 const markup=ctx.result;
 assert.equal((markup.match(/name="permissions"/g)||[]).length,9);
 assert.equal((markup.match(/ checked/g)||[]).length,2);
 assert.match(markup,/name="status"/);
 assert.match(markup,/data-v26-user="abc"/);
 assert.match(markup,/Yetkileri kaydet \/ Onayla/);
});

test('modal fixes iPhone word-wrapping and preserves keyboard/reduced motion',()=>{
 assert.match(css,/#v85PermissionsDialog \.v26-permission-grid/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/#v85PermissionsDialog \.v26-permission span/);
 assert.match(css,/white-space:normal!important/);
 assert.match(css, /word-break:normal!important/);
 assert.match(css, /focus-visible/);
 assert.match(css, /@media\(max-width:740px\)/);
 assert.match(css, /@media\(max-width:360px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /safe-area-inset-top/);
 assert.match(read('docs/SETTINGS_GRID_V85.md'),/47d07758784a8e86ad836ee5c32551d9e6dc9746/);
});


test('initial admin dashboard and role-restoration show the grid without a stale detail header',()=>{
 const elements={
  settingsView:{dataset:{}},
  v85SettingsHub:{hidden:true},
  v85SettingsDetail:{hidden:false,querySelector:()=>({textContent:'Ayarlar'})},
  v85SettingsDetailTitle:{textContent:''},
  v85SettingsDetailDescription:{textContent:''},
  v60Center:{open:false,querySelectorAll:()=>Array.from({length:20},()=>({dataset:{}}))}
 };
 let role='admin';
 const win={HTIdentity:{role:'admin'},tab:()=>{},scrollTo:()=>{}};
 const document={
  getElementById:id=>elements[id]||null,
  querySelector:()=>null,
  addEventListener:()=>{}
 };
 vm.runInNewContext(js,{document,window:win});
 assert.equal(elements.settingsView.dataset.v85Screen,'home');
 assert.equal(elements.v85SettingsHub.hidden,false);
 assert.equal(elements.v85SettingsDetail.hidden,true,'admin login must not expose a stale heading');
 win.HTSettingsGrid.open('cards');
 assert.equal(elements.settingsView.dataset.v85Screen,'cards');
 assert.equal(elements.v85SettingsDetail.hidden,false);
 assert.equal(elements.v60Center.open,true);
 win.HTIdentity.role='user';
 win.HTSettingsGrid.applyRole();
 assert.equal(elements.v85SettingsHub.hidden,true);
 assert.equal(Object.hasOwn(elements.settingsView.dataset,'v85Screen'),false);
 win.HTIdentity.role='admin';
 elements.v85SettingsDetail.hidden=false;
 win.HTSettingsGrid.applyRole();
 assert.equal(elements.settingsView.dataset.v85Screen,'home');
 assert.equal(elements.v85SettingsDetail.hidden,true,'role restoration must hide the stale detail heading');
});
