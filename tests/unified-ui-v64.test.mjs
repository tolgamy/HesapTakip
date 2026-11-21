import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),css=read('unified-ui-v64.css');
const ui=read('ui-v8.js'),nav=read('navigation-v18.js'),
 users=read('users-v26.js'),settings=read('settings-v12.js');
const cardsCode=read('cards-today-v28.js');

function cardHarness(st={}){
 const dom=new Map();
 const node=id=>{if(!dom.has(id))dom.set(id,{innerHTML:''});return dom.get(id);};
 const state={statements:st.statements||[],payments:st.payments||[]};
 const ctx={window:{},document:{getElementById:node},state,
  trDate:()=>st.today||'2026-11-21',
  showDate:s=>s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4),
  esc:x=>String(x),cardMoney:n=>'₺'+(n/100).toFixed(2)};
 vm.runInNewContext(cardsCode,ctx);
 return {helpers:ctx.window.HTCardToday28,node,state};
}
const card=(id,additional={})=>({
 id,bank:'Enpara',nickname:id,card_type:'credit',status:'active',...additional
});
test('All four UI changes are in one release without financial schema modifications',()=>{
 assert.doesNotMatch(html,/<h3>Yemek kartlarım<\/h3>/);
 assert.doesNotMatch(html,/id="htSettingsMealLogos"/);
 assert.match(html,/id="htSettingsRegistered"/);
 assert.doesNotMatch(settings,/function renderMeal\(/);
 const tabs=[...html.matchAll(/data-v8-accounts="(platforms|people|vault)"/g)].map(x=>x[1]);
 assert.deepEqual(tabs,['platforms','people','vault']);
 assert.match(ui,/let accountSection='platforms'/);
 assert.match(ui,/setAccountsSection\('platforms'\)/);
 assert.match(users,/preferredAccountTab:\(\)=>\['platforms','people','vault'\]/);
 assert.match(nav,/if\(name==='collections'\)/);
 assert.match(nav,/class="v64-finance-nav-icon"/);
 assert.match(css,/#bankingView>\.v18-subnav,\s*#cardsView>\.v18-subnav\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/min-height:112px/);
 assert.match(html,/unified-ui-v64\.css\?v=64/);
 assert.match(html,/İlk kart ödemesi ne zaman/);
 assert.match(cardsCode,/Bugün hangi kartı kullanayım/);
 assert.doesNotMatch(cardsCode,/\bapi\(|\bfetch\(/);
});
test('The next real unpaid statement is shown ahead of future recorded reminders',()=>{
 const c=[card('2434',{next_due_date:'2026-11-22'}),card('5521',{next_due_date:'2026-11-23'})];
 const h=cardHarness({statements:[
  {id:'earlier',card_id:'5521',due_date:'2026-11-24',amount_kurus:125000},
  {id:'later',card_id:'2434',due_date:'2026-11-28',amount_kurus:200000}
 ]});
 const next=h.helpers.nextPayment(c,h.state.statements,[], '2026-11-21');
 assert.equal(next.id,'earlier');
 assert.equal(next.date,'2026-11-24');
 assert.equal(next.days,3);
 h.helpers.renderDue(c,'2026-11-21');
 assert.match(h.node('htCardDue41').innerHTML,/3 gün kaldı/);
 assert.match(h.node('htCardDue41').innerHTML,/₺1250.00/);
 assert.doesNotMatch(h.node('htCardDue41').innerHTML,/₺2000.00/);
});
test('Fully paid statements are excluded; saved due dates are reminders with unknown amount',()=>{
 const c=[card('2434',{next_due_date:'2026-11-24'}),
  card('5521',{next_due_date:'2026-11-23'})];
 const data={statements:[
  {id:'paid',card_id:'2434',due_date:'2026-11-22',amount_kurus:44000}],
  payments:[{statement_id:'paid',amount_kurus:44000}]};
 const h=cardHarness(data);
 h.helpers.renderDue(c,'2026-11-21');
 const out=h.node('htCardDue41').innerHTML;
 assert.match(out,/Enpara · 5521/);
 assert.match(out,/23\.11\.2026/);
 assert.match(out,/2 gün kaldı/);
 assert.match(out,/Kayıtlı ödeme tarihi/);
 assert.match(out,/Borç tutarı kayıtlı değil/);
 assert.doesNotMatch(out,/₺440.00/);
});
test('Old reminders never create fictitious overdue debt and recurring days clamp at month-end',()=>{
 const c=[card('2434',{current_due_date:'2026-10-20',due_day:31})];
 const h=cardHarness({today:'2026-11-21'});
 const next=h.helpers.nextPayment(c,[],[],'2026-11-21');
 assert.equal(next.date,'2026-11-30');
 assert.equal(next.days,9);
 assert.equal(next.estimated,true);
 h.helpers.renderDue(c,'2026-11-21');
 const out=h.node('htCardDue41').innerHTML;
 assert.match(out,/Tahmini ödeme günü/);
 assert.doesNotMatch(out,/gecikti|Ödenecek kalan tutar/);
});
test('Overdue real unpaid amount takes priority over nearest upcoming statement',()=>{
 const h=cardHarness({statements:[
  {id:'a',card_id:'2434',due_date:'2026-11-19',amount_kurus:100000},
  {id:'b',card_id:'5521',due_date:'2026-11-22',amount_kurus:400000}],
  payments:[{statement_id:'a',amount_kurus:60000}]});
 const result=h.helpers.nextPayment([card('2434'),card('5521')],h.state.statements,h.state.payments,'2026-11-21');
 assert.equal(result.id,'a');
 assert.equal(result.days,-2);
 assert.equal(result.amount,40000);
 h.helpers.renderDue([card('2434'),card('5521')],'2026-11-21');
 assert.match(h.node('htCardDue41').innerHTML,/2 gün gecikti/);
 assert.match(h.node('htCardDue41').innerHTML,/₺400.00/);
});
