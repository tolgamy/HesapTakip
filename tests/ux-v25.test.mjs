import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initializeFirmGroups,firmRoute} from '../src/firms.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ID='10000000-0000-4000-8000-000000000001';

test('Para tutarını tamamen seçmeden rakamın üstüne yazabiliriz',()=>{
 const callbacks={};
 class Input {
  constructor(value=''){
   this.name='amount';this.type='number';this.value=value;this.disabled=false;
   this.readOnly=false;this.dataset={};this.classList={add(){}};
   this.parentElement=null;this.selectionStart=0;this.selectionEnd=0;
   this.selected=false;
  }
  setAttribute(){}
  select(){this.selected=true;}
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 }
 const ctx={window:{},HTMLInputElement:Input,
  document:{addEventListener(name,handler){callbacks[name]=handler;}}};
 vm.runInNewContext(read('public/currency-v20.js'),ctx);
 const input=new Input('1050.00');
 callbacks.focusin({target:input});
 assert.equal(input.value,'1.050,00');
 assert.equal(input.selected,false,'existing amount must not be entirely selected');
 input.value='2.050,00'; input.selectionStart=1;
 callbacks.input({target:input});
 assert.equal(input.value,'2.050,00');
 assert.equal(input.selectionStart,1);
 // Changing another digit does not move the insertion point to the end.
 input.value='2.060,00';input.selectionStart=4;
 callbacks.input({target:input});
 assert.equal(input.value,'2.060,00');
 assert.equal(input.selectionStart,4);
 assert.equal(ctx.window.HTCurrency20.formatDigits('205000'),'2.050,00');
});

const institutions=[
 {id:'yapikredi',name:'Yapı Kredi',type:'bank',is_active:1},
 {id:'qnb',name:'QNB',type:'bank',is_active:1},
 {id:'enpara',name:'Enpara',type:'bank',is_active:1},
 {id:'paytr',name:'PayTR',type:'payment',is_active:1}
];
const esc=x=>String(x);
test('Cari Hesap Düzenle: Bankalar ve POS Bankalar ayrı, Yapı Kredi POS kayıtlı kalır',()=>{
 const source=read('public/firms.js');
 const start=source.indexOf('function payoutSelect('),stop=source.indexOf('function firmLabel(',start);
 assert.ok(start>=0&&stop>start);
 const ctx={state:{institutions},esc,window:{}};
 vm.runInNewContext(source.slice(start,stop)+'\nthis.choose=payoutSelect;',ctx);
 const selected=ctx.choose('yapikredi',true);
 assert.match(selected,/<optgroup label="Bankalar">/);
 assert.match(selected,/<optgroup label="POS Bankalar">/);
 assert.match(selected,/<option value="yapikredi">Yapı Kredi<\/option>/);
 assert.match(selected,/<option value="pos:yapikredi" selected>Yapı Kredi POS<\/option>/);
 assert.match(selected,/QNB POS/);
 assert.match(selected,/Enpara POS/);
 assert.match(selected,/PayTR POS/);
 const normal=ctx.choose('yapikredi',false);
 assert.match(normal,/<option value="yapikredi" selected>Yapı Kredi<\/option>/);
 assert.match(source,/payout_is_pos:\(d\.payout_choice\|\|''\)\.startsWith\('pos:'\)/);
});

test('Banka hesabı Ekle/Düzenle: bank and POS group keep distinct option values',()=>{
 const src=read('public/finance-suite.js');
 const start=src.indexOf('function bankInstitutionSelect(');
 const end=src.indexOf('window.HTBankInstitutionSelect',start);
 assert.ok(start>=0&&end>start);
 const ctx={state:{institutions},esc,window:{}};
 vm.runInNewContext(src.slice(start,end)+'\nthis.choose=bankInstitutionSelect;',ctx);
 const selected=ctx.choose('yapikredi',true);
 assert.match(selected,/<optgroup label="Bankalar">/);
 assert.match(selected,/<optgroup label="POS Bankalar">/);
 assert.match(selected,/<option value="yapikredi">Yapı Kredi<\/option>/);
 assert.match(selected,/<option value="pos:yapikredi" selected>Yapı Kredi POS<\/option>/);
 assert.match(src,/d\.institution_id\|\|''\)\.replace\(\/\^pos:\/,''\)/);
 assert.match(read('public/ledger-v10.js'),/HTBankInstitutionSelect\(account\.institution_id\|\|'',Number\(account\.is_pos\)===1\)/);
});

test('Cari POS seçimi D1 tablosuna yalnız yeni sütun ekler',async()=>{
 const sql=[];
 const env={DB:{prepare(statement){
  sql.push(statement);
  return {async all(){return {results:[{name:'name'},{name:'id'}]};},
   async run(){return {meta:{changes:1}};}};
 }}};
 await initializeFirmGroups(env);
 assert.ok(sql.some(x=>x.includes('ALTER TABLE firms ADD COLUMN payout_is_pos')));
 assert.ok(sql.every(x=>!/DELETE FROM|UPDATE firm_movements|DROP TABLE/i.test(x)));
});

test('Yeni POS cari hesabında banka ID aynı kalır ve POS seçimi ayrıca saklanır',async()=>{
 const history=[];
 const env={DB:{prepare(sql){
  const q={sql,args:[]};history.push(q);
  return {bind(...args){q.args=args;return this;},
   async first(){return {id:'yapikredi'};},
   async run(){return {meta:{changes:1}};}};
 }}};
 const request=new Request('https://example.test/api/firms',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'POS Tahsilatı',category:'receivable',
   receivable_group:'pos',payout_institution_id:'yapikredi',payout_is_pos:true})
 });
 const res=await firmRoute(request,env,'/api/firms','POST');
 assert.equal(res.ok,true);
 const insert=history.find(q=>q.sql.startsWith('INSERT INTO firms('));
 assert.match(insert.sql,/payout_institution_id,payout_is_pos/);
 assert.equal(insert.args.at(-3),'yapikredi');
 assert.equal(insert.args.at(-2),1);
 assert.ok(history.every(x=>!x.sql.includes('UPDATE firm_movements')));
});

test('POS seçimi başka bir form ile isim değiştirildiğinde korunur',async()=>{
 const history=[];
 const env={DB:{prepare(sql){
  const q={sql,args:[]};history.push(q);
  return {bind(...args){q.args=args;return this;},
   async first(){
    if(sql.includes('FROM firms WHERE id='))return {
     id:ID,category:'receivable',receivable_group:'pos',
     payout_institution_id:'yapikredi',payout_is_pos:1,logo_data:''};
    if(sql.includes('FROM institutions WHERE'))return{id:'yapikredi'};
    return null;
   },
   async run(){return {meta:{changes:1}};}};
 }}};
 const request=new Request('https://example.test/api/firms/'+ID,{
  method:'PATCH',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'Yeni cari isim',category:'receivable',
   receivable_group:'pos',payout_institution_id:'yapikredi'})
 });
 const response=await firmRoute(request,env,'/api/firms/'+ID,'PATCH');
 assert.equal(response.ok,true);
 const update=history.find(q=>q.sql.startsWith('UPDATE firms SET'));
 assert.match(update.sql,/payout_is_pos/);
 assert.equal(update.args.at(-3),1);
});
