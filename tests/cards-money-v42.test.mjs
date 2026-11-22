import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function cards(c=[],statements=[],payments=[],today='2026-11-18'){
 const root={innerHTML:''},due={innerHTML:''};
 const ctx={window:{},state:{statements,payments},document:{
  getElementById:id=>id==='htCardToday28'?root:id==='htCardDue41'?due:null
 },trDate:()=>today,esc:s=>String(s),showDate:s=>s,
 cardMoney:n=>n==null?'—':'₺'+(n/100).toFixed(2)};
 vm.runInNewContext(read('public/cards-today-v28.js'),ctx);
 return {api:ctx.window.HTCardToday28,root,due,render:()=>ctx.window.HTCardToday28.render(c)};
}
function card(id,day,available=null,other={}){
 return {id,bank:'Banka '+id,nickname:'Kart '+id,card_type:'credit',
  statement_day:day,status:'active',available_limit_kurus:available,...other};
}
test('V42 cutoff-based recommendation ignores both missing and zero available limit',()=>{
 const x=cards(),c=[card('old',6,99999999),card('fresh',17,null),card('cut',18,90000000)];
 assert.equal(x.api.recommend(c,'2026-11-18').id,'fresh');
 assert.equal(x.api.recommend(c,'2026-11-19').id,'cut');
 assert.equal(x.api.recommend(c.map(o=>({...o,available_limit_kurus:0})),'2026-11-18').id,'fresh');
 assert.equal(x.api.recommend([card('only',18,null)],'2026-11-18'),null);
 assert.equal(x.api.recommend([card('only',18,null)],'2026-11-19').id,'only');
});
test('V42 available limit is displayed only as information, not a selection criterion',()=>{
 const x=cards([card('old',6,999999),card('fresh',17,null)]);
 x.render();
 assert.match(x.root.innerHTML,/Kart fresh/);
 assert.doesNotMatch(x.root.innerHTML,/Bilgi girilmemiş/);
 assert.match(x.root.innerHTML,/Limiti kontrol et/);
 const y=cards([card('fresh',17,0)]);
 y.render();
 assert.match(y.root.innerHTML,/Kart fresh/);
 assert.doesNotMatch(y.root.innerHTML,/₺0.00/);
});
test('V42 saved current or next card due date appears even without an entered statement',()=>{
 const a=card('one',3,null,{current_due_date:'2026-11-18'});
 const b=card('two',3,123,{next_due_date:'2026-11-18'});
 const x=cards([a,b]);x.render();
 assert.match(x.due.innerHTML,/Kart one/);
 assert.doesNotMatch(x.due.innerHTML,/Kart two/); // This panel shows only the first due card.
 assert.match(x.due.innerHTML,/Bugün son ödeme günü/);
 assert.match(x.due.innerHTML,/Borç tutarı kayıtlı değil/);
 assert.doesNotMatch(x.due.innerHTML,/₺123/);
 assert.equal(x.api.paymentDateReminders([a,b],[],'2026-11-18').length,2);
});
test('V42 paid statement on a recorded due date is not duplicated as an unpaid debt',()=>{
 const c=card('paid',2,0,{current_due_date:'2026-11-18'});
 const statement={id:'s1',card_id:'paid',amount_kurus:15000,due_date:'2026-11-18'};
 const p={statement_id:'s1',amount_kurus:15000};
 const x=cards([c],[statement],[p]);x.render();
 assert.match(x.due.innerHTML,/Kayıtlı ödeme tarihi yok/);
 assert.doesNotMatch(x.due.innerHTML,/Borç tutarı kayıtlı değil/);
});
test('V42 scheduled date and monthly day are reminders, not fabricated monetary debts',()=>{
 const a=card('scheduled',3,null,{display_next_due_date:'2026-11-18'});
 const b=card('monthly',2,null,{due_day:18});
 const x=cards([a,b]);x.render();
 assert.match(x.due.innerHTML,/Tahmini ödeme günü/);
 assert.match(x.due.innerHTML,/Borç tutarı kayıtlı değil/);
 assert.doesNotMatch(x.due.innerHTML,/₺0.00/);
});
function setupCurrency(initial='1050.00'){
 const handlers={};
 class FakeInput{
  constructor(value=initial){this.name='amount';this.type='number';this.value=value;
   this.disabled=false;this.readOnly=false;this.dataset={};this.classList={add(){}};
   this.parentElement=null;this.selectionStart=null;this.selectionEnd=null;this.cursorCalls=[];}
  setAttribute(k,v){this[k]=v;}
  select(){this.selected=true;}
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;this.cursorCalls.push([a,b]);}
 }
 const ctx={window:{},HTMLInputElement:FakeInput,document:{
  addEventListener(name,callback){handlers[name]=callback;}}};
 vm.runInNewContext(read('public/currency-v20.js'),ctx);
 const input=new FakeInput();
 handlers.focusin({target:input});
 return {input,handlers,api:ctx.window.HTCurrency20};
}
test('V42 everyday amount entry interprets 1000 as 1000 lira, not 10 lira',()=>{
 const t=setupCurrency();
 assert.equal(t.input.value,'1.050,00');
 assert.equal(t.input.type,'text');
 assert.equal(t.input.selected,undefined);
 for(const [value,want] of [['1000','1.000,00'],['2050,00','2.050,00'],
  ['0,50','0,50'],['1000000','1.000.000,00'],['2050.75','2.050,75']]){
  assert.equal(t.api.formatDigits(value),want);
 }
 assert.equal(t.api.fromExisting('1050.00'),'1.050,00');
 assert.equal(t.api.fromExisting('2050.50'),'2.050,50');
});
test('V42 changing the first digit of 1.050,00 leaves remaining digits and cursor untouched',()=>{
 const t=setupCurrency(),i=t.input;
 i.value='2.050,00';i.selectionStart=1;
 t.handlers.input({target:i});
 assert.equal(i.value,'2.050,00');
 assert.equal(i.selectionStart,1);
 assert.equal(i.cursorCalls.length,0);
 // Reformat after removing thousands separator without moving to the end.
 i.value='2050,00';i.selectionStart=1;
 t.handlers.input({target:i});
 assert.equal(i.value,'2.050,00');
 assert.equal(i.selectionStart,1);
});
test('V42 fraction edits stay in the cents portion; no entire amount shift',()=>{
 const t=setupCurrency(),i=t.input;
 i.value='1.050,500';i.selectionStart=i.value.indexOf(',')+2;
 t.handlers.input({target:i});
 assert.equal(i.value,'1.050,50');
 assert.equal(i.selectionStart,i.value.indexOf(',')+2);
 i.value='1000';i.selectionStart=4;
 t.handlers.input({target:i});
 assert.equal(i.value,'1.000,00');
 assert.equal(i.selectionStart,5);
});
test('V42 app ships updated card and currency scripts for Safari/PWA cache refresh',()=>{
 const html=read('public/index.html');
 assert.match(html,/cards-today-v28\.js\?v=75/);
 assert.match(html,/currency-v20\.js\?v=42/);
 assert.match(html,/content="v90"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v90');
});
