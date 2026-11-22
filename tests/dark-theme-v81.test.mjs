import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/theme-v81.css');
const source=read('public/theme-v81.js');

function createTheme({stored=null,systemDark=false,blocked=false}={}){
 const attrs={}; const handlers={}; let domReady=null; let systemChange=null; let currentStorage=stored;let writes=[];
 const button={
  setAttribute(key,val){attrs[key]=String(val)},
  addEventListener(name,fn){handlers[name]=fn},
  title:''
 };
 const root={dataset:{}};
 const media={matches:systemDark,addEventListener(name,fn){if(name==='change')systemChange=fn;}};
 const context={document:{
   documentElement:root,readyState:'loading',
   getElementById(id){return id==='htThemeToggle'?button:null},
   addEventListener(name,fn){if(name==='DOMContentLoaded')domReady=fn;}
  },window:{
   localStorage:{
    getItem(key){if(blocked)throw Error('blocked');assert.equal(key,'ht-ui-theme-v81');return currentStorage;},
    setItem(key,value){if(blocked)throw Error('blocked');assert.equal(key,'ht-ui-theme-v81');writes.push(value);currentStorage=value;}
   },
   matchMedia(query){assert.equal(query,'(prefers-color-scheme: dark)');return media;}
  }};
 vm.runInNewContext(source,context);
 assert.equal(typeof domReady,'function');
 domReady();
 return {root,button,attrs,handlers,writes,storage:()=>currentStorage,systemChange};
}

test('v81 creates a single functional mode switch at the red marked spot, before more menu',()=>{
 assert.match(html,/name="ht-build" content="v92"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v92');
 assert.equal((html.match(/id="htThemeToggle"/g)||[]).length,1);
 const begin=html.indexOf('id="htThemeToggle"');
 const more=html.indexOf('id="v8MoreButton"');
 const actions=html.indexOf('<div class="actions">');
 assert.ok(actions>=0&&begin>actions&&begin<more,'switch precedes ellipsis menu in the topbar');
 assert.match(html,/id="htThemeToggle"[^>]*aria-label="Koyu moda geç"[^>]*aria-pressed="false"/);
 assert.match(html,/class="ht-theme-moon"/);
 assert.match(html,/class="ht-theme-sun"/);
 assert.ok(html.indexOf('theme-v81.js?v=81')<html.indexOf('ios-premium-v80.css?v=80'),'theme loads before first paint');
 assert.ok(html.indexOf('theme-v81.css?v=81')>html.indexOf('ios-premium-v80.css?v=80'),'night overlay loads last');
});

test('click toggles dark/light and remembers only UI preference, no financial state',()=>{
 const o=createTheme();
 assert.equal(o.root.dataset.htTheme,'light');
 assert.equal(o.attrs['aria-pressed'],'false');
 assert.equal(o.attrs['aria-label'],'Koyu moda geç');
 o.handlers.click();
 assert.equal(o.root.dataset.htTheme,'dark');
 assert.equal(o.attrs['aria-pressed'],'true');
 assert.equal(o.attrs['aria-label'],'Açık moda geç');
 assert.equal(o.button.title,'Açık modu aç');
 o.handlers.click();
 assert.equal(o.root.dataset.htTheme,'light');
 assert.equal(o.attrs['aria-pressed'],'false');
 assert.deepEqual(o.writes,['dark','light']);
 assert.equal(o.storage(),'light');
 assert.doesNotMatch(source,/\/api\/|fetch\(|DROP TABLE|DELETE FROM|htPin|password/i);
});

test('stored preference wins; system changes apply until user explicitly selects a theme',()=>{
 const saved=createTheme({stored:'dark',systemDark:false});
 assert.equal(saved.root.dataset.htTheme,'dark');
 saved.systemChange({matches:false});
 assert.equal(saved.root.dataset.htTheme,'dark');
 const system=createTheme({systemDark:true});
 assert.equal(system.root.dataset.htTheme,'dark');
 system.systemChange({matches:false});
 assert.equal(system.root.dataset.htTheme,'light');
 system.handlers.click();
 system.systemChange({matches:false});
 assert.equal(system.root.dataset.htTheme,'dark','manual selection persists over OS changes');
});

test('private mode does not crash if localStorage access is denied',()=>{
 const blocked=createTheme({blocked:true,systemDark:true});
 assert.equal(blocked.root.dataset.htTheme,'dark');
 blocked.handlers.click();
 assert.equal(blocked.root.dataset.htTheme,'light');
 assert.equal(blocked.attrs['aria-pressed'],'false');
});

test('all five screens and dialogs receive dark styling without altering any real data nodes',()=>{
 for(const id of ['overviewView','cardsView','bankingView','collectionsView',
   'platformsView','peopleView','payablesView','directoryView','settingsView']){
  assert.ok(css.includes('#'+id),id);
 }
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 assert.match(css,/#appPage \.topbar \.actions #htThemeToggle/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/focus-visible/);
 assert.match(css, /env\(safe-area-inset-bottom\)|mobile-bottom-nav/);
 assert.match(css, /v67-brand-emblem[\s\S]*background:#fff!important/);
 const nav=html.match(/<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
 assert.deepEqual([...nav.matchAll(/data-v18-section="([^"]+)"/g)].map(x=>x[1]),
 ['overview','cardbank','accounts','firms','settings']);
 for(const id of ['v8NetValue','v8TotalReceivable','v8TotalDebt','v8RecentTransactions',
  'v8AccountsList','v67BrandGrid','htLogoPanel','htPinChangeDialog']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.doesNotMatch(source,/\b(?:state|firmBalance|settlements|payment|fetch|indexedDB)\s*\(/);
});

test('deployment rollback and no schema change are documented',()=>{
 const doc=read('docs/DARK_THEME_V81.md');
 assert.match(doc,/4d9cbd7b60e02e0b9be51f8fb3fe20eb9e5c72ab/);
 assert.match(doc,/1b1df69bce713566bdb42f640582e099217a6d2e/);
 assert.match(doc,/D1/);
 assert.match(doc,/yerel/);
});
