import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/settings-grid-v86.css');
const js=read('public/settings-grid-v85.js');

test('exactly nine existing Settings categories form the new three-column grid',()=>{
 const expected=['vault','bills','contacts','control','cards','banks','reports','security','logos'];
 assert.equal(JSON.parse(read('public/version.json')).version,'v89');
 assert.match(html,/name="ht-build" content="v89"/);
 assert.deepEqual([...html.matchAll(/data-v85-settings="([^"]+)"/g)].map(x=>x[1]),expected);
 assert.equal((html.match(/class="v85-setting-tile/g)||[]).length,9);
 assert.doesNotMatch(html,/data-v85-settings="updates"/);
 assert.match(html,/class="v85-hub-intro"[^>]*>[\s\S]*?<h2>Bölümler<\/h2>/);
 assert.match(css,/#settingsView \.v85-settings-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/s);
 assert.match(css,/@media\(max-width:740px\)\s*\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/\.v85-tile-desc\s*\{\s*display:none!important/);
 assert.match(html,/href="\/settings-grid-v86\.css\?v=86"/);
 assert.ok(html.indexOf('settings-grid-v86.css')>html.indexOf('settings-grid-v85.css'));
});

test('existing app update checker is reachable in Control Center, not lost or recreated',()=>{
 assert.match(html,/id="v86AppVersionLink"[^>]*data-v86-open-version/);
 assert.match(html,/>Uygulama ve Sürüm</);
 assert.match(html,/id="v68UpdateFooter"/);
 assert.match(html,/id="v67UpdateTile"/);
 assert.match(html,/id="htCheckUpdates"/);
 assert.match(html,/id="htApplyUpdate"/);
 assert.match(html,/class="ht-settings-panel pwa-install-panel"/);
 assert.match(js,/updates:\['Uygulama ve Sürüm'/);
 assert.match(js,/if\(event\.target\.closest\('\[data-v86-open-version\]'\)\)/);
 assert.match(js,/view\.dataset\.v85Screen==='control'/);
 assert.match(js,/if\(view\.dataset\.v85Screen==='updates'\)open\('control'\)/);
 assert.match(css,/#settingsView\[data-v85-screen="control"\] #v86AppVersionLink/);
 assert.match(css,/#settingsView\[data-v85-screen="updates"\] > #v68UpdateFooter/);
 assert.match(css,/#settingsView\[data-v85-screen="updates"\] > \.pwa-install-panel/);
 assert.doesNotMatch(js,/\bfetch\s*\(/);
});

test('real UI event flow: Control Center > Uygulama ve Sürüm > back works',()=>{
 const backText={textContent:'Ayarlar'};
 const center={open:false,querySelectorAll:()=>Array.from({length:20},()=>({dataset:{}}))};
 const elements={
  settingsView:{dataset:{}},
  v85SettingsHub:{hidden:true},
  v85SettingsDetail:{hidden:true,querySelector:sel=>sel==='[data-v85-settings-back] span'?backText:null},
  v85SettingsDetailTitle:{textContent:''},
  v85SettingsDetailDescription:{textContent:''},
  v60Center:center
 };
 const events={};
 const document={
  getElementById:id=>elements[id]||null,
  querySelector:()=>null,
  addEventListener:(event,fn)=>{events[event]=fn;}
 };
 const window={HTIdentity:{role:'admin'},tab:()=>{},scrollTo:()=>{}};
 vm.runInNewContext(js,{document,window});
 assert.equal(elements.settingsView.dataset.v85Screen,'home');
 assert.equal(elements.v85SettingsHub.hidden,false);
 window.HTSettingsGrid.open('control');
 assert.equal(elements.settingsView.dataset.v85Screen,'control');
 assert.equal(center.open,true);
 function click(query){
  events.click({target:{closest:sel=>sel===query?{}:null}});
 }
 click('[data-v86-open-version]');
 assert.equal(elements.settingsView.dataset.v85Screen,'updates');
 assert.equal(elements.v85SettingsDetailTitle.textContent,'Uygulama ve Sürüm');
 assert.equal(backText.textContent,'Kontrol Merkezi');
 click('[data-v85-settings-back]');
 assert.equal(elements.settingsView.dataset.v85Screen,'control');
 assert.equal(backText.textContent,'Ayarlar');
 click('[data-v85-settings-back]');
 assert.equal(elements.settingsView.dataset.v85Screen,'home');
 window.HTIdentity.role='user';
 window.HTSettingsGrid.applyRole();
 assert.equal(elements.v85SettingsHub.hidden,true);
 assert.equal(Object.hasOwn(elements.settingsView.dataset,'v85Screen'),false);
});

test('all financial, authentication and member controls remain original',()=>{
 assert.equal((html.match(/<details class="v60-tool v60-tone-/g)||[]).length,20);
 for(const id of ['v26UsersPanel','v26UsersList','v85PermissionsDialog','htLogoPanel',
  'v60Center','v60PdfInspect','v60PdfCard','htCheckUpdates','htApplyUpdate','htThemeToggle']){
  if(id==='v85PermissionsDialog')assert.match(read('public/users-v26.js'),/id="v85PermissionsDialog"/);
  else assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(read('public/settings-grid-v85.css'),/#settingsView\[data-v85-screen="updates"\] > :is\(#v68UpdateFooter,\.pwa-install-panel\)/);
 assert.doesNotMatch(css,/\b(?:localStorage|indexedDB|fetch|XMLHttpRequest)\s*\(/);
 assert.doesNotMatch(css,/\b(?:DROP TABLE|DELETE FROM|TRUNCATE TABLE)\b/i);
 assert.match(read('docs/SETTINGS_GRID_V86.md'),/veritabanı/);
});

test('new light/dark cards and navigation remain accessible and compact',()=>{
 assert.match(css,/html\[data-ht-theme="dark"\] #settingsView #v86AppVersionLink/);
 assert.match(css,/#settingsView #v86AppVersionLink:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/@media print/);
 assert.match(css,/#settingsView .v85-setting-tile strong/);
 assert.match(read('public/theme-v81.js'),/ht-ui-theme-v81/);
 const nav=html.match(/<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 assert.deepEqual([...nav.matchAll(/data-v18-section="([^"]+)"/g)].map(x=>x[1]),
 ['overview','cardbank','accounts','firms','settings']);
});
