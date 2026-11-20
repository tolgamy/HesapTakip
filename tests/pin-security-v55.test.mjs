import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { pinStatus, pinRoute, primePinSession, assertPinUnlocked, PIN_IDLE_MS } from '../src/pin-security.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class MemoryDB {
  constructor() { this.credentials=new Map(); this.sessions=new Map(); this.recoveries=new Map(); }
  prepare(sql) {
    const db=this;
    return {
      args:[],
      bind(...args){this.args=args;return this;},
      async first(){
        const [x]=this.args;
        if (sql.startsWith('SELECT salt,pin_hash')) return db.credentials.get(x)||null;
        if (sql.startsWith('SELECT account_key,locked')) return db.sessions.get(x)||null;
        if (sql.startsWith('SELECT attempts,blocked_until_ms FROM pin_recovery_limits')) return db.recoveries.get(x)||null;
        throw Error('Unexpected SELECT: '+sql);
      },
      async run(){
        const a=this.args;
        if (sql.startsWith('INSERT INTO pin_sessions')) {
          const [id,account,now]=a, old=db.sessions.get(id)||{};
          const locked=sql.includes('VALUES(?,?,1,?)')?1:0;
          db.sessions.set(id,{...old,account_key:account,locked,last_activity_ms:sql.includes('DO UPDATE SET locked=1')?(old.last_activity_ms||now):now});
        } else if (sql.startsWith('DELETE FROM pin_sessions')) {
          for(const [id,s] of db.sessions) if(s.last_activity_ms<a[0])db.sessions.delete(id);
        } else if (sql.startsWith('UPDATE pin_sessions SET last_activity_ms')) {
          const s=db.sessions.get(a[1]);if(s&&s.account_key===a[2]&&!s.locked)s.last_activity_ms=a[0];
        } else if (sql.startsWith('UPDATE pin_sessions SET locked=1')) {
          for(const [id,s] of db.sessions)if(s.account_key===a[0]&&id!==a[1])s.locked=1;
        } else if (sql.startsWith('INSERT INTO pin_credentials')) {
          db.credentials.set(a[0],{salt:a[1],pin_hash:a[2],attempts:0,blocked_until_ms:0});
        } else if (sql.startsWith('UPDATE pin_credentials SET attempts=?,blocked_until_ms=?')) {
          Object.assign(db.credentials.get(a[2]),{attempts:a[0],blocked_until_ms:a[1]});
        } else if (sql.startsWith('UPDATE pin_credentials SET attempts=0')) {
          Object.assign(db.credentials.get(a[0]),{attempts:0,blocked_until_ms:0});
        } else if (sql.startsWith('INSERT INTO pin_recovery_limits')) {
          db.recoveries.set(a[0],{attempts:a[1],blocked_until_ms:a[2]});
        } else if (sql.startsWith('DELETE FROM pin_recovery_limits')) {
          db.recoveries.delete(a[0]);
        } else if (sql.startsWith('DELETE FROM biometric_credentials') || sql.startsWith('DELETE FROM biometric_challenges')) {
          // V56: reset revokes mobile passkeys; PIN tests model no credentials.
        } else throw Error('Unexpected SQL: '+sql);
        return {meta:{changes:1}};
      }
    };
  }
}
function makeEnv(){return {DB:new MemoryDB(),APP_PASSWORD:'a-long-sample-admin-password',SESSION_SECRET:'0123456789abcdef0123456789abcdef0123456789'};}
const principal={role:'admin',username:'admin',permissions:[]};
const cookie='karttakip_session=v2.admin.1999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.1111111111111111111111111111111111111111111111111111111111111111';
function req(path,body){
  return new Request('https://app.example/api/pin/'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json',origin:'https://app.example'},body:body?JSON.stringify(body):undefined});
}
test('PIN setup protects existing cookie before sensitive financial APIs can be used',async()=>{
  const env=makeEnv();
  await primePinSession(cookie+'; Path=/; HttpOnly; Secure',env);
  assert.deepEqual(await pinStatus(req('status'),env,principal),{configured:false,locked:true});
  await assert.rejects(assertPinUnlocked(req('status'),env,principal),{status:423});
  await assert.rejects(pinRoute(req('setup',{password:'wrong',pin:'286531'}),env,principal,'/api/pin/setup','POST'),{status:401});
  await pinRoute(req('setup',{password:env.APP_PASSWORD,pin:'286531'}),env,principal,'/api/pin/setup','POST');
  assert.deepEqual(await pinStatus(req('status'),env,principal),{configured:true,locked:false});
  await assertPinUnlocked(req('status'),env,principal);
  await pinRoute(req('lock',{}),env,principal,'/api/pin/lock','POST');
  assert.equal((await pinStatus(req('status'),env,principal)).locked,true);
  await assert.rejects(assertPinUnlocked(req('status'),env,principal),{status:423});
  await pinRoute(req('unlock',{pin:'286531'}),env,principal,'/api/pin/unlock','POST');
  assert.equal((await pinStatus(req('status'),env,principal)).locked,false);
});
test('PIN expiry blocks touch and all finance access; unlock restores session',async()=>{
  const env=makeEnv();
  await primePinSession(cookie+'; Path=/',env);
  await pinRoute(req('setup',{password:env.APP_PASSWORD,pin:'286531'}),env,principal,'/api/pin/setup','POST');
  for(const row of env.DB.sessions.values())row.last_activity_ms=Date.now()-PIN_IDLE_MS-1;
  assert.equal((await pinStatus(req('status'),env,principal)).locked,true);
  await assert.rejects(pinRoute(req('touch',{}),env,principal,'/api/pin/touch','POST'),{status:423});
  await pinRoute(req('unlock',{pin:'286531'}),env,principal,'/api/pin/unlock','POST');
  await pinRoute(req('touch',{}),env,principal,'/api/pin/touch','POST');
  assert.equal((await pinStatus(req('status'),env,principal)).locked,false);
});
test('five wrong PIN entries impose a 15-minute account-level block',async()=>{
  const env=makeEnv();
  await primePinSession(cookie+'; Path=/',env);
  await pinRoute(req('setup',{password:env.APP_PASSWORD,pin:'286531'}),env,principal,'/api/pin/setup','POST');
  await pinRoute(req('lock',{}),env,principal,'/api/pin/lock','POST');
  for(let i=0;i<5;i++)await assert.rejects(pinRoute(req('unlock',{pin:'999999'}),env,principal,'/api/pin/unlock','POST'));
  assert.ok(env.DB.credentials.get('admin').blocked_until_ms>Date.now());
  await assert.rejects(pinRoute(req('unlock',{pin:'286531'}),env,principal,'/api/pin/unlock','POST'),{status:429});
  await pinRoute(req('reset',{password:env.APP_PASSWORD,new_pin:'739125'}),env,principal,'/api/pin/reset','POST');
  assert.equal((await pinStatus(req('status'),env,principal)).locked,false);
});
