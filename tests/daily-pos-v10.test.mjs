import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {firmSchema,firmRoute,remainingBalance,validReceivableGroup} from '../src/firms.js';
import {financeRoute} from '../src/finance.js';

const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=get('public/index.html');
const core=get('public/core-money.js');
const cardUI=get('public/cards-pro.js');
const ledgerUI=get('public/ledger-v10.js');
const styles=get('public/ledger-v10.css');
const app=get('public/app.js');
const index=get('src/index.js');
const formUI=get('public/firms.js');

function dbMock({category='receivable',balance=50000,accountBalance=120000,cardAvailable=1000000,
  creditLimit=2000000,linked=null,sourceCard=false}={}){
 const calls=[],batches=[],returns=[];
 const db={
  prepare(sql){
   const s={sql,args:[],
    bind(...args){this.args=args;return this;},
    async first(){
     calls.push(this);
     if(sql.includes('FROM firms WHERE id='))return {id:'f',category,receivable_group:category==='payable'?'general':'pos'};
     if(sql.includes('AS balance')&&sql.includes('firm_movements'))return {balance};
     if(sql.includes('AS balance')&&sql.includes('cash_entries'))return {balance:accountBalance};
     if(sql.includes('FROM cash_accounts WHERE id='))return {id:'a',type:'bank',opening_kurus:100000};
     if(sql.includes('FROM cards WHERE id='))return {
      id:'c',card_type:'credit',currency:'TRY',credit_limit_kurus:creditLimit,
      available_limit_kurus:cardAvailable};
     if(sql.includes('FROM linked_settlements WHERE movement_id='))return linked;
     if(sql.includes('FROM firm_movements WHERE id='))return {firm_id:'f',kind:'settlement',amount_kurus:30000};
     if(sql.includes('FROM cash_entries WHERE id='))return {account_id:'a',direction:'in',amount_kurus:30000};
     return null;
    },
    async run(){calls.push(this);return {success:true,meta:{changes:1}};}
   };
   return s;
  },
  async batch(items){batches.push(items);return items.map(()=>({success:true,meta:{changes:1}}));}
 };
 return {db,calls,batches};
}
const post=(payload)=>new Request('https://example.test/api/settlements',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
});

