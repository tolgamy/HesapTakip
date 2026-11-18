import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/cards-pro.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const exports=readFileSync(new URL('../public/export.js',import.meta.url),'utf8');

test('Kredi kartı katalog arayüzünde tüm filtre ve yönetim alanları var',()=>{
 for(const id of ['cardSearch','cardFilterType','cardFilterBank','cardDueWindow','cardFilterStatus',
 'cardSort','cardsSummary','manageInstitutions','institutionDialog','institutionManagement'])
 assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/cards-pro\.js/);
 assert.match(client,/Kullanılabilir limit/);
 assert.match(client,/Kredi kartı/);
 assert.match(client,/Tahmini sonraki kesim/);
 const form=client.slice(client.indexOf('function proCardModal('),client.indexOf('function estimateLocalDates('));
 assert.doesNotMatch(form,/Nakit avans limiti|Asgari ödeme oranı|Bağlı hesap IBAN|Faiz notu|Komisyon notu|Diğer not/);
 assert.match(form,/Banka seç/);
 assert.doesNotMatch(form,/cardDateField\('next_statement_date'/);
 assert.doesNotMatch(form,/cardDateField\('next_due_date'/);
 assert.match(client,/CSV dosyasını içe aktar/);
});
test('Kurum kataloğu backend, tarih hesaplaması ve eski kart CRUD ile entegre',()=>{
 assert.match(worker,/institutionRoute/);
 assert.match(worker,/initializeCardCatalog/);
 assert.match(worker,/cardDetailsKeys/);
 assert.match(worker,/enrichCard/);
 assert.match(worker,/PRAGMA|initializeCardCatalog/);
 assert.match(app,/api\('institutions'\)/);
 assert.match(app,/window\.renderProCards/);
 assert.match(app,/window\.openProCardForm/);
});
test('Excel ve PDF raporlarına kart limitleri ve tarihler dahil',()=>{
 for(const text of ['Kullanılabilir limit','Kullanılan limit','Gelecek kesim','Gelecek ödeme',
 'Tahmini sonraki kesim','Asgari ödeme','Bağlı IBAN','Kurum Katalog'])
 assert.ok(exports.includes(text),text);
});
test('Sadece görseller için kısıtlı kaynaklar izinli, genel script policy değişmedi',()=>{
 assert.match(worker,/script-src 'self'/);
 assert.match(worker,/https:\/\/cdn\.jsdelivr\.net/);
 assert.match(client,/data-favicon/);
 assert.match(client,/image\/webp/);
});
