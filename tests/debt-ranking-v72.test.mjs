import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const asset=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=asset('index.html'),code=asset('debt-ranking-v72.js');
const ctx={window:{}};
vm.runInNewContext(code,ctx);
const {cardOpenTotals,rankCards,rankFirms}=ctx.window.HTDebtRankingV72;

test('Card debt ranking uses unpaid statement balances after recorded payments',()=>{
 const statements=[
   {id:'s1',card_id:'a',amount_kurus:100000},
   {id:'s2',card_id:'b',amount_kurus:180000},
   {id:'s3',card_id:'a',amount_kurus:50000}
 ];
 const payments=[
   {statement_id:'s1',amount_kurus:70000},
   {statement_id:'s2',amount_kurus:30000},
   {statement_id:'s3',amount_kurus:25000}
 ];
 const totals=cardOpenTotals(statements,payments);
 assert.equal(totals.get('a'),55000);
 assert.equal(totals.get('b'),150000);
 const cards=[{id:'a',bank:'Akbank',currency:'TRY'},{id:'b',bank:'İş Bankası',currency:'TRY'}];
 assert.deepEqual([...rankCards(cards,totals,'debt_desc')].map(c=>c.id),['b','a']);
 assert.deepEqual([...rankCards(cards,totals,'debt_asc')].map(c=>c.id),['a','b']);
});

test('Different card currencies are not numerically added or compared as TRY',()=>{
 const cards=[{id:'eur',bank:'Euro Bank',currency:'EUR'},{id:'tl',bank:'TL Bank',currency:'TRY'}];
 const totals=new Map([['eur',50000000],['tl',6000]]);
 assert.deepEqual([...rankCards(cards,totals,'debt_desc')].map(c=>c.id),['tl','eur']);
});

test('Firm ranking separates payable and receivable balances and handles credit',()=>{
 const firms=[
   {id:'zero',name:'A Sıfır'},
   {id:'high',name:'B Yüksek'},
   {id:'low',name:'C Düşük'},
   {id:'credit',name:'D Fazla'}
 ];
 const balances={zero:{charges:0,settled:0,remaining:0},
  high:{charges:250000,settled:50000,remaining:200000},
  low:{charges:90000,settled:50000,remaining:40000},
  credit:{charges:30000,settled:60000,remaining:-30000}};
 const get=f=>balances[f.id];
 assert.deepEqual([...rankFirms(firms,get,'','remaining_desc','open')].map(x=>x.id),['high','low']);
 assert.deepEqual([...rankFirms(firms,get,'','remaining_asc','open')].map(x=>x.id),['low','high']);
 assert.deepEqual([...rankFirms(firms,get,'','charges_desc','all')].map(x=>x.id),['high','low','credit','zero']);
 assert.deepEqual([...rankFirms(firms,get,'','settled_desc','all')].map(x=>x.id),['credit','high','low','zero']);
 assert.deepEqual([...rankFirms(firms,get,'','remaining_desc','clear')].map(x=>x.id),['zero']);
 assert.deepEqual([...rankFirms(firms,get,'','remaining_desc','credit')].map(x=>x.id),['credit']);
 assert.deepEqual([...rankFirms(firms,get,'yüksek','remaining_desc','all')].map(x=>x.id),['high']);
});

test('Broken v71 invoice/statement photo import is removed, normal editing survives',()=>{
 assert.doesNotMatch(html,/document-import-v71|v71Doc|data-v71-photo|Fotoğrafından Ekle/);
 assert.doesNotMatch(asset('bills-v50.js'),/openImportedDraft|data-v71-photo|v71-import-warning/);
 assert.doesNotMatch(asset('app.js'),/HTStatementImportV71/);
 assert.equal(existsSync(new URL('../public/document-import-v71.js',import.meta.url)),false);
 assert.equal(existsSync(new URL('../public/document-import-v71.css',import.meta.url)),false);
 assert.match(html,/id="v50BillAdd"/);
 assert.match(html,/data-open="statement"/);
 assert.match(html,/id="v72BillClearFilters"/);
 assert.match(asset('bills-v50.js'),/v72BillClearFilters/);
});

test('Mobile and desktop rank actual firm balances; existing forms remain',()=>{
 assert.match(asset('firms.js'),/HTDebtRankingV72\?\.rankFirms/);
 assert.match(asset('approved-ui-v70.js'),/HTDebtRankingV72\?\.rankFirms/);
 assert.match(asset('cards-pro.js'),/cardOpenTotals/);
 assert.match(html,/value="debt_desc"/);
 assert.match(html,/id="v72PayablesSort"/);
 assert.match(html,/id="v72ReceivablesSort"/);
 assert.match(html,/id="v72DebtInsights"/);
 assert.match(asset('firms.js'),/data-firm-settle/);
 assert.match(asset('bills-v50.js'),/await api\('bills'/);
 assert.doesNotMatch(code,/\bfetch\(|\bapi\(/);
});
