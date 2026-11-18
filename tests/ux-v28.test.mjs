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

test('V28 card recommendation picks latest closed statement with known available limit',()=>{
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
 assert.equal(choose(cards.map(c=>({...c,available_limit_kurus:null})),today),null);
 const endMonth=[{id:'f',statement_day:31,card_type:'credit',available_limit_kurus:1000},
  {id:'g',statement_day:27,card_type:'credit',available_limit_kurus:1000}];
 assert.equal(choose(endMonth,'2026-03-01').id,'f','31 Şubat sonunda clamped to Feb 28');
 assert.equal(choose([{id:'x',card_type:'credit',statement_day:null,
  current_statement_date:'2026-11-16',available_limit_kurus:7000}],today).id,'x');
});
test('V28 PIN schema never modifies existing financial transactions',()=>{
 const sql=vaultPinSchema.join(' ');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vault_pin_settings/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vault_pin_attempts/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM (?:cards|firm_movements|cash_entries)/);
 assert.match(read('src/index.js'),/\.\.\.vaultPinSchema/);
});
test('V28 four-digit PIN required for reveal, rate limited, only admin can set',async()=>{
 let stored=null;
 const attempts=new Map(),credentials=new Map();
 const db={prepare(sql){
  const q={args:[],bind(...a){this.args=a;return this;},
   async first(){
    if(sql.includes('FROM vault_pin_settings'))return stored;
    if(sql.includes('FROM vault_pin_attempts'))return attempts.get(q.args[0])||null;
    if(sql.includes('FROM vault_credentials'))return credentials.get(q.args[0])||null;
    return null;
   },
   async run(){
    if(sql.startsWith('INSERT INTO vault_pin_settings'))stored={salt:q.args[0],pin_hash:q.args[1]};
    if(sql.startsWith('INSERT INTO vault_pin_attempts'))attempts.set(q.args[0],{
     attempts:q.args[1],blocked_until_ms:q.args[2],last_seen_ms:q.args[3]});
    if(sql==='DELETE FROM vault_pin_attempts')attempts.clear();
    if(sql.startsWith('DELETE FROM vault_pin_attempts WHERE'))attempts.delete(q.args[0]);
    return {meta:{changes:1}};
   }};
  return q;
 }};
 const env={DB:db,SESSION_SECRET:'a-long-test-signing-secret-with-more-than-32',
  VAULT_ENCRYPTION_KEY:'a-private-independent-key-with-more-than-32'};
 assert.deepEqual(await vaultPinRoute(new Request('https://example.test/api/vault/pin'),env,'GET',admin),{configured:false});
 await assert.rejects(()=>vaultPinRoute(request('vault/pin',{pin:'1234'}),env,'POST',user),{status:403});
 await assert.rejects(()=>vaultPinRoute(request('vault/pin',{pin:'12ab'}),env,'POST',admin),{status:400});
 await vaultPinRoute(request('vault/pin',{pin:'4827'}),env,'POST',admin);
 assert.notEqual(stored.pin_hash,'4827');
 assert.equal(stored.salt.length,32);
 await assert.rejects(()=>verifyVaultPin(request('vault/test',{}),env,user,'0000'),{status:403});
 await verifyVaultPin(request('vault/test',{}),env,user,'4827');
 // Reveal still needs PIN even with an approved vault permission.
 const id='11111111-1111-4111-8111-111111111111';
 credentials.set(id,{secret_cipher:'',secret_iv:''});
 await assert.rejects(()=>vaultRoute(request('vault/'+id+'/reveal',{}),env,'/api/vault/'+id+'/reveal','POST',user),{status:400});
 const result=await vaultRoute(request('vault/'+id+'/reveal',{pin:'4827'}),env,'/api/vault/'+id+'/reveal','POST',user);
 assert.equal(result.password,'');
 await assert.rejects(()=>vaultPinRoute(request('vault/pin',{pin:'0000',old_pin:'1234'}),env,'POST',admin),{status:403});
 await vaultPinRoute(request('vault/pin',{pin:'8103',old_pin:'4827'}),env,'POST',admin);
 await assert.rejects(()=>verifyVaultPin(request('vault/test',{}),env,user,'4827'),{status:403});
 await verifyVaultPin(request('vault/test',{}),env,user,'8103');
 for(let i=0;i<5;i++){
  const status=i===4?429:403;
  await assert.rejects(()=>verifyVaultPin(request('vault/test',{}),env,user,'9999'),{status});
 }
 await assert.rejects(()=>verifyVaultPin(request('vault/test',{}),env,user,'8103'),{status:429});
});
test('V28 account tabs and copy/reveal controls require PIN',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js');
 assert.match(html,/id="htCardToday28"/);
 assert.match(html,/id="v28PinRevealForm"/);
 assert.match(html,/data-v8-accounts="vault"/);
 assert.ok(html.indexOf('data-v8-accounts="vault"')<html.indexOf('data-v8-accounts="people"'));
 assert.match(ui,/data-v28-copy/);
 assert.match(ui,/api\('vault\/pin'/);
 assert.match(ui,/await api\('vault\/'\+data\.credential_id\+'\/reveal','POST',\{pin:data\.pin\}\)/);
 assert.match(read('src/members-v26.js'),/await verifyVaultPin\(request,env,principal,d\.pin\)/);
});
