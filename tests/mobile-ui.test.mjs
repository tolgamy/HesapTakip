import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');

test('Mobil alt menüde tam beş başlık bulunur',()=>{
 const bar=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(bar,'Mobil alt menü bulunamadı.');
 const destinations=[...bar.matchAll(/data-mobile-tab="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(destinations,['overview','cards','receivables','payables','other']);
 assert.ok(bar.includes('Firma &gt;')&&bar.includes('Firma &lt;'));
 assert.doesNotMatch(bar,/Ekstre|Rapor/);
});
test('Mobil Firma okları doğru cari hesap yönlerini kullanır',()=>{
 const bar=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.match(bar,/data-mobile-tab="receivables"[^>]*>[\s\S]*?Firma &gt;/);
 assert.match(bar,/data-mobile-tab="payables"[^>]*>[\s\S]*?Firma &lt;/);
});
test('Kart ekranı ekstre ve kart ödemelerini mobilde içerir',()=>{
 const cards=html.match(/<section id="cardsView"[\s\S]*?<\/section>\s*<section id="statementsView"/)?.[0];
 assert.ok(cards);
 assert.match(cards,/id="statementRowsMobile"/);
 assert.match(cards,/id="paymentRowsMobile"/);
 assert.match(js,/el\('statementRowsMobile'\)\.innerHTML/);
 assert.match(js,/el\('paymentRowsMobile'\)\.innerHTML/);
});
test('Diğer menüsünde yardımcı modüller bulunur',()=>{
 const needed=['accounts','instruments','calendar','notifications','reports','search','security','backups'];
 const screen=html.match(/<section id="otherView"[\s\S]*?<\/section>/)?.[0]||'';
 for(const name of needed)assert.match(screen,new RegExp('data-mobile-tab="'+name+'"'));
});
test('Mobil hızlı kayıt ve mevcut masaüstü menüsü korunur',()=>{
 assert.match(html,/id="quickDialog"/);
 assert.match(html,/data-quick-action="receivable"/);
 assert.match(html,/data-quick-action="payable"/);
 assert.match(html,/id="nav" class="nav"/);
 assert.match(js,/if\(mobile && \(name==='statements'\|\|name==='payments'\)\)name='cards'/);
 assert.match(css,/HesapTakip mobile V4/);
 assert.match(css,/@media\(max-width:620px\)/);
});
test('Tüm HTML id değerleri benzersizdir',()=>{
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'Tekrarlanan HTML id tespit edildi.');
});