test('Satış 500 ₺, tahsil edilen 300 ₺ => alacak 200 ₺',()=>{
 const open=remainingBalance([
  {kind:'charge',amount_kurus:50000},
  {kind:'settlement',amount_kurus:30000}
 ]);
 assert.equal(open,20000);
 assert.equal(validReceivableGroup('pos'),'pos');
 assert.ok(firmSchema.join('\n').includes('linked_settlements'));
 assert.ok(!firmSchema.join('\n').includes('DROP TABLE'));
});
test('POS 300 ₺ tahsilatı banka hesabına giriş ve cari tahsilat olarak tek D1 batch',async()=>{
 const m=dbMock();
 const result=await firmRoute(post({firm_id:'12345678-1234-1234-1234-123456789012',
  amount_kurus:30000,on_date:'2026-11-18',account_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 }),{DB:m.db},'/api/settlements','POST');
 assert.equal(result.ok,true);
 assert.equal(m.batches.length,1);
 const stmts=m.batches[0];
 assert.equal(stmts.length,3);
 assert.ok(stmts.some(x=>x.sql.includes('INSERT INTO firm_movements')&&x.args.includes('settlement')));
 assert.ok(stmts.some(x=>x.sql.includes('INSERT INTO cash_entries')&&x.args.includes('in')&&x.args.includes(30000)));
 assert.ok(stmts.some(x=>x.sql.includes('INSERT INTO linked_settlements')));
});
test('5.000 ₺ firma borcundan 4.000 ₺ kredi kartıyla öde; kalan 1.000 ₺',async()=>{
 const remaining=remainingBalance([{kind:'charge',amount_kurus:500000},
  {kind:'settlement',amount_kurus:400000}]);
 assert.equal(remaining,100000);
 const m=dbMock({category:'payable',balance:500000,cardAvailable:600000});
 const result=await firmRoute(post({firm_id:'12345678-1234-1234-1234-123456789012',
  amount_kurus:400000,on_date:'2026-11-18',card_id:'cccccccc-cccc-cccc-cccc-cccccccccccc'
 }),{DB:m.db},'/api/settlements','POST');
 assert.equal(result.ok,true);
 const sql=m.batches[0];
 assert.ok(sql.some(x=>x.sql.includes('UPDATE cards SET available_limit_kurus=available_limit_kurus-?')
  &&x.args[0]===400000));
 assert.ok(sql.some(x=>x.sql.includes('INSERT INTO firm_movements')));
 assert.equal(sql.length,3);
});
test('Kredi kartı kullanılabilir limiti yetersizse cari borç azaltılamaz',async()=>{
 const m=dbMock({category:'payable',balance:500000,cardAvailable:100000});
 await assert.rejects(()=>firmRoute(post({firm_id:'12345678-1234-1234-1234-123456789012',
  amount_kurus:400000,on_date:'2026-11-18',card_id:'cccccccc-cccc-cccc-cccc-cccccccccccc'
 }),{DB:m.db},'/api/settlements','POST'),/yetersiz/);
 assert.equal(m.batches.length,0);
});
test('Bankadan ödeme, yeterli para yoksa cari hesaba işlenmiyor',async()=>{
 const m=dbMock({category:'payable',balance:500000,accountBalance:100000});
 await assert.rejects(()=>firmRoute(post({firm_id:'12345678-1234-1234-1234-123456789012',
  amount_kurus:400000,on_date:'2026-11-18',account_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 }),{DB:m.db},'/api/settlements','POST'),/yetersiz/);
 assert.equal(m.batches.length,0);
});
test('Ödeme silinince bağlı POS banka girişi de aynı işlemin parçası olarak geri alınır',async()=>{
 const m=dbMock({linked:{id:'link',cash_entry_id:'entry',card_id:null,amount_kurus:30000},
   accountBalance:150000});
 const result=await firmRoute(new Request('https://example.test/api/firm-movements/12345678-1234-1234-1234-123456789012',
  {method:'DELETE'}),{DB:m.db},'/api/firm-movements/12345678-1234-1234-1234-123456789012','DELETE');
 assert.equal(result.ok,true);
 assert.equal(m.batches.length,1);
 assert.ok(m.batches[0].some(x=>x.sql.includes('DELETE FROM linked_settlements')));
 assert.ok(m.batches[0].some(x=>x.sql.includes('DELETE FROM cash_entries')));
 assert.ok(m.batches[0].some(x=>x.sql.includes('DELETE FROM firm_movements')));
});
test('Bağlı banka girişi tek başına silinemez; önce cari tahsilatı sil',async()=>{
 const m=dbMock({linked:{id:'linked'},accountBalance:100000});
 const original=m.db.prepare;
 m.db.prepare=function(sql){
  const stmt=original.call(this,sql);
  const first=stmt.first;
  stmt.first=async function(){
   if(sql.includes('FROM cash_entries WHERE id='))return {id:'entry',account_id:'a',direction:'in',amount_kurus:30000};
   if(sql.includes('FROM linked_settlements WHERE cash_entry_id='))return {id:'linked'};
   return first.call(this);
  };
  return stmt;
 };
 await assert.rejects(()=>financeRoute(new Request('https://example.test/api/entries/12345678-1234-1234-1234-123456789012',
 {method:'DELETE'}),{DB:m.db},'/api/entries/12345678-1234-1234-1234-123456789012','DELETE'),/bağlıdır/);
});
test('Ekran POS, kasa, detay, onaylı silme ve grup filtrelerini içeriyor',()=>{
 for(const id of ['corePosList','corePosStats','coreCashList','coreCashStats'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/ledger-v10\.js/);
 assert.match(html,/ledger-v10\.css/);
 assert.match(app,/tab\(action==='meal'\?'meal':'platforms'\)/);
 assert.match(cardUI,/bankShowAll/);
 assert.match(cardUI,/data-inst-toggle/);
 assert.match(cardUI,/Gizle/);
 assert.match(core,/data-v10-cash-sale/);
 assert.match(core,/data-firm-movement-delete/);
 assert.match(core,/data-v10-account-remove/);
 assert.match(ledgerUI,/window\.openSettlementForm=settlementForm/);
 assert.match(ledgerUI,/window\.openSupplierPurchaseForm=purchaseForm/);
 assert.match(styles,/\.v10-food-history/);
 assert.match(formUI,/window\.openSettlementForm/);
 assert.match(index,/path === '\/api\/settlements'/);
});
