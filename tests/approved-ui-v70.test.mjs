import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const asset=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=asset('index.html');
const js=asset('approved-ui-v70.js');
const css=asset('approved-ui-v70.css');
const cards=asset('cards-pro.js');
const nav=asset('navigation-v18.js');

test('Onaylı üç ekranın varlıkları yükleniyor ve JavaScript ayrıştırılıyor',()=>{
 assert.match(html,/approved-ui-v70\.css\?v=70/);
 assert.match(html,/approved-ui-v70\.js\?v=73/);
 assert.doesNotThrow(()=>new Script(js));
 assert.match(css,/#v70PayablesShell/);
 assert.match(css,/#directoryView\.v70-dir-people #directoryList/);
 assert.match(css,/#cardsView .v70-compact-card/);
});
test('Finans sekmesi kartları açar ve banka alt sekmesini korur',()=>{
 assert.match(nav,/cardbank:\['banking','cards'\]/);
 assert.match(nav,/cardbank:'cards',accounts:'collections'/);
 assert.match(cards,/data-v70-card-id/);
 assert.match(js,/data-v47-card-history/);
 assert.match(js,/data-edit/);
 assert.match(js,/data-delete/);
});
test('Borç kartları eski ödeme ve hareket akışlarına bağlanır',()=>{
 for(const action of ['data-firm-view','data-firm-charge','data-firm-settle','data-firm-edit','data-firm-delete']){
  assert.ok(js.includes(action),action);
 }
 assert.match(js,/balance\.remaining<=0/);
 assert.match(js,/isReader\(\)/);
});
test('Rehberde tek görünür arama filtresi, mevcut veri kaydı bozulmadan kullanılır',()=>{
 assert.match(js,/dirQuickSearch/);
 assert.match(js,/dirQuickDayFilter/);
 assert.match(js,/dirSearch/);
 assert.match(js,/dirDayFilter/);
 assert.match(js,/renderQuickRepresentatives/);
 assert.match(css,/#directoryView #representativesView>\.v19-rep-search\{display:none!important\}/);
 assert.doesNotMatch(js,/\bapi\(|\bfetch\(|DELETE FROM|UPDATE firms/);
});
