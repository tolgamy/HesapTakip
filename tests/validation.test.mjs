import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { positiveMoney, isoDate, lastFour, monthPeriod, requiredText, readJSON } from '../src/validation.js';
import { createSession, isAuthenticated, secretsReady } from '../src/auth.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env = { APP_PASSWORD:'very-long-test-password', SESSION_SECRET:'12345678901234567890123456789012' };
test('tutar kuruş olarak doğrulanır',()=>{
 assert.equal(positiveMoney(25123),25123);assert.equal(positiveMoney(0,true),0);
 for(const val of [0,-1,NaN,2.3,Infinity,9999999999999999,'20']) assert.throws(()=>positiveMoney(val));
});
test('tarih ve ekstre dönemi doğrulanır',()=>{
 assert.equal(isoDate('2026-11-17'),'2026-11-17');
 for(const d of ['2026-02-30','2026-13-01','20261117','2026-01-00']) assert.throws(()=>isoDate(d));
 assert.equal(monthPeriod('2026-11'),'2026-11');assert.throws(()=>monthPeriod('2026-00'));
});
test('tam kart numarası alınmaz',()=>{
 assert.equal(lastFour('4567'),'4567');assert.equal(lastFour(''),null);
 assert.throws(()=>lastFour('4111111111111111'));assert.throws(()=>lastFour('abcd'));
});
test('metin geçerliliği',()=>{
 assert.equal(requiredText('  Akbank  ','Banka'),'Akbank');assert.throws(()=>requiredText(' ','Banka'));
});
test('JSON beklentisi ve içerik kontrolü',async()=>{
 const req=new Request('https://example.com/api',{method:'POST',headers:{'content-type':'application/json'},body:'{"foo":1}'});
 assert.deepEqual(await readJSON(req),{foo:1});
 await assert.rejects(()=>readJSON(new Request('https://example.com/api',{method:'POST',headers:{'content-type':'application/json'},body:'[]'})));
});
test('V27 kısa ancak en az 8 karakterli admin şifresi; oturum anahtarı en az 32 kalır',()=>{
 assert.equal(secretsReady({...env,APP_PASSWORD:'Abc-1234'}),true);
 assert.equal(secretsReady({...env,APP_PASSWORD:'abc1234'}),false);
 assert.equal(secretsReady({...env,APP_PASSWORD:'Abc-1234',SESSION_SECRET:'1234567890123456789012345678901'}),false);
});
test('oturum imzası doğrulanır',async()=>{
 assert.equal(secretsReady(env),true);
 const cookie=await createSession(env.SESSION_SECRET,Date.now());
 const req=new Request('https://example.com/',{headers:{cookie:cookie.split(';')[0]}});
 assert.equal(await isAuthenticated(req,env),true);
 assert.equal(await isAuthenticated(req,{...env,SESSION_SECRET:'other-secret-123456789012345678901234'}),false);
 const bad=new Request('https://example.com/',{headers:{cookie:cookie.replace('v1.','v9.').split(';')[0]}});
 assert.equal(await isAuthenticated(bad,env),false);
});
