import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html=read('index.html');
const css=read('clean-ui-v75.css');
const cards=read('cards-today-v28.js');
const biometrics=read('biometric-v56.js');
const supplier=read('workflows-v22.js');
const ledger=read('ledger-v10.js');

test('All pages use the native Apple-style system font; helper text is hidden globally',()=>{
 assert.match(html,/clean-ui-v75\.css\?v=75/);
 assert.match(css,/font-family:-apple-system,BlinkMacSystemFont/);
 assert.match(css,/\.view \.section-head p\.muted/);
 assert.match(css,/#pageSubtitle/);
 assert.match(css,/#settingsView \.v60-tool > p\.hint/);
 assert.match(css,/#settingsView \.ht-pin-settings \.muted/);
 assert.match(css,/#directoryView \.dir-tools > \.hint/);
 assert.match(css,/#billsView > p\.hint/);
 assert.match(css,/@media\(max-width:740px\)/);
});

test('Settings hosts a keyboard-accessible collapsed usage guide instead of scattered instructions',()=>{
 const settings=html.indexOf('id="settingsView"');
 const tile=html.indexOf('id="v68BillsTile"',settings);
 const guide=html.indexOf('id="v75UserGuide"',settings);
 const center=html.indexOf('id="v60Center"',settings);
 const pin=html.indexOf('class="ht-pin-settings"',center);
 assert.ok(settings>=0&&tile>settings&&center>tile&&pin>center&&guide>pin);
 assert.match(html,/id="v75UserGuide" class="v75-user-guide" aria-label="Kullanım Kılavuzu">[\s\S]*?<summary>/);
 for(const topic of ['Finans ve kartlar','Firma borcu ve kısmi ödeme','Ödeme kaynağı',
  'Alacaklar ve filtreler','Faturalar','PIN ve telefon kilidi','Raporlar, PDF ve WhatsApp']){
  assert.ok(html.includes(topic),topic);
 }
 assert.match(html,/5 dakika hareketsizlikte kilitlenir/);
 assert.match(html,/₺700\.000 borç için ₺100\.000/);
 assert.doesNotMatch(html.slice(guide,guide+160),/id="v75UserGuide"[^>]*\bopen\b/);
});

test('Finance home card panels show essentials, not long automatic-recommendation prose',()=>{
 const hint={innerHTML:''},due={innerHTML:''};
 const context={window:{},state:{statements:[],payments:[]},
  document:{getElementById:id=>id==='htCardToday28'?hint:id==='htCardDue41'?due:null},
  trDate:()=> '2026-11-22',esc:s=>String(s),showDate:x=>x,cardMoney:()=>''};
 vm.runInNewContext(cards,context);
 context.window.HTCardToday28.render([
  {id:'a',bank:'Enpara',nickname:'Kart 2434',statement_day:19,due_day:30,card_type:'credit',status:'active',available_limit_kurus:0}
 ]);
 assert.match(hint.innerHTML,/Son kesimi geçen kart/);
 assert.match(hint.innerHTML,/Enpara/);
 assert.match(hint.innerHTML,/Limiti kontrol et/);
 assert.doesNotMatch(hint.innerHTML,/Öneri yalnız|Kart limiti kart detaylarından/);
 assert.match(due.innerHTML,/Sıradaki kart tarihi/);
 assert.match(due.innerHTML,/Borç tutarı kayıtlı değil/);
 assert.doesNotMatch(due.innerHTML,/bankadan borç alınmaz|yalnızca hesap kesim/);
});

test('Existing payment and security operations remain wired; only copy is shorter',()=>{
 assert.match(ledger,/api\('settlements','POST',payload\)/);
 assert.match(ledger,/v73RemainingPreview/);
 assert.match(ledger,/Fazla ödeme:/);
 assert.match(ledger,/Banka\/kasa hesabı seçilirse hesap hareketi oluşur/);
 assert.match(supplier,/data-v22-profile-share/);
 assert.match(supplier,/data-v22-profile-edit/);
 assert.match(supplier,/renderSuppliers/);
 assert.match(biometrics,/id="htBioRegister"/);
 assert.match(biometrics,/id="htBioStatus"/);
 assert.doesNotMatch(biometrics,/Bilgisayarda yalnız 6 haneli PIN/);
 assert.match(html,/name="ht-build" content="v85"/);
});
