import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const source=get('document-import-v71.js');
const html=get('index.html');
const context={window:{}};
vm.runInNewContext(source,context);
const parse=context.window.HTDocumentImportV71;
test('Fatura fotoğrafı: kurum, tür, dönem, son ödeme ve tutar ayrıştırılır',()=>{
 const data=parse.parseBill([
 'ENERJİSA ELEKTRİK',
 'Fatura No: FAT20261180',
 'Abone No: 12345678',
 'Fatura Dönemi: 11.2026',
 'Fatura Tarihi: 02.11.2026',
 'Son Ödeme Tarihi: 25.11.2026',
 'Ödenecek Toplam: 1.234,56 TL'
 ].join('\n'));
 assert.equal(data.provider,'Enerjisa');
 assert.equal(data.category,'electricity');
 assert.equal(data.invoice_no,'FAT20261180');
 assert.equal(data.subscription_no,'12345678');
 assert.equal(data.period,'2026-11');
 assert.equal(data.issue_date,'2026-11-02');
 assert.equal(data.due_date,'2026-11-25');
 assert.equal(data.amount,'1234,56');
 assert.equal(data.period_estimated,false);
});
test('Kredi kartı ekstresi: bankayı yalnızca tek eşleşen kartla ilişkilendirir',()=>{
 const cards=[{id:'x',bank:'Yapı Kredi',last4:'4455'},{id:'y',bank:'Garanti BBVA',last4:'8899'}];
 const data=parse.parseStatement([
 'YAPI KREDİ BANKASI',
 'Kart: **** 4455',
 'Ekstre Dönemi: 10/2026',
 'Hesap Kesim Tarihi: 30.10.2026',
 'Son Ödeme Tarihi: 15.11.2026',
 'Dönem Borcu: 8.145,32 TL'
 ].join('\n'),cards);
 assert.equal(data.card_id,'x');
 assert.equal(data.period,'2026-10');
 assert.equal(data.due_date,'2026-11-15');
 assert.equal(data.amount,'8145,32');
});
test('Belirsiz kart eşleşmesi otomatik kart seçmez',()=>{
 const data=parse.parseStatement('Dönem Borcu: 900,00 TL',[{id:'a',bank:'X Bank',last4:'1234'},{id:'b',bank:'Y Bank',last4:'5678'}]);
 assert.equal(data.card_id,'');
 assert.equal(data.amount,'900,00');
});
test('Geçersiz tarih kabul edilmez; okunamayan tutar elle tamamlanır',()=>{
 assert.equal(parse.dateFrom('Son Ödeme 31.02.2026'),'');
 const data=parse.parseBill('İSKİ\nSon Ödeme Tarihi: 31.02.2026\nToplam tutar okunamıyor');
 assert.equal(data.due_date,'');
 assert.equal(data.amount,'');
});
test('Yükleme sadece mevcut düzenlenebilir fatura ve ekstre formlarına aktarıyor',()=>{
 assert.match(html,/data-v71-photo="bill"/);
 assert.match(html,/data-v71-photo="statement"/);
 assert.match(html,/id="v71BillClearFilters"/);
 assert.match(html,/id="v71DocDialog"/);
 assert.match(get('bills-v50.js'),/openImportedDraft/);
 assert.match(get('app.js'),/window\.HTStatementImportV71=/);
 assert.match(source,/canEdit\(\)/);
 assert.doesNotMatch(source,/\bapi\(|\bfetch\(/);
});
