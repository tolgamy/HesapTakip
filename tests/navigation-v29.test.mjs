import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('V29 desktop buttons work even when a former page was moved into Hesaplar',()=>{
 const app=read('app.js');
 const html=read('index.html');
 const start=app.indexOf('const tabTitles='),end=app.indexOf('function field(',start);
 assert.ok(start>=0&&end>start);
 const source=app.slice(start,end);
 assert.doesNotMatch(source,/vault:\['Kullanıcı İşlemleri'/);
 assert.match(source,/if\(view\)view\.hidden/);
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 // Directory is injected by directory-v17.js before the app initializes.
 assert.ok(read('directory-v17.js').includes('id="directoryView"'));
 ids.add('directoryView');
 const elements=new Map();
 const lookups=[];
 function element(id){
  lookups.push(id);
  if(!ids.has(id))return null; // Same as document.getElementById for non-existent panels
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',
   classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){}});
  return elements.get(id);
 }
 const ctx={window:{matchMedia:()=>({matches:false})},
  document:{querySelectorAll:()=>[]},
  el:element,currentRole:'admin',activeTab:'overview'};
 vm.runInNewContext(source+"\ntab('overview');tab('cards');tab('collections');tab('payables');tab('directory');",ctx);
 assert.equal(elements.get('directoryView').hidden,false);
 assert.equal(elements.get('cardsView').hidden,true);
 assert.ok(!lookups.includes('vaultView'));
});
