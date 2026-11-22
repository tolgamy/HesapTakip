import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const js=read('public/unified-v88.js');
const css=read('public/unified-v88.css');

test('V1.1 UI module loads after V87 without disturbing existing views',()=>{
  assert.match(html,/unified-v88\.js\?v=88/);
  assert.match(html,/unified-v88\.css\?v=88/);
  assert.ok(html.indexOf('unified-v88.js')>html.indexOf('settings-grid-v85.js'));
  for(const id of ['cardsView','bankingView','collectionsView','payablesView',
    'v8AccountsList','payablesRows','v60Center','v60PdfFile','v60Gross','v60SearchText']){
    assert.ok(html.includes('id="'+id+'"'),id+' must be preserved');
  }
});
test('V1.1 JavaScript parses as classic browser script',()=>{
  assert.doesNotThrow(()=>new vm.Script(js,{filename:'unified-v88.js'}));
});
test('financial source of truth stays in live state, no write operations',()=>{
  assert.match(js,/typeof state==='undefined'\?null:state/);
  assert.match(js,/HTDebtRankingV72\?\.cardOpenTotals/);
  assert.match(js,/firmBalance\(f\.id\)/);
  assert.doesNotMatch(js,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|sessionStorage)\s*\(/);
  assert.doesNotMatch(js,/\bapi\s*\(/);
  assert.doesNotMatch(js,/\.delete\s*\(/);
});
test('three main screens share segmentation and summary style',()=>{
  assert.match(css,/#cardsView>\.v18-subnav/);
  assert.match(css,/#payablesView>\.v18-subnav/);
  assert.match(css,/#collectionsView>\.v8-account-tabs/);
  assert.match(css,/v88-main-summary/);
  assert.match(css,/v88-mini-grid/);
  assert.match(css,/html\[data-ht-theme="dark"\]/);
});
test('original finance tools remain in DOM; Settings duplicates do not',()=>{
  for(const group of ['cards','banks','reports','control']){
    assert.match(js,new RegExp("'"+group+"'"));
  }
  assert.match(js,/window\.HTSettingsGrid\?\.open\?\.\(group\)/);
  assert.match(js,/canUseTools=\(\)=>role\(\)==='admin'/);
  assert.match(css,/v85-setting-tile\[data-v85-settings="reports"\]/);
  assert.match(js,/dataset\.v88DeprecatedAdvice/);
});
