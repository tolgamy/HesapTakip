import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/color-icons-draft.css');
const brand=read('public/brand-v12.js');

test('Draft adds colorful icons after v78 styles, without changing released build',()=>{
 assert.match(html,/color-icons-draft\.css\?v=draft-1/);
 assert.ok(html.indexOf('color-icons-draft.css')>html.indexOf('photo-sections-v78.css'));
 assert.match(html,/brand-v12\.js\?v=logo-draft/);
 assert.match(html,/name="ht-build" content="v79"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v79');
 for(const nav of ['overview','cardbank','accounts','firms','settings']){
  assert.ok(css.includes('data-v18-section="'+nav+'"'),nav);
  assert.match(html,new RegExp('data-v18-section="'+nav+'"'));
 }
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/:focus-visible/);
});

test('Use authentic vectors or official-domain favicons, not invented initial-mark SVGs',()=>{
 const ctx={window:{}};
 vm.runInNewContext(brand,ctx);
 const b=ctx.window.HTBrand;
 for(const [name,domain] of [
  ['Getir Çarşı','getir.com'],['Yemeksepeti Mahalle','yemeksepeti.com'],
  ['Multinet','multinet.com.tr'],['Setcard','setcard.com.tr'],
  ['Metropolcard','metropolcard.com'],['Tokenflex','tokenflex.com.tr'],
  ['USMAR.com','usmarmarket.com']
 ]){
  assert.equal(b.logoSource(name),'https://www.google.com/s2/favicons?domain='+domain+'&sz=128',name);
 }
 for(const [name,file] of [
  ['Uber Eats','uber-eats'],['Edenred','edenred'],['Pluxee','pluxee']
 ])assert.equal(b.logoSource(name),'/brand-icons-v67/'+file+'.svg');
 assert.equal(b.logoSource('Unverified New Brand'),'');
});

test('User provided images override all defaults and finance actions remain intact',()=>{
 const ctx={window:{}};vm.runInNewContext(brand,ctx);
 assert.equal(ctx.window.HTBrand.logoSource('Setcard','data:image/webp;base64,QUJD'),'data:image/webp;base64,QUJD');
 assert.equal(ctx.window.HTBrand.logoSource('Pluxee','data:image/webp;base64,QUJD'),'data:image/webp;base64,QUJD');
 assert.match(read('public/navigation-v18.js'),/const primary=\{overview:'overview',cardbank:'cards',accounts:'collections',firms:'payables',settings:'settings'\}/);
 assert.match(read('src/index.js'),/if \(path === '\/api\/payments' && method === 'POST'\)/);
 assert.match(html,/data-ht-pin-lock/);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
});

test('Source and privacy requirements are documented',()=>{
 const doc=read('docs/COLOR_LOGOS_DRAFT.md');
 assert.match(doc,/Gizlilik/);
 assert.match(doc,/Google favicon/);
 assert.match(doc,/Multinet/);
 const server=read('src/index.js');
 const csp=server.match(/'Content-Security-Policy':\s*"([^"]+)"/)?.[1]||'';
 assert.match(csp,/img-src[^;]*https:\/\/www\.google\.com/);
 assert.doesNotMatch(csp,/script-src[^;]*www\.google\.com/);
});
