import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {firmRoute} from '../src/firms.js';
import {financeRoute} from '../src/finance.js';
import {correctionSchema} from '../src/corrections.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const oldDate='2026-11-17',newDate='2026-11-18';
const post=(path,method,payload)=>new Request('https://example.test'+path,{
 method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)
});
const charge=(amount=52400)=>({id,firm_id:id,kind:'charge',
 amount_kurus:amount,on_date:oldDate,due_date:'2026-11-25',note:'İlk kayıt'});
const settlement=(amount=30000)=>({...charge(amount),kind:'settlement',due_date:null});
function firmDb({old=charge(),current=52400,linked=null,cash=null,
 bankBalance=100000,card=null}={}){
 const batches=[],seen=[];
 const db={
  prepare(sql){
   const item={sql,args:[],bind(...args){this.args=args;return this;},
    async first(){
     seen.push(this);
     if(sql.startsWith('SELECT id,firm_id,kind,amount_kurus,on_date,due_date,note FROM firm_movements'))return old;
     if(sql.includes('AS balance FROM firm_movements WHERE firm_id=?'))return {balance:current};
     if(sql.startsWith('SELECT id,cash_entry_id,card_id,amount_kurus FROM linked_settlements'))return linked;
     if(sql.startsWith('SELECT id,account_id,direction,amount_kurus,category,entry_date,note FROM cash_entries'))return cash;
     if(sql.includes('AS balance FROM cash_accounts WHERE id=?'))return {balance:bankBalance};
     if(sql.startsWith('SELECT id,credit_limit_kurus,available_limit_kurus FROM cards'))return card;
     return null;
    },
    async run(){return {meta:{changes:1}};}
   };
   return item;
  },
  async batch(items){batches.push(items);return items.map(()=>({meta:{changes:1}}))}
 };
 return {db,batches,seen};
}
function cashDb({old={id,account_id:id,direction:'in',category:'income',
 amount_kurus:52400,entry_date:oldDate,note:'Kasa satışı'},
 entries=[{account_id:id,direction:'in',amount_kurus:52400}],
 opening=20000,linked=null}={}){
 const batches=[];
 const db={prepare(sql){
  return {sql,args:[],bind(...args){this.args=args;return this;},
   async first(){
    if(sql.startsWith('SELECT id,account_id,direction,amount_kurus,category,entry_date,note FROM cash_entries'))return old;
    if(sql.includes('SELECT id FROM linked_settlements WHERE cash_entry_id=?'))return linked;
    if(sql.startsWith('SELECT id,opening_kurus FROM cash_accounts'))return {id,opening_kurus:opening};
    if(sql.startsWith('SELECT * FROM cash_accounts'))return {id,opening_kurus:opening,name:'Nakit kasa',note:''};
    return null;
   },
   async all(){return {results:entries};},
   async run(){return {meta:{changes:1}};}
  };
 },async batch(items){batches.push(items);return items.map(()=>({meta:{changes:1}}))}};
 return {db,batches};
}
test('524 TL firmaya mal alışı 574 TL olarak düzelir, tek hareket kalır, eski/yeni değerler kaydedilir',async()=>{
 const m=firmDb();
 const r=await firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:57400,on_date:newDate,due_date:'2026-11-26',note:'Gerçek fatura'
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH');
 assert.equal(r.ok,true);
 assert.equal(r.remaining,57400);
 assert.equal(m.batches.length,1);
 assert.equal(m.batches[0].length,2);
 assert.match(m.batches[0][0].sql,/UPDATE firm_movements/);
 assert.deepEqual(m.batches[0][0].args.slice(0,2),[57400,newDate]);
 const audit=m.batches[0][1];
 assert.match(audit.sql,/INSERT INTO correction_log/);
 assert.equal(JSON.parse(audit.args[3]).amount_kurus,52400);
 assert.equal(JSON.parse(audit.args[4]).amount_kurus,57400);
 assert.ok(correctionSchema.every(sql=>/IF NOT EXISTS/i.test(sql)));
});
test('Daha önce 300 TL tahsil edilmişken 524 TL satışı 200 TLye indirmek reddedilir',async()=>{
 const m=firmDb({old:charge(52400),current:22400});
 await assert.rejects(()=>firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:20000,on_date:newDate,due_date:null,note:''
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH'),/aşar/);
 assert.equal(m.batches.length,0);
});
test('500 TL satıştan 300 TL gelen tahsilatı 350 TLye düzeltince banka girişi de değişir',async()=>{
 const old=settlement(30000);
 const linked={id:'link',cash_entry_id:'entry',card_id:null,amount_kurus:30000};
 const cash={id:'entry',account_id:id,direction:'in',amount_kurus:30000,category:'other',entry_date:oldDate,note:''};
 const m=firmDb({old,current:20000,linked,cash,bankBalance:70000});
 const r=await firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:35000,on_date:newDate,note:'Ertesi gün gelen para'
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH');
 assert.equal(r.remaining,15000);
 assert.equal(m.batches[0].length,4);
 assert.match(m.batches[0][1].sql,/UPDATE cash_entries SET amount_kurus/);
 assert.deepEqual(m.batches[0][1].args.slice(0,2),[35000,newDate]);
 assert.match(m.batches[0][2].sql,/UPDATE linked_settlements/);
});
test('Bankaya 300 TL geldi, 100 TL olarak düzeltmek bakiyeyi eksiye düşürecekse reddedilir',async()=>{
 const old=settlement();
 const linked={id:'link',cash_entry_id:'entry',card_id:null,amount_kurus:30000};
 const cash={id:'entry',account_id:id,direction:'in',amount_kurus:30000,category:'other',entry_date:oldDate,note:''};
 const m=firmDb({old,current:20000,linked,cash,bankBalance:10000});
 await assert.rejects(()=>firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:10000,on_date:newDate
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH'),/eksiye/);
 assert.equal(m.batches.length,0);
});
test('400 TL firmaya kredi kartı ödemesi 450 TL olunca kart kullanılabilir limiti de 50 TL azalır',async()=>{
 const m=firmDb({old:settlement(40000),current:60000,
  linked:{id:'link',cash_entry_id:null,card_id:id,amount_kurus:40000},
  card:{id,credit_limit_kurus:100000,available_limit_kurus:50000}});
 const r=await firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:45000,on_date:newDate,note:'Gerçek ödeme'
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH');
 assert.equal(r.remaining,55000);
 const cardUpdate=m.batches[0].find(x=>x.sql.startsWith('UPDATE cards'));
 assert.equal(cardUpdate.args[0],45000);
 assert.match(m.batches[0].at(-1).sql,/INSERT INTO correction_log/);
});
test('Kullanılabilir kart limiti yetersizse ödeme büyütme düzeltilmeden kalır',async()=>{
 const m=firmDb({old:settlement(40000),current:60000,
  linked:{id:'link',cash_entry_id:null,card_id:id,amount_kurus:40000},
  card:{id,credit_limit_kurus:100000,available_limit_kurus:1000}});
 await assert.rejects(()=>firmRoute(post('/api/firm-movements/'+id,'PATCH',{
  amount_kurus:45000,on_date:newDate
 }),{DB:m.db},'/api/firm-movements/'+id,'PATCH'),/limitini aşar/);
 assert.equal(m.batches.length,0);
});
test('Nakit kasa girişini 524 TLden 574 TLye düzeltince aynı banka/kasa kaydı güncellenir',async()=>{
 const m=cashDb();
 const r=await financeRoute(post('/api/entries/'+id,'PATCH',{
  amount_kurus:57400,entry_date:newDate,direction:'in',category:'income',note:'Doğru kasa satışı'
 }),{DB:m.db},'/api/entries/'+id,'PATCH');
 assert.equal(r.balance,77400);
 assert.equal(m.batches.length,1);
 assert.equal(m.batches[0].length,2);
 assert.match(m.batches[0][0].sql,/UPDATE cash_entries/);
 assert.equal(m.batches[0][0].args[1],57400);
});
test('Firmaya bağlı nakit hareketi doğrudan değiştirilemez, ilgili tahsilat düzeltilecek',async()=>{
 const m=cashDb({linked:{id:'linked'}});
 await assert.rejects(()=>financeRoute(post('/api/entries/'+id,'PATCH',{
  amount_kurus:57400,entry_date:newDate
 }),{DB:m.db},'/api/entries/'+id,'PATCH'),/ilgili firma hareketinden/);
 assert.equal(m.batches.length,0);
});
test('Banka çıkışını büyütmek eksi bakiyeye yol açarsa reddedilir',async()=>{
 const m=cashDb({old:{id,account_id:id,direction:'out',category:'expense',
  amount_kurus:5000,entry_date:oldDate,note:'Gider'},
  entries:[{account_id:id,direction:'out',amount_kurus:5000}],opening:10000});
 await assert.rejects(()=>financeRoute(post('/api/entries/'+id,'PATCH',{
  amount_kurus:20000,entry_date:newDate,direction:'out',category:'expense',note:''
 }),{DB:m.db},'/api/entries/'+id,'PATCH'),/eksiye/);
 assert.equal(m.batches.length,0);
});
test('Kasa açılış bakiyesi düzeltilebilir ama negatif bakiye doğuramaz',async()=>{
 const m=cashDb({entries:[{account_id:id,direction:'out',amount_kurus:10000}],
  opening:15000});
 const ok=await financeRoute(post('/api/accounts/'+id,'PATCH',{
  name:'Ana kasa',note:'Doğru açılış',opening_kurus:12000
 }),{DB:m.db},'/api/accounts/'+id,'PATCH');
 assert.equal(ok.ok,true);
 assert.equal(m.batches[0][0].args[2],12000);
 const bad=cashDb({entries:[{account_id:id,direction:'out',amount_kurus:10000}],opening:15000});
 await assert.rejects(()=>financeRoute(post('/api/accounts/'+id,'PATCH',{
  name:'Ana kasa',note:'',opening_kurus:5000
 }),{DB:bad.db},'/api/accounts/'+id,'PATCH'),/eksiye/);
 assert.equal(bad.batches.length,0);
});
test('POS, yemek kartı, platform, banka/kasa ve kart ödemelerinin hepsinde Düzenle butonu var',()=>{
 for(const name of ['public/core-money.js','public/firms.js','public/ui-v8.js']){
  assert.match(readFileSync(new URL('../'+name,import.meta.url),'utf8'),/data-firm-movement-edit/);
 }
 for(const name of ['public/core-money.js','public/finance-suite.js']){
  assert.match(readFileSync(new URL('../'+name,import.meta.url),'utf8'),/data-suite-edit-entry/);
 }
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(app,/data-v13-edit-payment/);
 assert.match(worker,/paymentMatch && method === 'PATCH'/);
 assert.match(worker,/correctionSchema/);
 assert.match(html,/correction-v13\.js/);
 assert.match(html,/v13ShowCorrections/);
 const ui=readFileSync(new URL('../public/correction-v13.js',import.meta.url),'utf8');
 assert.match(ui,/Düzeltmeyi kaydet/);
 assert.match(ui,/confirm\('Bu kayıt gerçekten düzeltilecek/);
 assert.match(ui,/api\('firm-movements\/'\+id,'PATCH'/);
});
