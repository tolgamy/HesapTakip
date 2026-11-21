import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),js=read('platform-meal-hub-v61.js'),css=read('platform-meal-hub-v61.css'),nav=read('navigation-v18.js');
test('One-column platform list is unified without a visible meal/platform filter',()=>{
 for(const id of ['v61UnifiedRows','v61MealManage','v61PlatformManage','coreMealList','corePlatformList','v9MealInline','v9PlatformInline','v8MealAccounts'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const f of ['all','platform','meal'])assert.doesNotMatch(html,new RegExp('data-v61-filter="'+f+'"'));
 assert.match(html,/<div class="v61-head"><h2>Platformlar<\/h2>/);
 assert.match(html,/Toplam platform alacağı/);
 assert.match(css,/\.v61-rows\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.v61-name strong\{[^}]*white-space:normal/);
 assert.match(css,/\.v61-row\{[^}]*grid-template-columns:44px minmax\(0,1fr\) max-content 13px/);
 assert.match(nav,/cardbank:\['banking','cards'\]/);
 assert.match(nav,/accounts:\['collections','platforms','meal','people'\]/);
});
test('All recorded platform and meal balances appear as Platform and total exactly once',()=>{
 const dom=new Map(),el=id=>{if(!dom.has(id))dom.set(id,{innerHTML:'',textContent:'',hidden:false});return dom.get(id);};
 const values={p:12500,m:4500,d:50000,s:7000};
 const state={firms:[
  {id:'p',name:'Getir',category:'receivable',receivable_group:'platform'},
  {id:'m',name:'Metropolcard',category:'receivable',receivable_group:'meal'},
  {id:'d',name:'Tedarikçi',category:'payable'},
  {id:'s',name:'Mustafa',category:'receivable',receivable_group:'person'}]};
 const ctx={window:{renderCoreMoney(){}},state,el,esc:x=>String(x),
  money:n=>'₺'+(n/100).toFixed(2),firmBalance:id=>({remaining:values[id]}),
  document:{addEventListener(){},querySelectorAll(){return []}}};
 vm.runInNewContext(js,ctx);
 ctx.window.renderCoreMoney();
 const markup=el('v61UnifiedRows').innerHTML;
 assert.match(markup,/Getir/);
 assert.match(markup,/Metropolcard/);
 assert.doesNotMatch(markup,/Tedarikçi|Mustafa|Yemek Kartı/);
 assert.equal((markup.match(/<small>Platform<\/small>/g)||[]).length,2);
 assert.equal(el('v61TotalLabel').textContent,'Toplam platform alacağı');
 assert.equal(el('v61TotalValue').textContent,'₺170.00');
 // Older navigation links should not hide meal accounts.
 ctx.window.HTV61.setFilter('meal');
 assert.match(el('v61UnifiedRows').innerHTML,/Getir/);
 assert.match(el('v61UnifiedRows').innerHTML,/Metropolcard/);
 assert.equal(el('v61TotalValue').textContent,'₺170.00');
 assert.deepEqual(values,{p:12500,m:4500,d:50000,s:7000});
});
