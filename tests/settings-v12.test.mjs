import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const app=read('public/app.js');
const icons=read('public/brand-v12.js');
const code=read('public/settings-v12.js');
const css=read('public/settings-v12.css');
const meal=read('public/receivables-v9.js');
const card=read('public/cards-pro.js');
function contextFor(){
 const els=new Map(),handlers={},calls=[];
 const el=id=>{
  if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',
   form:{elements:{}},querySelector(){return null;}});
  return els.get(id);
 };
 const context={
  window:{openInstitutionManager(opts){calls.push(['institution',opts]);},
   openFirmForm(...args){calls.push(['firm',...args]);},
   openProCardForm(){calls.push(['card']);},
   openSuiteForm(...args){calls.push(['suite',...args]);}},
  document:{addEventListener(type,cb){handlers[type]=cb;}},
  el,esc:s=>String(s??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x])),
  money:n=>String(Number(n)/100),firmBalance(){return {remaining:0};},
  currentRole:'admin',state:{firms:[],institutions:[]},
  tab(x){calls.push(['tab',x]);},notice(x){calls.push(['notice',x]);}
 };
 vm.runInNewContext(icons,context);
 vm.runInNewContext(code,context);
 return {context,els,el,calls,handlers};
}
const clicked=(handlers,dataAttr,name)=>handlers.click({
 target:{closest(selector){
  if(selector.includes('['+dataAttr+']'))
   return {dataset:{[name.split(':')[0]]:name.split(':')[1]}};
  return null;
 }}
});
test('PC sidebar, iPhone and bottom navigation show Settings',()=>{
 assert.match(html,/data-v18-section="settings"/);
 assert.match(html,/id="settingsView"/);
 assert.match(html,/data-mobile-tab="settings"/);
 assert.match(html,/settings-v12\.js/);
 assert.match(html,/settings-v12\.css/);
 const bottom=html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((bottom.match(/class="mobile-bottom-item/g)||[]).length,5);
 assert.match(bottom,/data-v18-section="settings"/);
 assert.match(app,/settings:\['Ayarlar'/);
 assert.match(app,/window\.renderSettings\(\)/);
});
test('Settings destination prompt appears only after entering a name and never auto-saves',()=>{
 const {context,el,handlers,calls}=contextFor();
 context.window.renderSettings();
 assert.equal(el('htSettingsDestination').hidden,true);
 el('htSettingsName').value='Ahmet Firması';
 handlers.input({target:{id:'htSettingsName'}});
 assert.equal(el('htSettingsDestination').hidden,false);
 assert.match(el('htSettingsCategories').innerHTML,/Banka/);
 assert.match(el('htSettingsCategories').innerHTML,/Kredi kartı/);
 assert.match(el('htSettingsCategories').innerHTML,/Yemek kartı/);
 assert.match(el('htSettingsCategories').innerHTML,/Platform alacağı/);
 assert.match(el('htSettingsCategories').innerHTML,/Firmaya borç/);
 assert.equal(calls.length,0);
});
test('Name/category decision routes to the correct existing account form without generating fake balances',()=>{
 const {context,el,calls,handlers}=contextFor();
 context.window.renderSettings();
 el('htSettingsName').value='Ahmet Firması';
 handlers.input({target:{id:'htSettingsName'}});
 function choose(which){
  handlers.click({target:{closest(sel){
   if(sel==='[data-ht-settings-choose]')return {dataset:{htSettingsChoose:which}};
   return null;
  }}});
  handlers.click({target:{closest(sel){return sel==='#htSettingsContinue'?{}:null;}}});
 }
 choose('payable');
 assert.deepEqual(Array.from(calls[0]),['tab','payables']);
 assert.deepEqual(Array.from(calls[1]),['firm','new','payable','general','Ahmet Firması']);
 calls.length=0;
 choose('meal');
 assert.deepEqual(Array.from(calls[0]),['tab','meal']);
 assert.deepEqual(Array.from(calls[1]),['firm','new','receivable','meal','Ahmet Firması']);
 calls.length=0;
 choose('platform');
 assert.deepEqual(Array.from(calls[0]),['tab','platforms']);
 assert.deepEqual(Array.from(calls[1]),['firm','new','receivable','platform','Ahmet Firması']);
 calls.length=0;
 choose('bank');
 assert.equal(calls[0][0],'institution');
 assert.equal(calls[0][1].type,'bank');
 assert.equal(calls[0][1].name,'Ahmet Firması');
});
test('All six meal titles are first-letter uppercase, while historic all-caps labels map correctly',()=>{
 const {context}=contextFor();
 const old=['SETCARD','MultiNet Up','Edenred / Ticket Restaurant','MetropolCard','TokenFlex','Pluxee'];
 const expect=['Setcard','Multinet','Edenred','Metropolcard','Tokenflex','Pluxee'];
 assert.deepEqual(Array.from(old.map(x=>context.window.HTBrand.label(x))),expect);
 assert.deepEqual(Array.from(context.window.HTSettingsMealBrands.map(x=>x[0])),expect);
 const group=meal.slice(meal.indexOf('meal:['),meal.indexOf('platform:['));
 for(const name of expect)assert.ok(group.includes("'"+name+"'"),name);
 assert.match(meal,/HTBrand\?\.key\(f\.name\)/);
});
test('Logos: known domains and user uploads are preferred, original distinctive marks are the fallback',()=>{
 const {context}=contextFor();
 assert.match(icons,/ht-original-mark/);
 assert.match(icons,/ht-tone-/);
 assert.match(css,/\.ht-original-mark/);
 assert.match(code,/https:\/\/www\.google\.com\/s2\/favicons/);
 assert.match(code,/custom\|\|/);
 assert.match(card,/institutionIcon\(/);
 assert.match(card,/logo_data/);
 assert.match(meal,/logoImage\(record\?\.logo_data/);
 const mark=context.window.HTBrand.mark('Setcard');
 assert.match(mark,/ht-tone-/);
 assert.match(mark,/SC/);
 assert.doesNotMatch(mark,/<script|<img/i);
});
test('Existing logo managers, bank names and financial amounts remain managed through protected forms',()=>{
 assert.match(code,/window\.openInstitutionManager\(\{type:'bank',name\}\)/);
 assert.match(code,/window\.openFirmForm\('new','receivable','meal',name\)/);
 assert.match(code,/window\.openFirmForm\('edit',edit\.dataset\.htSettingsEdit\)/);
 assert.match(card,/window\.openInstitutionManager=openInstitutionManager/);
 assert.match(html,/htSettingsRegistered/);
 assert.doesNotMatch(html,/id="htSettingsMealLogos"/);
 assert.match(html,/id="htSettingsRegistered"/);
});
