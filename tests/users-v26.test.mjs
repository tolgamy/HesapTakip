import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {memberSchema,memberPermissions,visibleFirm,registerMember,loginMember,
 getIdentity,membersRoute,vaultRoute} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const req=(path,body)=>new Request('https://example.test/api/'+path,{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify(body)
});
const admin={role:'admin',username:'admin',permissions:memberPermissions};
test('V26 adds identity and encrypted vault tables without modifying existing balances',()=>{
 const sql=memberSchema.join(' ');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS app_members/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vault_credentials/);
 assert.match(sql,/session_version INTEGER/);
 assert.doesNotMatch(sql,/DROP TABLE|UPDATE firm_movements|DELETE FROM cash_entries/);
 assert.match(read('src/index.js'),/\.\.\.memberSchema/);
});
test('registration stays pending, admin grants per-screen roles, changes revoke sessions',async()=>{
 const people=new Map();
 const db={prepare(sql){
  const q={args:[],bind(...args){this.args=args;return this;},
   async first(){
    if(sql.includes('member_signup_limits'))return null;
    if(sql.includes('login_attempts'))return null;
    if(sql.includes('WHERE username=?'))return [...people.values()].find(x=>x.username===q.args[0])||null;
    if(sql.includes('WHERE id=?'))return people.get(q.args[0])||null;
    return null;
   },
   async all(){return {results:[...people.values()]};},
   async run(){
    if(sql.startsWith('INSERT INTO app_members')){
     const [id,username,display_name,salt,password_hash,status,permissions]=q.args;
     people.set(id,{id,username,display_name,salt,password_hash,status,permissions,session_version:0});
    }
    if(sql.startsWith('UPDATE app_members')){
     const [status,permissions,id]=q.args;
     const row=people.get(id);row.status=status;row.permissions=permissions;row.session_version++;
    }
    return {meta:{changes:1}};
   }};
  return q;
 }};
 const env={DB:db,SESSION_SECRET:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZsecret-secret'};
 const registration=await registerMember(req('register',{username:'ayse',display_name:'Ayşe Yılmaz',password:'GücluSifre-2026!'}),env);
 assert.equal(registration.ok,true);
 const person=[...people.values()][0];
 assert.equal(person.status,'pending');
 assert.notEqual(person.password_hash,'GücluSifre-2026!');
 assert.equal(person.salt.length,32);
 await assert.rejects(()=>loginMember(req('login',{username:'ayse',password:'GücluSifre-2026!'}),env),{status:403});
 await membersRoute(req('users/'+person.id,{status:'approved',permissions:['vault','people']}),env,'/api/users/'+person.id,'PATCH',admin);
 const cookie=await loginMember(req('login',{username:'ayse',password:'GücluSifre-2026!'}),env);
 const session=new Request('https://example.test/api/session',{headers:{Cookie:cookie.split(';')[0]}});
 const identity=await getIdentity(session,env);
 assert.equal(identity.role,'user');
 assert.deepEqual(identity.permissions,['vault','people']);
 await membersRoute(req('users/'+person.id,{status:'blocked',permissions:[]}),env,'/api/users/'+person.id,'PATCH',admin);
 assert.equal(await getIdentity(session,env),null);
});
test('visibleFirm never sends another permission group records',()=>{
 assert.equal(visibleFirm({category:'payable'},['people']),false);
 assert.equal(visibleFirm({category:'payable'},['payables']),true);
 assert.equal(visibleFirm({category:'receivable',receivable_group:'platform'},['platforms']),true);
 assert.equal(visibleFirm({category:'receivable',receivable_group:'meal'},['people']),false);
 assert.equal(visibleFirm({category:'receivable',receivable_group:'pos'},['banking']),true);
});
test('vault encrypts passwords, hides ciphertext from list and authorizes reveals',async()=>{
 const rows=new Map();
 const db={async batch(statements){for(const item of statements)await item.run();},prepare(sql){
  const q={args:[],bind(...a){this.args=a;return this;},
   async run(){
    if(sql.startsWith('INSERT INTO vault_credentials')){
     const [id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv]=q.args;
     rows.set(id,{id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv});
    }
    return {meta:{changes:1}};
   },
   async all(){return {results:sql.includes('vault_custom_fields')?[]:[...rows.values()]};},
   async first(){return rows.get(q.args[0])||null;}
  };
  return q;
 }};
 const env={DB:db,VAULT_ENCRYPTION_KEY:'test-ONLY-a-random-looking-secret-key-for-AES-GCM'};
 const saved=await vaultRoute(req('vault',{category:'bank_pos',institution_name:'Yapı Kredi POS',
  login_name:'magaza',login_url:'https://example.test/login',notes:'POS',password:'password-123'}),env,'/api/vault','POST',admin);
 const cipher=[...rows.values()][0].secret_cipher;
 assert.ok(cipher&&!cipher.includes('password-123'));
 const user={role:'user',permissions:['vault']};
 const listing=await vaultRoute(new Request('https://example.test/api/vault'),env,'/api/vault','GET',user);
 assert.equal(listing.vault.length,1);
 assert.equal(listing.vault[0].has_password,true);
 assert.equal('secret_cipher' in listing.vault[0],false);
 const revealed=await vaultRoute(req('vault/'+saved.id+'/reveal',{}),env,'/api/vault/'+saved.id+'/reveal','POST',user);
 assert.equal(revealed.password,'password-123');
 await assert.rejects(()=>vaultRoute(req('vault/'+saved.id+'/reveal',{}),env,'/api/vault/'+saved.id+'/reveal','POST',{role:'user',permissions:['people']}),{status:403});
 await assert.rejects(()=>vaultRoute(req('vault',{category:'platform',institution_name:'X'}),env,'/api/vault','POST',user),{status:403});
});
test('front end groups Banka POS and payment organizations separately',()=>{
 const catalog=read('public/ux-v19.js');
 const html=read('public/index.html'),js=read('public/users-v26.js');
 assert.match(catalog,/<option value="bank_pos">Banka POS<\/option>/);
 assert.match(catalog,/<option value="payment">Ödeme kuruluşları<\/option>/);
 assert.doesNotMatch(html,/data-v8-accounts="vault"/);
 assert.match(html,/id="vaultView"/);
 assert.ok(html.indexOf('data-v8-accounts="platforms"')<html.indexOf('data-v8-accounts="people"'));
 assert.match(html,/data-v68-open-users/);
 assert.match(html,/id="v26VaultPanel"/);
 assert.doesNotMatch(html,/nav-link v26-direct/);
 const nav=read('public/navigation-v18.js');
 assert.match(nav,/firms:\['payables','directory'\]/);
 assert.match(nav,/settings:\['settings','vault','useraccounts','bills'\]/);
 assert.doesNotMatch(nav,/\['vault','firms'\]/);
 assert.match(html,/id="v26RegisterForm"/);
 assert.match(js,/data-v26-user/);
 assert.match(read('src/index.js'),/if\(role==='user'\)/);
 assert.match(read('src/index.js'),/if\(method!=='GET'\)/);
});
