import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {firmRoute} from '../src/firms.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const movementId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function editRequest(payload){
 return new Request('https://example.com/api/firms/'+id+'/details',{
  method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
 });
}
const account=(amount=52400)=>({
 name:'Multinet',category:'receivable',receivable_group:'meal',
 phone:'',note:'',payout_institution_id:'enpara',logo_data:'',
 movement:{id:movementId,amount_kurus:amount,on_date:'2026-11-18',
 due_date:'2026-11-20',note:'Günlük yemek satışı'}
});
function dbMock({firmBalance=52400,previousAmount=52400,count=1,missingBank=false}={}){
 const batches=[],calls=[];
 const db={
  prepare(sql){
   const stmt={sql,args:[],bind(...args){this.args=args;return this;},
    async first(){
     calls.push(this);
     if(sql.includes('FROM firms WHERE id=?'))return {
      id,category:'receivable',receivable_group:'meal',payout_institution_id:'enpara',logo_data:''
     };
     if(sql.includes('FROM institutions WHERE id=? AND is_active=1'))
      return missingBank?null:{id:'enpara'};
     if(sql.startsWith('SELECT firm_id,kind FROM firm_movements WHERE id=?'))
      return {firm_id:id,kind:'charge'};
     if(sql.startsWith('SELECT id,firm_id,kind,amount_kurus,on_date,due_date,note FROM firm_movements'))
      return {id:movementId,firm_id:id,kind:'charge',amount_kurus:previousAmount,
       on_date:'2026-11-17',due_date:'2026-11-19',note:'Eski açıklama'};
     if(sql.includes('AS balance FROM firm_movements WHERE firm_id=?'))
      return {balance:firmBalance};
     if(sql.startsWith('SELECT id,cash_entry_id,card_id,amount_kurus FROM linked_settlements'))
      return null;
     if(sql.startsWith('SELECT COUNT(*) AS n FROM firm_movements WHERE firm_id=?'))
      return {n:count};
     return null;
    },
    async run(){return {meta:{changes:1}};}
   };
   return stmt;
  },
  async batch(items){batches.push(items);return items.map(()=>({meta:{changes:1}}))}
 };
 return {db,batches,calls};
}
function simulateForm({movements=[]}={}){
 const nodes=new Map();
 function el(key){
  if(!nodes.has(key))nodes.set(key,{innerHTML:'',onclick:null,onsubmit:null,
   querySelectorAll(){return [];},showModal(){},close(){}});
  return nodes.get(key);
 }
 const firm={id,name:'MultiNet',category:'receivable',receivable_group:'meal',
  phone:'',note:'',payout_institution_id:'enpara',logo_data:''};
 const ctx={
  window:{},document:{addEventListener(){}},state:{
   firms:[firm],firmMovements:movements,institutions:[
    {id:'enpara',name:'Enpara',is_active:1,type:'bank'},
    {id:'paytr',name:'PayTR',is_active:1,type:'payment'}
   ]
  },
  el,notice(){},money:v=>(v/100).toFixed(2),trDate:()=> '2026-11-18',
  showDate:d=>d||'',esc:t=>String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  currentRole:'admin',api(){},load(){},reduceLogo(){},amountValue:()=>0
 };
 vm.runInNewContext(read('public/firms.js'),ctx);
 ctx.window.openFirmForm('edit',id);
 return el('modalContents').innerHTML;
}
test('Ekrandaki mevcut Multinet 50.000 TL düzenleme penceresinde miktar, tarih, banka ve vade görünür',()=>{
 const html=simulateForm({movements:[{id:movementId,firm_id:id,kind:'charge',
  amount_kurus:5000000,on_date:'2026-11-18',due_date:'2026-11-22',
  note:'İlk satış'}]});
 assert.match(html,/Alacağım tutar/);
 assert.match(html,/name="amount" type="number" value="50000\.00"/);
 assert.match(html,/İşlem tarihi/);
 assert.match(html,/Tahmini paranın geleceği tarih/);
 assert.match(html,/name="due_date" type="date" value="2026-11-22"/);
 assert.match(html,/Paranın geleceği banka \/ ödeme kuruluşu/);
 assert.match(html,/Enpara/);
 assert.match(html,/İlk satış/);
});
test('Yeni yemek kartı hesabına aynı formda ilk satış, vade ve gelecek banka girilir',()=>{
 const html=simulateForm();
 assert.match(html,/İlk alacak \/ borç girişini yap/);
 assert.match(html,/name="amount"/);
 assert.match(html,/name="on_date"/);
 assert.match(html,/name="due_date"/);
 assert.match(html,/name="payout_institution_id"/);
});
test('Birden fazla satış varsa tek toplam düzenlenmez; tüm hareketlerin ayrı Düzenle düğmesi görünür',()=>{
 const html=simulateForm({movements:[
  {id:movementId,firm_id:id,kind:'charge',amount_kurus:50000,on_date:'2026-11-17'},
  {id:'cccccccc-cccc-cccc-cccc-cccccccccccc',firm_id:id,kind:'charge',amount_kurus:15000,on_date:'2026-11-18'}
 ]});
 assert.match(html,/birden fazla işlem var/);
 assert.equal((html.match(/data-v14-edit-movement=/g)||[]).length,2);
 assert.doesNotMatch(html,/name="amount"/);
});
test('524 TL → 574 TL aynı hareket; banka/kurum, tarih ve açıklama aynı D1 batch içinde',async()=>{
 const m=dbMock();
 const result=await firmRoute(editRequest(account(57400)),{DB:m.db},
  '/api/firms/'+id+'/details','PATCH');
 assert.equal(result.remaining,57400);
 assert.equal(m.batches.length,1);
 assert.equal(m.batches[0].length,3);
 assert.match(m.batches[0][0].sql,/UPDATE firm_movements/);
 assert.equal(m.batches[0][0].args[0],57400);
 assert.equal(m.batches[0][0].args[1],'2026-11-18');
 assert.equal(m.batches[0][0].args[2],'2026-11-20');
 assert.match(m.batches[0][1].sql,/INSERT INTO correction_log/);
 assert.equal(JSON.parse(m.batches[0][1].args[3]).amount_kurus,52400);
 assert.equal(JSON.parse(m.batches[0][1].args[4]).amount_kurus,57400);
 assert.match(m.batches[0][2].sql,/UPDATE firms SET/);
 assert.ok(m.batches[0][2].args.includes('enpara'));
});
test('Tahsil edilmiş 300 TL varsa 524 TL satışı 200 TLye düşürmek engellenir',async()=>{
 const m=dbMock({firmBalance:22400});
 await assert.rejects(()=>firmRoute(editRequest(account(20000)),{DB:m.db},
  '/api/firms/'+id+'/details','PATCH'),/aşar/);
 assert.equal(m.batches.length,0);
});
test('İşlem olmayan yemek kartına düzenleme ekranından ilk alacak ve vade eklenebilir',async()=>{
 const m=dbMock({count:0});
 const payload=account(57400);
 payload.movement.id=null;
 const result=await firmRoute(editRequest(payload),{DB:m.db},
  '/api/firms/'+id+'/details','PATCH');
 assert.equal(result.remaining,57400);
 assert.equal(m.batches.length,1);
 assert.equal(m.batches[0].length,2);
 assert.match(m.batches[0][0].sql,/UPDATE firms SET/);
 assert.match(m.batches[0][1].sql,/INSERT INTO firm_movements/);
 assert.ok(m.batches[0][1].args.includes(57400));
 assert.ok(m.batches[0][1].args.includes('2026-11-20'));
});
test('Bağlı ödeme bankası geçersizse tutar veya cari kayıt değişmez',async()=>{
 const m=dbMock({missingBank:true});
 await assert.rejects(()=>firmRoute(editRequest(account()),{DB:m.db},
  '/api/firms/'+id+'/details','PATCH'),/bulunamadı/);
 assert.equal(m.batches.length,0);
});
test('Bankalarım ekranından hatalı logolu EdenredPOS kısayolu kalktı; POS hesabı duruyor',()=>{
 const html=read('public/index.html'),code=read('public/ledger-v10.js');
 assert.doesNotMatch(html,/data-v11-edenred-pos/);
 assert.doesNotMatch(code,/data-v11-edenred-pos/);
 assert.match(html,/data-v10-pos-new/);
 assert.match(read('src/institution-seeds.js'),/"id": "edenred-pos"/);
});
test('Kartlarda işlem ve beklenen ödeme tarihi ile banka adını göster; iPhone modalı kaydırılabilir',()=>{
 const core=read('public/core-money.js'),css=read('public/receivable-edit-v14.css');
 assert.match(core,/Beklenen ödeme/);
 assert.match(core,/Paranın geleceği kuruluş/);
 assert.match(css,/#modal:has\(#firmForm\)/);
 assert.match(css,/v10-record-open\{display:block/);
});
