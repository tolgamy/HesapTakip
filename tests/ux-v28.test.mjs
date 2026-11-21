import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {vaultPinSchema,vaultPinRoute,verifyVaultPin} from '../src/vault-pin-v28.js';
import {vaultRoute} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=(path,payload)=>new Request('https://example.test/api/'+path,{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const admin={role:'admin',username:'admin',permissions:['vault']};
const user={role:'user',id:'member-a',permissions:['vault']};

test('V42 card recommendation uses latest closed statement, never limit eligibility',()=>{
 const ctx={window:{},document:{},esc:x=>String(x),showDate:x=>x};
 vm.runInNewContext(read('public/cards-today-v28.js'),ctx);
 const choose=ctx.window.HTCardToday28.recommend;
 const today='2026-11-18';
 const cards=[
  {id:'a',bank:'Banka A',card_type:'credit',statement_day:4,available_limit_kurus:1200000,status:'active'},
  {id:'b',bank:'Banka B',card_type:'credit',statement_day:17,available_limit_kurus:25000,status:'active'},
  {id:'c',bank:'Banka C',card_type:'debit',statement_day:18,available_limit_kurus:10000000,status:'active'},
  {id:'d',bank:'Banka D',card_type:'credit',statement_day:18,available_limit_kurus:null,status:'active'},
  {id:'e',bank:'Banka E',card_type:'credit',statement_day:18,available_limit_kurus:800000,status:'cancelled'}
 ];
 assert.equal(choose(cards,today).id,'b');
 assert.equal(choose(cards,today).available_limit_kurus,25000);
 assert.equal(choose(cards.map(c=>({...c,available_limit_kurus:null})),today).id,'b');
 const endMonth=[{id:'f',statement_day:31,card_type:'credit',available_limit_kurus:1000},
  {id:'g',statement_day:27,card_type:'credit',available_limit_kurus:1000}];
 assert.equal(choose(endMonth,'2026-03-01').id,'f','31 Şubat sonunda clamped to Feb 28');
 assert.equal(choose([{id:'x',card_type:'credit',statement_day:null,
  current_statement_date:'2026-11-16',available_limit_kurus:7000}],today).id,'x');
});
test('V32 retires PIN requirement while keeping the statement card recommendation',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js'),api=read('src/members-v26.js');
 assert.match(html,/id="htCardToday28"/);
 assert.match(html,/id="vaultView"/);
 assert.doesNotMatch(html,/data-v8-accounts="vault"/);
 assert.ok(html.indexOf('data-v8-accounts="platforms"')<html.indexOf('data-v8-accounts="people"'));
 assert.match(html,/data-v67-vault-open/);
 assert.doesNotMatch(html,/id="v28PinRevealForm"|id="v28PinSetupForm"/);
 assert.doesNotMatch(ui,/vault\/pin|v28PinInput|pinConfigured/);
 assert.doesNotMatch(api,/verifyVaultPin/);
 assert.match(ui,/data-v32-password-copy/);
 assert.match(html,/id="v32FieldsEditor"/);
});
