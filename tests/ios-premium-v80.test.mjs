import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/ios-premium-v80.css');
const version=JSON.parse(read('public/version.json'));

test('v80 is a CSS-only iOS screen refresh layered after v79',()=>{
 assert.equal(version.version,'v96');
 assert.match(html,/name="ht-build" content="v96"/);
 assert.match(html,/href="\/ios-premium-v80\.css\?v=80"/);
 assert.ok(html.indexOf('ios-premium-v80.css')>html.indexOf('premium-five-v79.css'));
 for(const name of ['overview','cardbank','accounts','firms','settings']){
  assert.match(css,new RegExp('data-v18-section="'+name+'"|#'+
   ({overview:'overviewView',cardbank:'cardsView',accounts:'collectionsView',firms:'payablesView',settings:'settingsView'}[name])+'\\b'));
 }
});

test('exactly five real mobile buttons are kept; no duplicate/fake navigation',()=>{
 const nav=html.match(/<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 const sections=[...nav.matchAll(/data-v18-section="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(sections,['overview','cardbank','accounts','firms','settings']);
 assert.equal((nav.match(/<button\b/g)||[]).length,5);
 assert.match(css,/mobile-bottom-item\.active/);
 assert.match(read('public/navigation-v18.js'),/const primary=\{overview:'overview',cardbank:'cards',accounts:'collections',firms:'payables',settings:'settings'\}/);
});

test('live financial, platform, firm and settings outputs retain their IDs and handlers',()=>{
 for(const id of ['v8NetValue','v8NetDescription','v8TotalReceivable','v8TotalDebt','v8RecentTransactions',
   'v8MonthlyChart','cardList','htCardToday28','htCardDue41','coreBankList','v8AccountSearch',
   'v8AccountsList','v8AccountsCount','v72PayablesLeader','payablesStats','payablesRows',
   'v67BrandGrid','v60Center','htLogoPanel','v68UserAccountsTile','v68BillsTile']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(css,/#overviewView/);
 assert.match(css,/#cardsView/);
 assert.match(css,/#bankingView/);
 assert.match(css,/#collectionsView/);
 assert.match(css,/#platformsView/);
 assert.match(css,/#peopleView/);
 assert.match(css,/#payablesView/);
 assert.match(css,/#directoryView/);
 assert.match(css,/#settingsView/);
 assert.match(html,/data-v68-open-users/);
 assert.match(html,/data-v68-open-bills/);
 assert.match(html,/data-ht-pin-lock/);
});

test('no dummy balances, document deletion or storage mutation in v80 overlay',()=>{
 assert.doesNotMatch(css,/₺\s*\d/);
 assert.doesNotMatch(css,/\b(?:DROP|DELETE|TRUNCATE)\s+(?:TABLE|FROM)\b/i);
 assert.doesNotMatch(css,/\b(?:localStorage|indexedDB|fetch|XMLHttpRequest|addEventListener)\s*\(/);
 assert.doesNotMatch(css,/https?:\/\/(?:images\.)?unsplash\.com/);
 assert.doesNotMatch(css,/@import/);
 assert.match(read('wrangler.jsonc'),/"d1_databases"/);
 assert.match(read('public/update-v17.js'),/\/version\.json\?check=/);
 assert.match(read('public/logos-v17.js'),/logo_data/);
 assert.match(read('public/brand-v12.js'),/if\(typeof uploaded==='string'&&uploaded.trim\(\)\)return uploaded;/);
});

test('iPhone safe area, narrow screens, focus and print retained',()=>{
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css, /focus-visible/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /@media print/);
 assert.match(read('docs/IOS_PREMIUM_V80_DATA_SAFETY.md'),/4d9cbd7b60e02e0b9be51f8fb3fe20eb9e5c72ab/);
});
