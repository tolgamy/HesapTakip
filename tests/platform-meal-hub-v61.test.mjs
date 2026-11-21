import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),js=read('platform-meal-hub-v61.js'),nav=read('navigation-v18.js');
test('Combined view keeps independent platform and meal records, forms and nav',()=>{
 for(const id of ['v61UnifiedRows','v61MealManage','v61PlatformManage','coreMealList','corePlatformList','v9MealInline','v9PlatformInline','v8MealAccounts'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const f of ['all','platform','meal'])assert.match(html,new RegExp('data-v61-filter="'+f+'"'));
 assert.match(html,/platform-meal-hub-v61\.css/);
 assert.match(html,/platform-meal-hub-v61\.js/);
 assert.match(nav,/cardbank:\['banking','cards'\]/);
 assert.match(nav,/accounts:\['collections','platforms','meal','people'\]/);
});
test('Summary adds only real outstanding platform and food-card receivables once',()=>{
 const dom=new Map(),el=id=>{if(!dom.has(id))dom.set(id,{innerHTML:'',textContent:'',hidden:false});return dom.get(id);};
 const values={p:12500,m:4500,d:50000,s:7000};
 const state={firms:[
  {id:'p',name:'Getir',category:'receivable',receivable_group:'platform'},
  {id:'m',name:'Setcard',category:'receivable',receivable_group:'meal'},
  {id:'d',name:'Tedarikçi',category:'payable'},
  {id:'s',name:'Mustafa',category:'receivable',receivable_group:'person'}]};
 const ctx={window:{renderCoreMoney(){}},state,el,esc:x=>String(x),
  money:n=>'₺'+(n/100).toFixed(2),firmBalance:id=>({remaining:values[id]}),
  document:{addEventListener(){},querySelectorAll(){return []}}};
 vm.runInNewContext(js,ctx);
 ctx.window.renderCoreMoney();
 assert.match(el('v61UnifiedRows').innerHTML,/Getir/);
 assert.match(el('v61UnifiedRows').innerHTML,/Setcard/);
 assert.doesNotMatch(el('v61UnifiedRows').innerHTML,/Tedarikçi|Mustafa/);
 assert.equal(el('v61TotalValue').textContent,'₺170.00');
 ctx.window.HTV61.setFilter('meal');
 assert.doesNotMatch(el('v61UnifiedRows').innerHTML,/Getir/);
 assert.equal(el('v61TotalValue').textContent,'₺45.00');
 ctx.window.HTV61.setFilter('platform');
 assert.equal(el('v61TotalValue').textContent,'₺125.00');
 assert.deepEqual(values,{p:12500,m:4500,d:50000,s:7000});
});
