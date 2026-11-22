import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const workflow=read('workflows-v22.js');
const cards=read('approved-ui-v70.js');
const html=read('index.html');

test('Firm notes are added at the end, not above filters and open-debt cards',()=>{
 const log=[];
 const stats={nextElementSibling:null};
 const filters={insertAdjacentElement(where,node){log.push(['move-summary',where,node===stats]);}};
 const head={insertAdjacentHTML(where,markup){log.push(['header',where,markup.includes('data-v22-supplier-add')]);}};
 const view={
  querySelector(selector){return selector==='.section-head'?head:selector==='.v72-firm-filters'?filters:null;},
  insertAdjacentHTML(where,markup){log.push(['notes',where,markup.includes('v22SupplierProfiles')]);}
 };
 const el=id=>({payablesView:view,payablesStats:stats})[id]||null;
 vm.runInNewContext(workflow,{el,document:{addEventListener(){}},window:{}});
 assert.deepEqual(log.map(x=>[...x]),[
  ['header','beforeend',true],
  ['notes','beforeend',true],
  ['move-summary','beforebegin',true]
 ]);
 assert.doesNotMatch(workflow,/head\.insertAdjacentHTML\('afterend','<section id="v22SupplierProfiles"/);
});

test('Mobile debt-card list is inserted before desktop table, not between summary and filters',()=>{
 const inserts=[];
 const table={insertAdjacentElement(where,node){inserts.push({where,id:node.id});}};
 const element={closest(selector){assert.equal(selector,'.table-wrap');return table;}};
 const view={};
 const document={
  readyState:'loading',
  listeners:{},
  addEventListener(name,fn){this.listeners[name]=fn;},
  getElementById(id){if(id==='payablesView')return view;if(id==='payablesRows')return element;return null;},
  createElement(){return {
    append(){},addEventListener(){},setAttribute(){},textContent:''
  };}
 };
 const context={window:{},document};
 vm.runInNewContext(cards,context);
 document.listeners.DOMContentLoaded();
 assert.equal(inserts.length,1);
 assert.equal(inserts[0].where,'beforebegin');
 assert.equal(inserts[0].id,'v70PayablesShell');
});

test('The profile and payment features remain available after reordering',()=>{
 assert.match(cards,/data-firm-settle/);
 assert.match(cards,/Kısmi Öde/);
 assert.match(workflow,/data-v22-profile-edit/);
 assert.match(workflow,/data-v22-profile-share/);
 assert.match(workflow,/renderSuppliers/);
 assert.match(html,/workflows-v22\.js\?v=75/);
 assert.match(html,/approved-ui-v70\.js\?v=74/);
 assert.match(html,/name="ht-build" content="v89"/);
});
