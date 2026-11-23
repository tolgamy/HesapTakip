import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('public/finance-card-dark-v83.css');
const html=read('public/index.html');
const render=read('public/approved-ui-v70.js');
const released=JSON.parse(read('public/version.json'));

test('v83 applies only a dark-mode card contrast override after the v82 fix',()=>{
 assert.equal(released.version,'v97');
 assert.match(html,/name="ht-build" content="v97"/);
 assert.match(html,/href="\/finance-card-dark-v83\.css\?v=83"/);
 assert.ok(html.indexOf('finance-card-dark-v83.css')>html.indexOf('dark-contrast-v82.css'));
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 assert.doesNotMatch(css,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|setItem)\s*\(/);
 assert.doesNotMatch(css,/\b(?:DELETE FROM|DROP TABLE|TRUNCATE TABLE)\b/);
});

test('fix is tied to actual mobile compact card classes and working action handlers',()=>{
 for(const selector of ['.v70-compact-card','.v70-bank-info strong','.v70-bank-info p',
  '.v70-bank-actions>button','.v70-actions-menu>summary','.v70-gear>summary',
  '.v70-gear-menu','.v70-actions-menu-panel','.pro-card.v70-open']){
  assert.ok(css.includes(selector),'Missing '+selector);
 }
 assert.match(render,/txt\('button','','Kart Bilgileri'\)/);
 assert.match(render,/const opened=card\.classList\.toggle\('v70-open'\)/);
 assert.match(render,/details\.setAttribute\('aria-expanded',String\(opened\)\)/);
 assert.match(render,/txt\('summary','','İşlemler'\)/);
 assert.match(render,/summary\.setAttribute\('aria-label','Kart ayarları'\)/);
 assert.match(render,/formatCard\(c\.credit_limit_kurus,c\.currency\)/);
 assert.match(render,/formatCard\(c\.available_limit_kurus,c\.currency\)/);
 assert.match(render,/cloneNode\(true\)/);
});

function luminance(hex){
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
  .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
const contrast=(a,b)=>{
 const l=[luminance(a),luminance(b)].sort((x,y)=>x-y);
 return (l[1]+.05)/(l[0]+.05);
};
test('card labels and primary/secondary actions meet 4.5:1 on night surfaces',()=>{
 const pairs=[
  ['#f5f7ff','#17243a','Bank name'],
  ['#cbd7eb','#17243a','Masked digits, limit, available'],
  ['#ffffff','#315fae','Kart Bilgileri gradient'],
  ['#d8fff0','#19463f','İşlemler'],
  ['#e7f0ff','#26374f','Settings gear'],
  ['#e9f2ff','#273851','Popup action']
 ];
 for(const [front,back,label] of pairs){
  assert.ok(contrast(front,back)>=4.5,label+': '+contrast(front,back).toFixed(2));
 }
});

test('keeps official bank logo colors, iPhone touch controls and reduced-motion support',()=>{
 assert.match(css,/\.v70-bank-logo img/);
 assert.match(css,/background:#fff!important/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/focus-visible/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/@media print/);
 for(const id of ['cardList','htThemeToggle','overviewFirms','v67BrandGrid'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const section of ['overview','cardbank','accounts','firms','settings'])
  assert.ok(html.includes('data-v18-section="'+section+'"'),section);
});

test('no new payment logic or live data writes',()=>{
 assert.match(read('public/cards-pro.js'),/data-v70-card-id/);
 assert.match(read('public/approved-ui-v70.js'),/isReader\(\)/);
 assert.match(read('public/theme-v81.js'),/ht-ui-theme-v81/);
 assert.match(read('docs/FINANCE_DARK_V83.md'),/veritabanı/);
});
