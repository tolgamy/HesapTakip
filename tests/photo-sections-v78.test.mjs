import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/photo-sections-v78.css');
const version=JSON.parse(read('public/version.json'));

test('v78 wires the four primary sections without altering the navigation contract',()=>{
 assert.match(html,/photo-settings-v77\.css\?v=77/);
 assert.match(html,/photo-sections-v78\.css\?v=78/);
 assert.ok(html.indexOf('photo-sections-v78.css')>html.indexOf('photo-settings-v77.css'));
 for(const name of ['overview','cardbank','accounts','firms']){
  assert.match(html,new RegExp('data-v18-section="'+name+'"'));
 }
 for(const id of ['overviewView','cardsView','bankingView','collectionsView','payablesView']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.equal(version.version,'v96');
 assert.match(html,/name="ht-build" content="v96"/);
});

test('Photographic sections use scoped backgrounds and meaningful fallback',()=>{
 for(const selector of [
  '#overviewView .v36-home-search',
  '#overviewView .v8-net-hero',
  '#cardsView .ht-card-today-title',
  '#bankingView>.section-head',
  '#collectionsView>.section-head',
  '#payablesView>.section-head',
  '#directoryView>.section-head'
 ]) assert.ok(css.includes(selector),selector);
 const photos=css.match(/https:\/\/images\.unsplash\.com\/photo-[^")\s]*/g)||[];
 assert.ok(photos.length>=7);
 assert.ok(photos.every(url=>/\bw=\d+/.test(url)&&/\bq=\d+/.test(url)));
 assert.match(css,/background-color:#f5faf7/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(prefers-reduced-data:reduce\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
});

test('Account tabs, inputs, payment and security actions remain present',()=>{
 assert.deepEqual([...html.matchAll(/data-v8-accounts="([^"]+)"/g)].map(match=>match[1]),['platforms','people']);
 for(const id of ['v36HomeSearchInput','v8NetValue','cardSearch','cardList','v8AccountSearch',
  'v8AccountsList','v72PayablesSearch','payablesRows','v26VaultPanel']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(read('public/navigation-v18.js'),/data-v18-sub/);
 assert.match(read('public/navigation-v18.js'),/const primary=\{overview:'overview',cardbank:'cards',accounts:'collections',firms:'payables',settings:'settings'\}/);
 assert.match(read('src/index.js'),/if \(path === '\/api\/payments' && method === 'POST'\)/);
 assert.match(read('public/index.html'),/data-ht-pin-lock/);
});

test('New photography is documented and CSP does not expand script or API permissions',()=>{
 const doc=read('docs/PHOTO_SECTIONS_V78.md');
 assert.match(doc,/https:\/\/unsplash\.com\/license/);
 assert.match(doc,/Gizlilik/);
 const server=read('src/index.js');
 const csp=server.match(/'Content-Security-Policy':\s*"([^"]+)"/)?.[1]||'';
 assert.match(csp,/img-src[^;]*https:\/\/images\.unsplash\.com/);
 assert.doesNotMatch(csp,/script-src[^;]*images\.unsplash\.com/);
 assert.doesNotMatch(csp,/connect-src[^;]*images\.unsplash\.com/);
});
