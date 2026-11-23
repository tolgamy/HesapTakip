import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/photo-settings-v77.css');
const biometrics=read('public/biometric-v56.js');
const server=read('src/index.js');
const version=JSON.parse(read('public/version.json'));
const settingsStart=html.indexOf('<section id="settingsView"');
const settingsEnd=html.indexOf('<section id="calendarView"',settingsStart);
const settings=html.slice(settingsStart,settingsEnd);

test('Photo Settings keeps existing navigation buttons, reports and security functions',()=>{
 for(const id of ['v68UserAccountsTile','v68BillsTile','v60Center','v75UserGuide','manageInstitutions']){
  assert.match(settings,new RegExp('id="'+id+'"'));
 }
 for(const action of ['data-v68-open-users','data-v68-open-bills','data-ht-pin-lock','data-ht-pin-change']){
  assert.ok(settings.includes(action),action);
 }
 assert.match(settings,/id="v60Center"[^>]*v60-center/);
 assert.match(settings,/id="v75UserGuide"[^>]*v75-user-guide/);
 assert.match(biometrics,/target\?\.insertAdjacentElement\('afterend',panel\)/);
 assert.match(biometrics,/id="htBioRegister"/);
 assert.match(read('public/v60-ui.js'),/getElementById\('v60Center'\)/);
});

test('Settings cards are ordered: short links, control center, PIN, then help',()=>{
 const positions=[
  settings.indexOf('id="v68UserAccountsTile"'),
  settings.indexOf('id="v68BillsTile"'),
  settings.indexOf('id="v60Center"'),
  settings.indexOf('aria-label="Güvenlik ve Erişim"'),
  settings.indexOf('class="ht-pin-settings"'),
  settings.indexOf('aria-label="Destek"'),
  settings.indexOf('id="v75UserGuide"')
 ];
 assert.ok(positions.every(p=>p>=0),'All items are present');
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.match(settings,/Güvenlik ve Erişim/);
 assert.match(settings,/Diğer Ayarlar/);
 assert.doesNotMatch(settings,/id="v75UserGuide"[^>]*\bopen\b/);
});

test('Photographic settings are scoped and mobile friendly with graceful fallback',()=>{
 assert.match(html,/photo-settings-v77\.css\?v=77/);
 assert.match(css,/#settingsView \.v68-settings-main/);
 assert.match(css,/#settingsView \.v60-center-heading/);
 assert.match(css,/#settingsView \.ht-pin-settings/);
 assert.match(css,/#settingsView \.v75-user-guide/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/background-color/);
 const matches=css.match(/https:\/\/images\.unsplash\.com\/photo-[^")\s]*/g)||[];
 assert.ok(matches.length>=6,'Six separate real-photo card/banner references');
 assert.ok(matches.every(x=>/\bw=\d+/.test(x)&&/\bq=\d+/.test(x)),'Optimized photo resolution and quality');
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
 assert.match(css,/:focus-visible/);
});

test('CSP permits only the photo CDN as additional image host',()=>{
 const csp=server.match(/'Content-Security-Policy':\s*"([^"]+)"/)?.[1]||'';
 assert.match(csp,/img-src[^;]*https:\/\/images\.unsplash\.com/);
 assert.doesNotMatch(csp,/script-src[^;]*images\.unsplash\.com/);
 assert.doesNotMatch(csp,/connect-src[^;]*images\.unsplash\.com/);
 assert.match(csp,/font-src 'self'/);
 const doc=read('docs/PHOTO_SETTINGS_V77.md');
 assert.match(doc,/https:\/\/unsplash\.com\/license/);
 assert.match(doc,/Gizlilik ve çalışma şekli/);
});

test('Settings v77 remains intact in v78 without changing payment/database logic',()=>{
 assert.equal(version.version,'v97');
 assert.match(html,/name="ht-build" content="v97"/);
 assert.match(read('src/index.js'),/if \(path === '\/api\/payments' && method === 'POST'\)/);
 assert.match(read('public/index.html'),/data-ht-pin-change/);
});
