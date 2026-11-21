import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const source=read('brand-v12.js');
function brand(){
 const ctx={window:{}};vm.runInNewContext(source,ctx);return ctx.window.HTBrand;
}
const brands=[
 ['Getir Çarşı','getir.com'],['Getirçarşı','getir.com'],
 ['Uber Eats','ubereats.com'],['Yemeksepeti Mahalle','yemeksepeti.com'],
 ['Edenred','edenred.com.tr'],['MultiNet','multinet.com.tr'],
 ['Pluxee','pluxee.com.tr'],['Setcard','setcard.com.tr'],
 ['Metropolcard','metropolcard.com'],['TokenFlex','tokenflex.com.tr']
];
test('V66 all nine brands have built-in image source regardless of capitalization or aliases',()=>{
 const b=brand();
 for(const [name,domain] of brands)
  assert.equal(b.logoSource(name),b.logoSource(name).startsWith('/brand-icons-v67/')?b.logoSource(name):'INVALID',name);
 assert.equal(b.logoSource('Unknown Corp'),'');
});
test('V66 uploaded logos replace defaults and removing the upload restores defaults',()=>{
 const b=brand(),uploaded='data:image/webp;base64,QUJD';
 for(const [name,domain] of brands){
  assert.equal(b.logoSource(name,uploaded),uploaded,name);
  assert.equal(b.logoSource(name,''),b.logoSource(name).startsWith('/brand-icons-v67/')?b.logoSource(name):'INVALID',name);
  assert.equal(b.logoSource(name,null),b.logoSource(name).startsWith('/brand-icons-v67/')?b.logoSource(name):'INVALID',name);
 }
});
test('V66 logo renderer puts one real image over a non-overlapping initial fallback',()=>{
 const html=read('index.html'),css=read('ui-v8.css'),hub=read('platform-meal-hub-v61.js');
 assert.match(css,/\.v8-account-logo>img\.v8-brand-image\{position:absolute!important/);
 assert.match(css,/box-sizing:border-box/);
 assert.match(hub,/HTBrand\?\.logoSource/);
 assert.match(hub,/v66-brand-image/);
 assert.match(read('platform-meal-hub-v61.css'),/img\.v66-brand-image/);
 assert.match(html,/brand-v12\.js\?v=67/);
 assert.match(html,/ui-v8\.css\?v=66/);
 assert.match(html,/logos-v17\.js\?v=67/);
 assert.match(read('settings-v12.js'),/HTBrand\?\.logoSource/);
 assert.match(read('receivables-v9.js'),/HTBrand\?\.logoSource/);
});
test('V66 platform and unified icons choose uploaded logo without changing any balance',()=>{
 const b=brand(),values={set:2700969,get:9946741};
 const state={firms:[{id:'set',name:'Setcard',category:'receivable',receivable_group:'meal',
  logo_data:'data:image/webp;base64,QUJD'},{id:'get',name:'Getir Çarşı',category:'receivable',
  receivable_group:'platform',logo_data:''}]};
 const nodes=new Map(),get=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});
  return nodes.get(id);
 };
 const context={window:{HTBrand:b,renderCoreMoney(){}},state,el:get,document:{addEventListener(){}},
  esc:x=>String(x),money:n=>'₺'+(n/100).toFixed(2),firmBalance:id=>({remaining:values[id]})};
 vm.runInNewContext(read('platform-meal-hub-v61.js'),context);
 context.window.renderCoreMoney();
 const out=get('v61UnifiedRows').innerHTML;
 assert.match(out,/data:image\/webp;base64,QUJD/);
 assert.match(out,/\/brand-icons-v67\/getir-carsi\.svg/);
 assert.equal(get('v61TotalValue').textContent,'₺126477.10');
 assert.equal(values.set,2700969);
 state.firms[0].logo_data='';
 context.window.HTV61.render();
 assert.match(get('v61UnifiedRows').innerHTML,/\/brand-icons-v67\/setcard\.svg/);
});
test('V66 logo manager only offers removal for uploaded logos; default image is protected',()=>{
 const b=brand(),nodes=new Map(),listeners={};
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:id==='htLogoSearch'?'Setcard':'all',innerHTML:''});
  return nodes.get(id);
 };
 const state={firms:[{id:'f1',name:'Setcard',category:'receivable',receivable_group:'meal',logo_data:''}],
  logoEntries:[],institutions:[],accounts:[],cards:[],directory:{companies:[]}};
 const context={window:{HTBrand:b},state,el:get,esc:x=>String(x),
  document:{addEventListener(name,fn){listeners[name]=fn;}},currentRole:'admin'};
 vm.runInNewContext(read('logos-v17.js'),context);
 context.window.renderUniversalLogos();
 assert.match(get('htUniversalLogoList').innerHTML,/\/brand-icons-v67\/setcard\.svg/);
 assert.doesNotMatch(get('htUniversalLogoList').innerHTML,/data-v17-logo-remove/);
 state.firms[0].logo_data='data:image/webp;base64,QUJD';
 context.window.renderUniversalLogos();
 assert.match(get('htUniversalLogoList').innerHTML,/data-v17-logo-remove/);
 assert.match(get('htUniversalLogoList').innerHTML,/data:image\/webp;base64,QUJD/);
 state.firms[0].logo_data='';context.window.renderUniversalLogos();
 assert.match(get('htUniversalLogoList').innerHTML,/\/brand-icons-v67\/setcard\.svg/);
});
