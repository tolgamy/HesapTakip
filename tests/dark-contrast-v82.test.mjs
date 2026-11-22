import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/dark-contrast-v82.css');
const html=read('public/index.html');

test('dark contrast overlay loads after v81 without changing the five financial views',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v87');
 assert.match(html,/name="ht-build" content="v87"/);
 assert.match(html,/href="\/dark-contrast-v82\.css\?v=82"/);
 assert.ok(html.indexOf('dark-contrast-v82.css')>html.indexOf('theme-v81.css'));
 for(const name of ['overview','cardbank','accounts','firms','settings']){
  assert.ok(html.includes('data-v18-section="'+name+'"'),name);
 }
 for(const id of ['overviewFirms','overviewLedger','overviewCash','overviewRecent',
  'v8NetValue','v8TotalReceivable','v8TotalDebt','v8MonthlyChart','htThemeToggle',
  'htLogoPanel','payablesStats','v67BrandGrid']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
});

test('fix hardcoded dark-ink colors in the actual financial overview rows',()=>{
 const original=read('public/styles.css');
 const v81=read('public/theme-v81.css');
 assert.match(original,/\.overview-line strong\{[^}]*color:#24444d/);
 assert.match(original,/\.overview-line>b\{[^}]*color:#103846/);
 assert.doesNotMatch(v81,/#overviewView \.overview-line(?: strong|>b|\s*\{)/);
 for(const selector of ['.overview-line strong','.overview-line small','.overview-line>b',
 '.overview-line>b.accent','.overview-line>b.danger','.overview-line-total']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/border-bottom:1px solid var\(--ht82-line\)!important/);
 assert.match(css,/white-space:normal/);
 assert.match(css,/overflow-wrap:anywhere/);
});

function rgb(hex){
 return [1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
}
function lum(hex){
 const x=rgb(hex);
 return x[0]*.2126+x[1]*.7152+x[2]*.0722;
}
function contrast(a,b){
 const x=lum(a),y=lum(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

test('main financial labels and accent amounts meet WCAG AA contrast on navy card',()=>{
 const vars={};
 for(const [,name,hex] of css.matchAll(/--ht82-([a-z]+):\s*(#[0-9a-fA-F]{6})/g))vars[name]=hex;
 for(const type of ['text','value','secondary','positive','negative']){
  assert.ok(vars[type],type+' token missing');
  assert.ok(contrast(vars[type],vars.card)>=4.5,type+' must meet 4.5:1 contrast');
 }
 assert.ok(contrast(vars.line,vars.card)>1.45,'separator should be subtly visible');
 assert.ok(contrast(vars.line,vars.card)<3.0,'separator should not dominate the text');
});

test('all five screens retain legible generic stats and iPhone scrolling controls',()=>{
 for(const sel of ['.stat .value','.v72-debt-tile-name','.v70-debt-name strong',
  '.v8-account-info small','.v8-recent-row-content strong','.due-desc strong',
  '.dist-top span','#payablesView #payablesStats>.stat:nth-child(3)']){
  assert.ok(css.includes(sel),sel);
 }
 assert.match(css,/scroll-padding-top:calc\(65px \+ env\(safe-area-inset-top,0px\)\)/);
 assert.match(css,/scroll-padding-bottom:calc\(124px \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(css,/padding-bottom:calc\(135px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/@media print/);
});

test('no change to accounting data, financial procedures or branding assets',()=>{
 assert.doesNotMatch(css,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|setItem|DELETE FROM|DROP TABLE)\s*\(/i);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
 assert.doesNotMatch(css,/₺\s*\d/);
 assert.match(read('public/theme-v81.js'),/ht-ui-theme-v81/);
 assert.match(read('public/overview-render.js'),/el\('overviewFirms'\)\.innerHTML/);
 assert.match(read('src/index.js'),/Content-Security-Policy/);
 assert.match(read('docs/DARK_CONTRAST_V82.md'),/D1|DB/);
});
