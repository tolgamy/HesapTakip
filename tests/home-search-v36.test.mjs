import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function setup(identity={role:'admin',permissions:[]}){
 const listeners={};
 class Element {
  constructor(){this.children=[];this.dataset={};this.value='';this.hidden=false;this.textContent='';this.type='';}
  addEventListener(name,handler){listeners[name+'_'+(this.id||'unknown')]=handler;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);}
  replaceChildren(){this.children=[];}
  focus(){this.focused=true;}
 }
 const ids=new Map();
 for(const id of ['v36HomeSearchForm','v36HomeSearchInput','v36HomeSearchResults']){
  const element=new Element();element.id=id;ids.set(id,element);
 }
 const calls=[],doc={
  getElementById:id=>ids.get(id)||null,
  createElement:tag=>{const e=new Element();e.tagName=tag;return e;},
  querySelector:selector=>selector==='[data-v8-accounts="vault"]'?{click(){calls.push('vault-tab')}}:
    selector==='[data-v8-accounts="people"]'?{click(){calls.push('people-tab')}}:
    selector==='[data-v8-accounts="platforms"]'?{click(){calls.push('platforms-tab')}}:null
 };
 const window={
  HTIdentity:identity,
  tab:name=>calls.push('tab:'+name),
  HTV18:{openSection:name=>calls.push('section:'+name)},
  scrollTo:()=>calls.push('scroll')
 };
 vm.runInNewContext(read('public/home-search-v36.js'),{window,document:doc});
 return {window,ids,calls,listeners};
}

test('V36 homepage search finds page headings, Turkish accents and synonyms',()=>{
 const {window}=setup();
 const search=window.HTHomeSearch36;
 assert.ok(search.find('banka').some(e=>e.title==='Bankalarım'));
 assert.ok(search.find('kredi kartı').some(e=>e.title==='Kredi Kartlarım'));
 assert.ok(search.find('temsilci').some(e=>e.title==='Firma Temsilcileri'));
 assert.ok(search.find('POS').some(e=>e.title==='POS ve Ödeme Kuruluşları'));
 assert.ok(search.find('sahis').some(e=>e.title==='Şahıs Alacaklarım'));
 assert.ok(search.find('kullanıcı işlemleri').some(e=>e.title==='Kullanıcı İşlemleri'));
 assert.deepEqual([...search.find('')],[]);
});
test('V36 user search never reveals headings the admin has not granted',()=>{
 const {window}=setup({role:'user',permissions:['cards','directory']});
 assert.ok(window.HTHomeSearch36.find('kart').some(e=>e.title==='Kredi Kartlarım'));
 assert.ok(window.HTHomeSearch36.find('temsilci').some(e=>e.title==='Firma Temsilcileri'));
 assert.ok(!window.HTHomeSearch36.find('şifre').some(e=>e.title==='Kullanıcı İşlemleri'));
 assert.ok(!window.HTHomeSearch36.find('banka').some(e=>e.title==='Bankalarım'));
 assert.ok(!window.HTHomeSearch36.find('ayar').some(e=>e.title==='Ayarlar'));
});
test('V36 tapping a search result opens its page and account subtab',()=>{
 const ctx=setup(),form=ctx.ids.get('v36HomeSearchForm');
 const input=ctx.ids.get('v36HomeSearchInput'),list=ctx.ids.get('v36HomeSearchResults');
 input.value='parola';
 ctx.listeners['submit_v36HomeSearchForm']({preventDefault(){}});
 assert.equal(list.hidden,false);
 const result=list.children.find(node=>node.dataset?.v36Target==='Kullanıcı İşlemleri');
 assert.ok(result,'Search button for vault section must be present');
 ctx.listeners['click_v36HomeSearchResults']({target:{closest:()=>result}});
 assert.ok(ctx.calls.includes('section:accounts'));
 assert.ok(ctx.calls.includes('vault-tab'));
 assert.equal(list.hidden,true);
 input.value='firma';
 ctx.listeners['submit_v36HomeSearchForm']({preventDefault(){}});
 const firms=list.children.find(node=>node.dataset?.v36Target==='Firma Borçlarım');
 assert.ok(firms);
 ctx.listeners['click_v36HomeSearchResults']({target:{closest:()=>firms}});
 assert.ok(ctx.calls.includes('tab:payables'));
});
test('V36 search avoids oversized Ara text on small phone screens',()=>{
 const html=read('public/index.html'),css=read('public/home-search-v36.css');
 assert.match(html,/id="v36HomeSearchForm"/);
 assert.match(html,/id="v36HomeSearchInput"/);
 assert.match(html,/id="v36HomeSearchResults"/);
 assert.match(html,/home-search-v36\.js\?v=37/);
 assert.match(html,/home-search-v36\.css\?v=36/);
 assert.match(css,/#v36HomeSearchInput\{[^}]*font-size:16px!important/);
 assert.match(css,/\.v36-home-search-controls \.btn\{font-size:15px!important/);
 assert.match(css,/@media\(max-width:620px\)/);
});
test('V36 Safari gets one company gear beside WhatsApp/Call and fresh assets',()=>{
 const html=read('public/index.html'),css=read('public/mobile-v36.css'),directory=read('public/directory-v17.js');
 assert.match(html,/directory-v17\.js\?v=37/);
 assert.match(html,/mobile-v35\.css\?v=36/);
 assert.match(html,/mobile-v36\.css\?v=36/);
 assert.match(css,/\(hover:none\) and \(pointer:coarse\) and \(max-width:760px\)/);
 assert.match(css,/#directoryList \.dir-desktop-tools\{display:none!important/);
 assert.match(css,/#directoryList details\.dir-mobile-gear\{display:block!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto 44px/);
 assert.match(css,/#directoryList \.dir-card\.dir-gear-open\{position:relative;z-index:40\}/);
 assert.match(directory,/document\.addEventListener\('toggle'/);
 assert.match(directory,/card\.classList\.toggle\('dir-gear-open',menu\.open\)/);
 assert.doesNotMatch(directory,/mobileGear\(companyOptions\(c\),'Firma işlemleri/);
});
test('V36 release number agrees with visible app build',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v40');
 assert.match(read('public/index.html'),/name="ht-build" content="v40"/);
});
