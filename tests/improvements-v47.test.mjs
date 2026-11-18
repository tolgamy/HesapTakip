import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enrichCard} from '../src/card-details.js';
import {validReceivableGroup} from '../src/firms.js';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('V47 card requires owner-confirmed dates after statement closes, never inventing bank confirmation',()=>{
 const old={id:'c1',card_type:'credit',status:'active',bank:'Akbank',statement_day:18,due_day:28,
  current_statement_date:'2026-11-18',current_due_date:'2026-11-28',credit_limit_kurus:500000,available_limit_kurus:400000};
 const today='2026-11-19';
 const before=enrichCard(old,today);
 assert.equal(before.date_confirmation_needed,true);
 assert.equal(before.display_next_statement_date,null);
 assert.equal(before.display_next_due_date,'2026-11-28');
 assert.equal(before.used_limit_kurus,100000);
 const newer=enrichCard({...old,current_statement_date:'2026-12-18',current_due_date:'2026-12-28'},today);
 assert.equal(newer.date_confirmation_needed,false);
 assert.equal(newer.display_next_statement_date,'2026-12-18');
 assert.equal(newer.display_next_due_date,'2026-12-28');
 const noDates=enrichCard({...old,current_statement_date:null,current_due_date:null},today);
 assert.equal(noDates.date_confirmation_needed,false);
 assert.match(noDates.estimated_statement_date,/^2026-12/);
});
test('V47 card editing has one manual date pair and separate renewal form and date history',()=>{
 const c=read('public/cards-pro.js'),html=read('public/index.html'),server=read('src/index.js');
 const modal=c.slice(c.indexOf("function proCardModal(id='')"),c.indexOf('function estimateLocalDates('));
 assert.match(modal,/cardDateField\('current_statement_date'/);
 assert.match(modal,/cardDateField\('current_due_date'/);
 assert.doesNotMatch(modal,/cardDateField\('next_statement_date'/);
 assert.doesNotMatch(modal,/cardDateField\('next_due_date'/);
 assert.match(c,/function renderCardRenewalBanner\(/);
 assert.match(c,/function openCardRenewal\(/);
 assert.match(c,/function showCardDateHistory\(/);
 assert.match(c,/api\('cards\/'\+id\+'\/renew-dates','POST',d\)/);
 assert.match(html,/id="v47CardRenewals"/);
 assert.match(server,/CREATE TABLE IF NOT EXISTS card_date_history/);
 assert.match(server,/current_statement_date=\?,current_due_date=\?,statement_day=\?,due_day=\?/);
 assert.match(server,/INSERT INTO card_date_history/);
 assert.match(server,/correctionStatement\(env,'card',id,before/);
 assert.match(server,/due<statement/);
});
test('V47 no additional Veresiye tab and no loss of old personal receivables',()=>{
 const html=read('public/index.html'),firm=read('src/firms.js');
 const core=read('public/core-money.js'),ui=read('public/ui-v8.js');
 assert.equal(validReceivableGroup('veresiye'),'person');
 assert.equal(validReceivableGroup('person'),'person');
 assert.match(firm,/UPDATE firms SET receivable_group='person' WHERE category='receivable' AND receivable_group='veresiye'/);
 assert.doesNotMatch(html,/data-v19-platform="veresiye"/);
 assert.doesNotMatch(html,/<option value="veresiye">/);
 assert.match(core,/receivable_group==='veresiye'\?'person'/);
 assert.match(ui,/receivable_group==='veresiye'\?'person'/);
 assert.match(firm,/UPDATE firms SET name=\?,phone=\?,note=\?,receivable_group=/);
});
test('V47 firm logo edit works from phone and desktop without removing old logos',()=>{
 const form=read('public/firms.js'),html=read('public/index.html'),css=read('public/improvements-v47.css');
 assert.match(form,/v47-firm-logo-box/);
 assert.match(form,/id="firm-logo-upload" accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(form,/v47RemoveFirmLogo/);
 assert.match(form,/reduceLogo\(uploaded\)/);
 assert.match(form,/firm\?\.logo_data\|\|''/);
 assert.doesNotMatch(form,/Kuruluş logosu ekle \(yalnızca PC\)/);
 assert.match(css,/\.v47-firm-logo-box/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(html,/improvements-v47\.css\?v=47/);
});
test('V47 only single JSON entry remains on user operations page',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js');
 assert.match(html,/id="v43VaultImport"/);
 assert.match(html,/id="v43VaultImportFile"/);
 assert.doesNotMatch(html,/id="v45BulkOpen"|id="v45BulkDialog"|id="v45BulkFile"/);
 assert.doesNotMatch(html,/vault-bulk-v45\.js\?v=/);
 assert.doesNotMatch(ui,/el\('v45BulkOpen'\)/);
});
test('V47 representative visit message has all six rules and remains editable without auto-send',()=>{
 const ui=read('public/workflows-v22.js');
 for(const section of ['Ziyaret Öncesi Bilgilendirme','Raf ve Stand Düzeni',
 'Son Kullanma Tarihi Kontrolü','Fiyat Güncellemeleri','Kampanyalı Ürünler','Acil Siparişler'])
  assert.ok(ui.includes(section),section);
 assert.match(ui,/data-v47-visit-share/);
 assert.match(ui,/Yarınki ziyaret bilgilendirme mesajı/);
 assert.match(ui,/textarea name="message" id="v22-profile-text"/);
 assert.match(ui,/https:\/\/wa\.me\//);
 const getLiteral=ui.match(/const visitReminder=\[([\s\S]*?)\]\.join\('\\n'\);/);
 assert.ok(getLiteral,'Visitor template must contain real newlines');
});
