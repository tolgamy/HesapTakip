import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sample={
 directory:{companies:[{id:'coca-dir',name:'Coca Cola',phone:'+90 555 111 22 33',visit_day:'Çarşamba'}],
  contacts:[{id:'person-a',company_id:'coca-dir',full_name:'Ahmet Test',phone:'+90 555 222 33 44'}],templates:[]},
 firms:[{id:'coca-finance',name:'Coca Cola Gıda',category:'payable'},
  {id:'p-1',name:'Getir',category:'receivable',receivable_group:'platform'},
  {id:'u-1',name:'Mehmet',category:'receivable',receivable_group:'person'}],
 cards:[{id:'card-1',bank:'VakıfBank',nickname:'Şirket kartı'}],
 accounts:[{id:'bank-1',type:'bank',name:'TEB işletme hesabı'}]
};
function home(data=sample,role='admin',permissions=[]){
 const listeners={},calls=[],elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{
   id,value:'',hidden:false,children:[],dataset:{},
   addEventListener(event,fn){listeners[event+'_'+id]=fn;},
   replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},
   focus(){this.focused=true;},
   dispatchEvent(event){calls.push('event:'+id+':'+event.type);}
  });
  return elements.get(id);
 };
 const doc={
  getElementById:element,
  createElement:tag=>({tag,dataset:{},children:[],textContent:'',
    append(...children){this.children.push(...children);}}),
  querySelector:selector=>({
   click(){calls.push('click:'+selector)},
   scrollIntoView(){calls.push('scroll:'+selector)}
  }),
  querySelectorAll:selector=>selector==='[data-firm-view]'?
   [{dataset:{firmView:'coca-finance'},click(){calls.push('firm:coca-finance')}}]:[]
 };
 const window={HTIdentity:{role,permissions},HTDirectory:{
  render(){calls.push('directory-render')},
  renderQuickRepresentatives(){calls.push('representative-render')}
 },HTV18:{openSection:n=>calls.push('section:'+n)},
 tab:n=>calls.push('tab:'+n),scrollTo:()=>calls.push('scroll')};
 vm.runInNewContext(read('public/home-search-v36.js'),{window,document:doc,state:data,
  Event:class{constructor(type){this.type=type;}}});
 const submit=query=>{
  element('v36HomeSearchInput').value=query;
  listeners['submit_v36HomeSearchForm']({preventDefault(){}});
  return element('v36HomeSearchResults').children.filter(x=>x.dataset?.v36ResultIndex!==undefined);
 };
 const click=button=>listeners['click_v36HomeSearchResults']({target:{closest:()=>button}});
 return {window,element,submit,click,calls};
}
test('V37 search matches a saved Coca Cola company, not only headings',()=>{
 const x=home();
 const results=x.window.HTHomeSearch36.find('coca');
 assert.ok(results.some(r=>r.title==='Coca Cola'&&r.kind==='company'));
 assert.ok(results.some(r=>r.title==='Coca Cola Gıda'&&r.kind==='payable'));
 const buttons=x.submit('Coca');
 assert.ok(buttons.some(r=>r.dataset.v36Target==='Coca Cola'));
 assert.match(x.element('v36HomeSearchResults').children[0].textContent,/sonuç/);
 const company=buttons.find(r=>r.dataset.v36Target==='Coca Cola');
 x.element('dirDayFilter').value='Pazartesi';
 x.click(company);
 assert.ok(x.calls.includes('tab:directory'));
 assert.equal(x.element('dirSearch').value,'Coca Cola');
 assert.equal(x.element('dirDayFilter').value,'');
 assert.ok(x.calls.includes('directory-render'));
});
test('V37 financial-only Coca firm opens its real payable ledger',()=>{
 const x=home();
 const f=x.submit('Coca').find(r=>r.dataset.v36Target==='Coca Cola Gıda');
 assert.ok(f);
 x.click(f);
 assert.ok(x.calls.includes('tab:payables'));
 assert.ok(x.calls.includes('firm:coca-finance'));
});
test('V37 representative results navigate to their contact with cleared weekday filter',()=>{
 const x=home();
 const f=x.submit('Ahmet').find(r=>r.dataset.v36Target==='Ahmet Test');
 assert.ok(f);
 x.element('dirQuickDayFilter').value='Perşembe';
 x.click(f);
 assert.ok(x.calls.includes('tab:representatives'));
 assert.equal(x.element('dirQuickSearch').value,'Ahmet Test');
 assert.equal(x.element('dirQuickDayFilter').value,'');
 assert.ok(x.calls.includes('representative-render'));
});
test('V37 user with directory-only permission cannot discover financial records',()=>{
 const x=home(sample,'user',['directory']);
 assert.ok(x.window.HTHomeSearch36.find('coca').some(r=>r.kind==='company'));
 assert.ok(!x.window.HTHomeSearch36.find('coca').some(r=>r.kind==='payable'));
 assert.ok(!x.window.HTHomeSearch36.find('getir').some(r=>r.kind==='platform'));
 assert.ok(!x.window.HTHomeSearch36.find('TEB').some(r=>r.kind==='bank'));
 assert.ok(!x.window.HTHomeSearch36.find('VakıfBank').some(r=>r.kind==='card'));
 const y=home(sample,'user',['payables']);
 assert.ok(y.window.HTHomeSearch36.find('Coca').some(r=>r.kind==='payable'));
 assert.ok(!y.window.HTHomeSearch36.find('Coca').some(r=>r.kind==='company'));
});
test('V37 home search never indexes credential vault or notes',()=>{
 const privateData={...sample,
  vault:[{institution_name:'Secret Finance Site',password:'DoNotIndexMe'}],
  directory:{...sample.directory,companies:[{id:'coca-dir',name:'Coca Cola',note:'super secret notes'}]}};
 const x=home(privateData);
 assert.equal(x.window.HTHomeSearch36.find('DoNotIndexMe').length,0);
 assert.equal(x.window.HTHomeSearch36.find('super secret notes').length,0);
 assert.equal(x.window.HTHomeSearch36.find('Secret Finance Site').length,0);
});
test('V37 quick Representatives UI includes phone/WhatsApp/single gear and search',()=>{
 const els=new Map(),el=id=>{
  if(!els.has(id))els.set(id,{id,value:'',innerHTML:'',insertAdjacentHTML(){}});
  return els.get(id);
 };
 const context={window:{},state:sample,currentRole:'admin',
  esc:x=>String(x??''),el,
  document:{body:{insertAdjacentHTML(){}},addEventListener(){}},
  console};
 vm.runInNewContext(read('public/directory-v17.js'),context);
 context.window.HTDirectory.renderQuickRepresentatives();
 const html=el('dirQuickList').innerHTML;
 assert.match(html,/Ahmet Test/);
 assert.match(html,/WhatsApp \/ Business/);
 assert.match(html,/>Ara<\/a>/);
 assert.match(html,/class="dir-mobile-gear"/);
 assert.match(html,/Firma işlemleri/);
 assert.match(html,/Temsilci işlemleri/);
 assert.equal((html.match(/class="dir-mobile-gear"/g)||[]).length,1);
 const css=read('public/representatives-v37.css');
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto 44px/);
 assert.match(css,/#dirQuickList \.v37-rep-actions>details\.dir-mobile-gear/);
});
test('V37 release includes cache-busted scripts and new representative CSS',()=>{
 const html=read('public/index.html');
 assert.equal(JSON.parse(read('public/version.json')).version,'v56');
 assert.match(html,/name="ht-build" content="v56"/);
 assert.match(html,/home-search-v36\.js\?v=37/);
 assert.match(html,/directory-v17\.js\?v=49/);
 assert.match(html,/representatives-v37\.css\?v=37/);
});
