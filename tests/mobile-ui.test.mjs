import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');

test('Mobil alt menüde tüm 5 finans başlığı ve Ayarlar görünür',()=>{
 const bar=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(bar);
 const destinations=[...bar.matchAll(/data-mobile-tab="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(destinations,['overview','cards','banking','collections','payables','settings']);
 for(const unwanted of ['Çek','Senet','Rapor','Diğer','Ekstre'])assert.ok(!bar.includes(unwanted),unwanted);
});
test('Masaüstünde 7 finans bölümü ve Ayarlar var, eski modüller yok',()=>{
 const nav=html.match(/<nav id="nav" class="nav"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(nav);
 const tabs=[...nav.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(tabs,['overview','cards','banking','meal','platforms','people','payables','directory','settings']);
});
test('Kredi kartlarının eski ekstre ve ödeme ekranları saklanır',()=>{
 const cardSection=html.slice(html.indexOf('<section id="cardsView"'),html.indexOf('<section id="collectionsView"'));
 assert.ok(cardSection.includes('id="statementRowsMobile"'));
 assert.ok(cardSection.includes('id="paymentRowsMobile"'));
 assert.match(js,/el\('statementRowsMobile'\)\.innerHTML/);
 assert.match(js,/el\('paymentRowsMobile'\)\.innerHTML/);
});
test('Yemek kartı, platform, şahıs ve banka panelleri gösterime hazır',()=>{
 for(const id of ['bankingView','mealView','platformsView','peopleView','collectionsView',
 'coreBankList','coreMealList','corePlatformList','corePeopleList','coreCollectionHub'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/data-quick-action="meal"/);
 assert.match(html,/data-quick-action="platform"/);
 assert.match(html,/data-quick-action="person"/);
 assert.match(html,/data-quick-action="bank"/);
 assert.match(html,/data-quick-action="payable"/);
 assert.match(css,/HesapTakip mobile V4/);
 assert.match(css,/HesapTakip v7/);
});
test('Tüm HTML id değerleri benzersizdir',()=>{
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});
