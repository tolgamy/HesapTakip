import test from 'node:test';
import assert from 'node:assert/strict';
import { institutionSeeds } from '../src/institution-seeds.js';
import { institutionSchema,institutionInput,cardExtraColumns,institutionId } from '../src/card-catalog.js';
import { parseCardDetails,cardDetailsKeys,estimateCardDates,enrichCard } from '../src/card-details.js';

const card={
 owner:'Örnek Sahibi',bank:'Garanti BBVA',nickname:'Şirket Bonus',last4:'1234',
 institution_id:'garanti',card_type:'credit',usage_type:'business',is_additional:false,
 credit_limit_kurus:25000000,available_limit_kurus:8750000,cash_advance_limit_kurus:2000000,
 statement_day:5,due_day:15,
 current_statement_date:'2026-11-05',current_due_date:'2026-11-15',
 next_statement_date:null,next_due_date:null,currency:'TRY',
 status:'active',reminder_enabled:true,min_payment_percent:20,
 interest_note:'Banka ile teyit edin.',commission_note:'',linked_iban:'',note:'',color:'#0a2c38'
};

test('Katalog Türkiye bankaları ve ödeme kuruluşlarını içerir, id çakışmaz',()=>{
 assert.equal(institutionSeeds.length,139);
 assert.equal(institutionSeeds.filter(x=>x.type==='bank').length,66);
 assert.equal(institutionSeeds.filter(x=>x.type==='payment').length,73);
 assert.equal(new Set(institutionSeeds.map(x=>x.id)).size,139);
 for(const id of ['akbank','enpara','qnb','papara','paytr','iyzico','token-tami','param','paycell'])
  assert.ok(institutionSeeds.some(x=>x.id===id),id);
 assert.equal(institutionSeeds.some(x=>x.id==='ininal'),false);
});
test('Katalog şeması ve kart alanları mevcut verileri silmez',()=>{
 for(const sql of institutionSchema){assert.match(sql,/IF NOT EXISTS/);assert.doesNotMatch(sql,/^\s*(?:DROP|DELETE)/i);}
 assert.ok(Object.keys(cardExtraColumns).length>=20);
 for(const col of ['institution_id','credit_limit_kurus','available_limit_kurus',
   'statement_day','due_day','next_statement_date','next_due_date','linked_iban','color'])
  assert.ok(cardExtraColumns[col],col);
});
test('Kurum logosu güvenli resim formatlarıyla sınırlıdır',()=>{
 assert.equal(institutionInput({name:'Örnek',type:'payment',domain:'example.com',
  logo_data:'data:image/webp;base64,QUJD'}).domain,'example.com');
 assert.throws(()=>institutionInput({name:'Örnek',type:'bank',domain:'evil.test/a',
  logo_data:'data:image/svg+xml;base64,QUJD'}));
 assert.throws(()=>institutionInput({name:'Örnek',type:'bank',domain:'localhost:3000'}));
 assert.equal(institutionId('custom-550e8400-e29b-41d4-a716-446655440000'),
  'custom-550e8400-e29b-41d4-a716-446655440000');
});
test('Kart kredi limiti ve kullanılabilir limit denetimi',()=>{
 const c=parseCardDetails(card);
 assert.equal(c.credit_limit_kurus,25000000);
 assert.equal(c.available_limit_kurus,8750000);
 assert.equal(enrichCard(c,'2026-11-17').used_limit_kurus,16250000);
 assert.deepEqual(cardDetailsKeys.includes('credit_limit_kurus'),true);
 assert.throws(()=>parseCardDetails({...card,available_limit_kurus:26000000}));
 assert.throws(()=>parseCardDetails({...card,min_payment_percent:120}));
 assert.throws(()=>parseCardDetails({...card,statement_day:32}));
 assert.throws(()=>parseCardDetails({...card,last4:'1234567890123456'}));
});
test('Eski basit kart kaydı yeni alanlar olmadan çalışır',()=>{
 const legacy=parseCardDetails({owner:'Ali',bank:'Akbank',nickname:'Kart 1',last4:'5555'});
 assert.equal(legacy.credit_limit_kurus,null);
 assert.equal(legacy.statement_day,null);
 assert.equal(legacy.status,'active');
 const projection=enrichCard(legacy,'2026-11-17');
 assert.equal(projection.estimated_statement_date,null);
 assert.equal(projection.used_limit_kurus,null);
});
test('Kesim ve ödeme günleri aylık hesaplanır',()=>{
 const calc=estimateCardDates({statement_day:5,due_day:15},'2026-11-17');
 assert.equal(calc.estimated_statement_date,'2026-12-05');
 assert.equal(calc.estimated_due_date,'2026-12-15');
 assert.equal(calc.following_statement_date,'2027-01-05');
 assert.equal(calc.following_due_date,'2027-01-15');
 const nextMonth=estimateCardDates({statement_day:26,due_day:6},'2026-11-17');
 assert.equal(nextMonth.estimated_statement_date,'2026-11-26');
 assert.equal(nextMonth.estimated_due_date,'2026-12-06');
});
test('31 Şubat son gününe kırpılır; artık yılda 29 Şubat',()=>{
 const feb=estimateCardDates({statement_day:31,due_day:4},'2028-01-31');
 assert.equal(feb.estimated_statement_date,'2028-02-29');
 assert.equal(feb.estimated_due_date,'2028-03-04');
 const nonLeap=estimateCardDates({statement_day:31,due_day:4},'2027-01-31');
 assert.equal(nonLeap.estimated_statement_date,'2027-02-28');
});
test('Gerçek sonraki tarih tahminin üzerine geçer',()=>{
 const enriched=enrichCard({...parseCardDetails(card),next_due_date:'2026-12-17'},'2026-11-17');
 assert.equal(enriched.estimated_due_date,'2026-12-15');
 assert.equal(enriched.display_next_due_date,'2026-12-17');
});
