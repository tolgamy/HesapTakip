import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { biometricSchema, biometricRoute } from '../src/biometric-v56.js';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const origin='https://hesaptakip.test';
const cookie='karttakip_session=v2.admin.test.test';
const principal={role:'admin',username:'admin',permissions:[]};
const fake={id:'unknown-key-0001',type:'public-key',response:{clientDataJSON:'e30',authenticatorData:'e30',signature:'e30'}};
class DB {
  constructor(){this.keys=[];this.challenges=new Map();this.session=null;this.pin=null;this.consumeCount=0;}
  prepare(sql){
    const db=this;
    return {
      params:[],
      bind(...p){this.params=p;return this;},
      async all(){
        if(sql.startsWith('SELECT id,public_key,counter,transports'))return {results:db.keys};
        throw Error('Unexpected all '+sql);
      },
      async first(){
        if(sql.startsWith('SELECT salt,pin_hash'))return db.pin;
        if(sql.startsWith('SELECT account_key,locked'))return db.session;
        if(sql.startsWith('SELECT challenge,expires_ms'))return db.challenges.get(this.params[0])||null;
        throw Error('Unexpected first '+sql);
      },
      async run(){
        if(sql.startsWith('INSERT INTO biometric_challenges')){
          const [id,account,kind,challenge,expires_ms]=this.params;
          db.challenges.set(id,{account,kind,challenge,expires_ms});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM biometric_challenges')){
          const [id,account,kind,challenge]=this.params;
          const rec=db.challenges.get(id);
          const ok=rec?.account===account&&rec?.kind===kind&&rec?.challenge===challenge;
          if(ok){db.challenges.delete(id);db.consumeCount++;}
          return {meta:{changes:ok?1:0}};
        }
        throw Error('Unexpected run '+sql);
      }
    };
  }
}
const env=()=>({DB:new DB(), SESSION_SECRET:'0123456789abcdef0123456789abcdef'});
const req=(path,body)=>new Request(origin+'/api/biometric/'+path,{
  method:body===undefined?'GET':'POST',
  headers:{cookie,origin,'content-type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)
});
async function sessionID(e){
  const dig=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.SESSION_SECRET+':'+cookie.slice('karttakip_session='.length)));
  return [...new Uint8Array(dig)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
test('V56 schema is additive and does not touch existing finance tables',()=>{
  const sql=biometricSchema.join('\n');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS biometric_credentials/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS biometric_challenges/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM cards|DELETE FROM payments|ALTER TABLE accounts/i);
});
test('Locked or unconfigured PIN cannot register a new phone',async()=>{
  const e=env();
  await assert.rejects(biometricRoute(req('register/options',{}),e,principal,'/api/biometric/register/options','POST'),{status:423});
  e.DB.pin={salt:'aa',pin_hash:'bb',attempts:0,blocked_until_ms:0};
  e.DB.session={account_key:'admin',locked:1,last_activity_ms:Date.now()};
  await assert.rejects(biometricRoute(req('register/options',{}),e,principal,'/api/biometric/register/options','POST'),{status:423});
});
test('Only a PIN-unlocked session can register and each challenge is one-time use',async()=>{
  const e=env();
  e.DB.pin={salt:'aa',pin_hash:'bb',attempts:0,blocked_until_ms:0};
  e.DB.session={account_key:'admin',locked:0,last_activity_ms:Date.now()};
  const options=await biometricRoute(req('register/options',{}),e,principal,'/api/biometric/register/options','POST');
  assert.equal(options.rp.id,'hesaptakip.test');
  assert.equal(options.authenticatorSelection.authenticatorAttachment,'platform');
  assert.equal(options.authenticatorSelection.userVerification,'required');
  await assert.rejects(biometricRoute(req('register/verify',fake),e,principal,'/api/biometric/register/verify','POST'),{status:401});
  await assert.rejects(biometricRoute(req('register/verify',fake),e,principal,'/api/biometric/register/verify','POST'),{status:401});
  assert.equal(e.DB.consumeCount,1);
});
test('Bad biometric verification cannot unlock an existing PIN-locked session',async()=>{
  const e=env();
  e.DB.pin={salt:'aa',pin_hash:'bb',attempts:0,blocked_until_ms:0};
  e.DB.session={account_key:'admin',locked:1,last_activity_ms:Date.now()};
  e.DB.keys=[{id:'stored-key-12345678',public_key:'AQID',counter:0,transports:'[]'}];
  const options=await biometricRoute(req('auth/options',{}),e,principal,'/api/biometric/auth/options','POST');
  assert.equal(options.rpId,'hesaptakip.test');
  await assert.rejects(biometricRoute(req('auth/verify',fake),e,principal,'/api/biometric/auth/verify','POST'),{status:401});
  assert.equal(e.DB.session.locked,1);
  assert.equal(e.DB.consumeCount,1);
});
test('Biometric status is scoped to the authenticated account and never returns a public key',async()=>{
  const e=env();
  e.DB.keys=[{id:'key-123456789',public_key:'private-looking-value',counter:0,transports:'[]'}];
  const status=await biometricRoute(req('status'),e,principal,'/api/biometric/status','GET');
  assert.deepEqual(status,{enrolled:true,count:1});
  assert.doesNotMatch(JSON.stringify(status),/private-looking-value/);
});
