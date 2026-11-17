import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { accountBalance, cashSummary, financeSchema } from '../src/finance.js';
import { createSession, getSessionRole, isAuthenticated } from '../src/auth.js';
import { istanbulDate, daysUntil, allocateFirmDues } from '../src/scheduler.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env={APP_PASSWORD:'example-admin-long-password',SESSION_SECRET:'test-signing-secret-minimum-32-chars-value'};

test('kasa ve banka hareketleri kuruş bazında hesaplanır',()=>{
 const a={id:'first',opening_kurus:200000};
 const entries=[{account_id:'first',direction:'in',amount_kurus:50000,category:'income'},
   {account_id:'first',direction:'out',amount_kurus:80000,category:'expense'},
   {account_id:'second',direction:'out',amount_kurus:99000,category:'expense'}];
 assert.equal(accountBalance(a,entries),170000);
 assert.deepEqual(cashSummary(entries),{income:50000,expense:179000});
});
test('schema yalnızca yeni tablolar ekler, verileri silmez',()=>{
 assert.ok(financeSchema.length>=6);
 for(const s of financeSchema){assert.match(s,/IF NOT EXISTS/i);assert.doesNotMatch(s,/^\s*(?:DROP|TRUNCATE|DELETE)\b/i);}
});
test('İstanbul takvim günü ve uyarı vadeleri',()=>{
 assert.equal(istanbulDate(new Date('2026-11-17T21:30:00Z')),'2026-11-18');
 assert.equal(daysUntil('2026-11-18','2026-11-17'),1);
 assert.equal(daysUntil('2026-11-16','2026-11-17'),-1);
});
test('firma kısmi tahsilat FIFO ve kuruş doğruluğu',()=>{
 const charges=[{id:'a',firm_id:'f',on_date:'2026-11-01',amount_kurus:500000,due_date:'2026-11-20'},
 {id:'b',firm_id:'f',on_date:'2026-11-04',amount_kurus:300000,due_date:'2026-11-25'}];
 const paid=[{firm_id:'f',amount_kurus:600000}];
 const xs=allocateFirmDues(charges,paid);
 assert.deepEqual(xs.map(x=>x.remaining_kurus),[0,200000]);
});
test('yeni roller imzalanır, eski v1 yönetici oturumu çalışır',async()=>{
 for(const role of ['admin','staff','viewer']){
   const cookie=await createSession(env.SESSION_SECRET,Date.now(),role);
   const request=new Request('https://example.com',{headers:{cookie:cookie.split(';')[0]}});
   assert.equal(await getSessionRole(request,env),role);
   assert.equal(await isAuthenticated(request,env),true);
 }
 const legacy=await createSession(env.SESSION_SECRET);
 const legacyReq=new Request('https://example.com',{headers:{cookie:legacy.split(';')[0]}});
 assert.equal(await getSessionRole(legacyReq,env),'admin');
 assert.equal(await getSessionRole(legacyReq,{...env,SESSION_SECRET:'another-secret-longer-than-32-characters'}),null);
});
