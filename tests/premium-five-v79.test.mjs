import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/premium-five-v79.css');

test('Five premium areas keep the original app views and current v78 build',()=>{
 assert.match(html,/premium-five-v79\.css\?v=79-review-1/);
 assert.ok(html.indexOf('premium-five-v79.css')>html.indexOf('photo-settings-v77.css'));
 assert.ok(html.indexOf('premium-five-v79.css')>html.indexOf('photo-sections-v78.css'));
 assert.ok(html.indexOf('premium-five-v79.css')>html.indexOf('color-icons-draft.css'));
 assert.match(html,/name="ht-build" content="v95"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v95');
 for(const name of ['overview','cardbank','accounts','firms','settings']){
   assert.match(html,new RegExp('data-v18-section="'+name+'"'),name);
 }
 for(const id of ['overviewView','cardsView','bankingView','collectionsView',
  'platformsView','peopleView','payablesView','settingsView']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
  assert.ok(css.includes('#'+id),id);
 }
 assert.match(read('public/navigation-v18.js'),/directoryView|directory/);
 assert.ok(css.includes('#directoryView'));
});

test('All main designs format existing dynamic data without inserting sample balances',()=>{
 for(const live of ['v8NetValue','v8TotalReceivable','v8TotalDebt',
  'v8RecentTransactions','v8MonthlyChart','cardList','coreBankList',
  'v8AccountsList','v61UnifiedRows','v72PayablesLeader',
  'v70PayablesShell','v67BrandGrid','v60Center']){
  if(live==='v70PayablesShell')assert.match(read('public/approved-ui-v70.js'),/v70PayablesShell/);
  else assert.ok(html.includes('id="'+live+'"'),live);
 }
 assert.doesNotMatch(css,/₺\s*\d/);
 assert.doesNotMatch(css,/\b(fetch|XMLHttpRequest|indexedDB|localStorage)\s*\(/);
 assert.doesNotMatch(css.split('@media print')[0],/\bdisplay\s*:\s*none\s*!important/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:370px/);
 assert.match(css,/focus-visible/);
});

test('Five premium areas rely on existing interactions, not fictitious new features',()=>{
 const nav=read('public/navigation-v18.js');
 assert.match(nav,/const primary=\{overview:'overview',cardbank:'cards',accounts:'collections',firms:'payables',settings:'settings'\}/);
 assert.deepEqual([...html.matchAll(/data-v8-accounts="([^"]+)"/g)].map(x=>x[1]),['platforms','people']);
 assert.match(html,/data-v68-open-bills/);
 assert.match(html,/data-v68-open-users/);
 assert.match(html,/data-ht-pin-change/);
 assert.match(read('public/ledger-v10.js'),/api\('settlements','POST',payload\)/);
 assert.match(read('src/index.js'),/if \(path === '\/api\/payments' && method === 'POST'\)/);
});

test('User logo overrides remain intact with brand-site default fallback',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('public/brand-v12.js'),ctx);
 const logo=ctx.window.HTBrand.logoSource;
 assert.equal(logo('Setcard','data:image/webp;base64,QUJD'),'data:image/webp;base64,QUJD');
 assert.match(logo('Setcard'),/^https:\/\/www\.google\.com\/s2\/favicons/);
 assert.match(logo('Edenred'),/^\/brand-icons-v67\//);
});
