import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {ApiError,idText,readJSON,isoDate} from '../src/validation.js';
import {correctionStatement} from '../src/corrections.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const begin=source.indexOf('const renewalMatch=path.match(');
const end=source.indexOf('const cardHistoryMatch=path.match(',begin);
assert.ok(begin>=0&&end>begin,'Renewal POST handler must be present');
const renewalHandler=source.slice(begin,end);
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function runRenewal(before,dates){
 const batches=[];
 const DB={
  prepare(sql){
   return {sql,args:[],bind(...args){this.args=args;return this;},
    async first(){return sql.startsWith('SELECT * FROM cards WHERE id=')?before:null;}};
  },
  async batch(commands){
   batches.push(commands);
   return commands.map(()=>({success:true}));
  }
 };
 const request=new Request('https://example.test/api/cards/'+id+'/renew-dates',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dates)
 });
 const context={method:'POST',path:'/api/cards/'+id+'/renew-dates',request,env:{DB},
  idText,ApiError,readJSON,isoDate,crypto:webcrypto,correctionStatement,
  json:record=>record};
 return {result:vm.runInNewContext('(async()=>{'+renewalHandler+'})()',context),batches};
}

test('New Akbank cycle dates save atomically with previous history and correction audit',async()=>{
 const before={id,bank:'Akbank',card_type:'credit',statement_day:18,due_day:23,
  current_statement_date:'2026-11-18',current_due_date:'2026-11-23',
  credit_limit_kurus:1500000,available_limit_kurus:1000000};
 const {result,batches}=runRenewal(before,{statement_date:'2026-12-18',due_date:'2026-12-23'});
 assert.equal((await result).ok,true);
 assert.equal(batches.length,1);
 assert.equal(batches[0].length,3,'history, card update, correction log must be in the same D1 batch');
 const [history,updated,audit]=batches[0];
 assert.match(history.sql,/INSERT INTO card_date_history/);
 assert.deepEqual(history.args.slice(1),[id,'2026-11-18','2026-11-23']);
 assert.match(updated.sql,/UPDATE cards SET current_statement_date/);
 assert.deepEqual(updated.args,['2026-12-18','2026-12-23',18,23,id]);
 assert.match(audit.sql,/INSERT INTO correction_log/);
 const beforeSnapshot=JSON.parse(audit.args[3]),afterSnapshot=JSON.parse(audit.args[4]);
 assert.equal(beforeSnapshot.current_statement_date,'2026-11-18');
 assert.equal(afterSnapshot.current_statement_date,'2026-12-18');
 assert.equal(afterSnapshot.current_due_date,'2026-12-23');
 assert.equal(afterSnapshot.credit_limit_kurus,before.credit_limit_kurus);
 assert.equal(afterSnapshot.available_limit_kurus,before.available_limit_kurus);
});

test('First cycle creates no fake history but still persists dates and audit',async()=>{
 const before={id,bank:'Akbank',card_type:'credit',current_statement_date:null,current_due_date:null};
 const {result,batches}=runRenewal(before,{statement_date:'2026-12-18',due_date:'2026-12-23'});
 assert.equal((await result).ok,true);
 assert.equal(batches.length,1);
 assert.equal(batches[0].length,2);
 assert.match(batches[0][0].sql,/UPDATE cards/);
 assert.match(batches[0][1].sql,/INSERT INTO correction_log/);
});

test('Rejected cycle dates never write card data or history',async()=>{
 const before={id,bank:'Akbank',card_type:'credit',current_statement_date:'2026-11-18',current_due_date:'2026-11-23'};
 for(const dates of [
  {statement_date:'2026-11-18',due_date:'2026-12-23'},
  {statement_date:'2026-12-18',due_date:'2026-12-17'},
  {statement_date:'2026-12-32',due_date:'2027-01-02'}
 ]){
  const {result,batches}=runRenewal(before,dates);
  await assert.rejects(result,error=>error instanceof ApiError&&error.status>=400&&error.status<500);
  assert.equal(batches.length,0);
 }
});
