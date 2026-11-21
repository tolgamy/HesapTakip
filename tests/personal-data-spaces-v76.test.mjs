import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableTenantSlots,assertDataSpace,isTenantSlot,routeTenantEnvironment,tenantSchema} from '../src/tenant-routing-v76.js';
import {memberSchema} from '../src/members-v26.js';
import {ApiError} from '../src/validation.js';

const code=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function db(storage={space:null}){
 return {storage,
  prepare(query){
   let value='';
   return {
    bind(...params){value=params[0];return this;},
    async run(){
     if(/INSERT OR IGNORE INTO ht_data_space_guard/.test(query)&&!storage.space)storage.space=value;
     return {success:true};
    },
    async first(){
     if(/SELECT space_key FROM ht_data_space_guard/.test(query))
      return storage.space?{space_key:storage.space}:null;
     throw Error('Unexpected database read in isolation test');
    }
   };
  }
 };
}
test('Only explicitly bound, numbered personal D1 bindings are selectable',()=>{
 assert.equal(isTenantSlot('TENANT_DB_1'),true);
 assert.equal(isTenantSlot('TENANT_DB_20'),true);
 for(const key of ['DB','TENANT_DB_0','TENANT_DB_21','TENANT_DB_1;DROP TABLE cards','TENANT_DB__proto__']){
  assert.equal(isTenantSlot(key),false,key);
 }
 const owner=db(),first=db();
 const env={DB:owner,TENANT_DB_1:first,NOT_TENANT_DB:db()};
 assert.deepEqual(availableTenantSlots(env),['TENANT_DB_1']);
 assert.match(tenantSchema[0],/member_id TEXT PRIMARY KEY/);
 assert.match(memberSchema.join(' '),/app_member_tenants/);
});

test('An approved personal user only accesses the dedicated private D1 binding',async()=>{
 const owner=db(),alice=db(),bob=db();
 const env={DB:owner,TENANT_DB_1:alice,TENANT_DB_2:bob,SECRET:'non-sensitive-fixture'};
 await assertDataSpace(owner,'owner');
 const aa=await routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_1',id:'alice'});
 const bb=await routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_2',id:'bob'});
 assert.equal(aa.DB,alice);assert.equal(bb.DB,bob);
 assert.notEqual(aa.DB,bb.DB);
 assert.equal(aa.SECRET,env.SECRET);
 assert.equal(alice.storage.space,'tenant:TENANT_DB_1');
 assert.equal(bob.storage.space,'tenant:TENANT_DB_2');
 assert.equal(owner.storage.space,'owner');
 assert.equal((await routeTenantEnvironment(env,{role:'admin'})).DB,owner);
});

test('Unassigned accounts and missing bindings fail closed rather than falling back to owner data',async()=>{
 const owner=db(),env={DB:owner};
 for(const identity of [
  {role:'user'},{role:'tenant',tenant_slot:'DB'},
  {role:'tenant',tenant_slot:'TENANT_DB_1'},{role:'tenant',tenant_slot:'TENANT_DB_999'}
 ]){
  await assert.rejects(()=>routeTenantEnvironment(env,identity),ApiError);
 }
 assert.equal(owner.storage.space,null);
});

test('Accidentally pointing two tenant bindings at the same D1 database cannot expose records',async()=>{
 const shared={space:null};
 const env={DB:db(),TENANT_DB_1:db(shared),TENANT_DB_2:db(shared)};
 await assertDataSpace(env.DB,'owner');
 await routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_1'});
 await assert.rejects(
  ()=>routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_2'}),
  /Veri alanı karışıklığı/);
 assert.equal(shared.space,'tenant:TENANT_DB_1');
});
test('Owner DB cannot be assigned as a tenant database, including alias bindings',async()=>{
 const original=db(),sameUnderlying={space:'owner'};
 const env={DB:original,TENANT_DB_1:original,TENANT_DB_2:db(sameUnderlying)};
 await assert.rejects(
  ()=>routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_1'}),/ana veritabanıyla aynı olamaz/);
 await assert.rejects(
  ()=>routeTenantEnvironment(env,{role:'tenant',tenant_slot:'TENANT_DB_2'}),/Veri alanı karışıklığı/);
});
test('Financial endpoints route only after membership and PIN are authenticated',()=>{
 const server=code('src/index.js');
 const member=code('src/members-v26.js');
 const client=code('public/users-v26.js');
 assert.ok(server.indexOf('await assertPinUnlocked(request,env,principal)')<
   server.indexOf('env=await routeTenantEnvironment(env,principal)'));
 assert.ok(server.indexOf('routeTenantEnvironment(env,principal)')<
   server.indexOf("if (path === '/api/data' && method === 'GET')"));
 assert.match(server,/if\(principal\.role==='user'\)\s+throw new ApiError\(403/);
 assert.match(member,/SELECT tenant_slot FROM app_member_tenants WHERE member_id=\?/);
 assert.match(tenantSchema.join(' '),/tenant_slot TEXT NOT NULL UNIQUE/);
 assert.match(member,/Atanmış kişisel veri alanı değiştirilemez/);
 assert.match(client,/name="tenant_slot"/);
 assert.match(client,/availableSlots/);
 assert.match(code('public/app.js'),/session\.role==='tenant'\?'admin'/);
 assert.match(code('public/users-v26.js'),/const admin=\(\)=>window\.HTIdentity\?\.role==='admin'/);
});
