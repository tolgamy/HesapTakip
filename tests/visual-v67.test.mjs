import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const read=x=>readFileSync(new URL('../public/'+x,import.meta.url),'utf8');
const html=read('index.html'),css=read('visual-v67.css'),users=read('users-v26.js'),
 nav=read('navigation-v18.js'),ui=read('ui-v8.js'),brand=read('brand-v12.js');
const ctx={window:{}};vm.runInNewContext(brand,ctx);
const B=ctx.window.HTBrand;
test('Ten real local brand assets are reachable and rendered in two columns, without a new financial record',()=>{
 assert.deepEqual(Array.from(B.presets),[
 'Getir Çarşı','Uber Eats','Yemeksepeti Mahalle','Edenred','Multinet',
 'Pluxee','Setcard','Metropolcard','Tokenflex','USMAR.com'
 ]);
 for(const name of B.presets){
  const src=B.logoSource(name);
  assert.match(src,/^(?:\/brand-icons-v67\/[a-z0-9-]+\.svg|https:\/\/www\.google\.com\/s2\/favicons\?domain=[^&]+&sz=128)$/);
  if(src.startsWith('/'))assert.ok(existsSync(new URL('../public'+src,import.meta.url)),name);
 }
 assert.equal(B.logoSource('Getir'),B.logoSource('Getir Çarşı'));
 assert.equal(B.logoSource('USMAR.com.tr'),B.logoSource('USMAR.com'));
 assert.match(css,/\.v67-brand-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/id="v67BrandGrid"/);
 assert.match(read('logos-v17.js'),/v67BrandGrid/);
 assert.doesNotMatch(read('logos-v17.js'),/INSERT INTO|UPDATE firms SET/);
});
test('Business-first order then meal cards, input data not mutated',()=>{
 const names=['Tokenflex','Getir','Metropolcard','USMAR.com','Pluxee',
  'Edenred','Setcard','Uber Eats','Multinet','Yemeksepeti Mahalle','Başka Firma'];
 const rows=names.map((name,i)=>({id:i,name}));
 assert.deepEqual(Array.from(B.sortPlatformFirms(rows).map(x=>x.name)),[
  'Getir','Uber Eats','Yemeksepeti Mahalle','Edenred','Multinet',
  'Pluxee','Setcard','Metropolcard','Tokenflex','USMAR.com','Başka Firma']);
 assert.deepEqual(rows.map(x=>x.name),names);
 assert.match(ui,/HTBrand\?\.sortPlatformFirms/);
 assert.match(read('platform-meal-hub-v61.js'),/HTBrand\?\.sortPlatformFirms/);
});
test('Two Account buttons only; encrypted vault relocated beside Update under Settings',()=>{
 assert.deepEqual(Array.from(html.matchAll(/data-v8-accounts="([^"]+)"/g),x=>x[1]),['platforms','people']);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 for(const id of ['vaultView','v26VaultPanel','v26VaultNew','v43VaultImport','v67UpdateTile',
 'v68UserAccountsTile','htCheckUpdates','htApplyUpdate','htLogoPanel','htUniversalLogoList'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(nav,/data-v67-vault-open/);
 assert.match(nav,/data-v67-settings-back/);
 assert.match(users,/if\(s==='settings'\)return !isUser\(\)\|\|can\('vault'\)\|\|can\('payables'\)/);
 assert.match(users,/if\(!child.classList.contains\('v67-settings-shortcuts'\)\)child.hidden=true/);
 assert.match(users,/vault:'vault'/);
 assert.match(users,/can,preferredAccountTab/);
 assert.match(read('app.js'),/vault:\['Kullanıcı Hesapları'/);
 assert.match(html,/<meta name="ht-build" content="v92">/);
});
test('Custom logo overrides bundled source and delete only removes custom layer',()=>{
 for(const name of B.presets){
  const defaultSrc=B.logoSource(name);
  assert.equal(B.logoSource(name,'data:image/webp;base64,QUJD'),'data:image/webp;base64,QUJD');
  assert.equal(B.logoSource(name,''),defaultSrc);
 }
 const source=read('logos-v17.js');
 assert.match(source,/data-v17-logo-pick="firm"/);
 assert.match(source,/data-v17-logo-remove="firm"/);
 assert.match(source,/Özel logoyu sil/);
 assert.doesNotMatch(source,/UPDATE cash_entries|UPDATE payments|DELETE FROM/);
});
test('Unified mobile iconography, Apple typography and amount formatting intact',()=>{
 assert.match(css,/-apple-system,BlinkMacSystemFont/);
 assert.match(css,/\.v8-account-amount,\.v61-amount\{font-weight:790;font-variant-numeric:tabular-nums/);
 assert.equal((html.match(/class="v67-nav-icon"/g)||[]).length,10);
 assert.equal((html.match(/class="v67-tab-icon"/g)||[]).length,2);
 assert.match(css,/min-height:105px/);
 assert.match(css,/\.v67-vault-back\{min-height:44px/);
});
