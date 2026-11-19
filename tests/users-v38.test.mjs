import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {registerMember,loginMember,getIdentity,membersRoute,memberPermissions} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin={role:'admin',username:'admin',permissions:memberPermissions};
const user={role:'user',username:'normal',permissions:[]};
const request=(method,path,body,options={})=>new Request('https://example.test/api/'+path,{
 method,headers:{...(body?{'Content-Type':'application/json'}:{}),
 'cf-connecting-ip':options.ip||'203.0.113.12',...(options.cookie?{Cookie:options.cookie}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
const post=(path,body,options)=>request('POST',path,body,options);
const env=create=>{
 const people=new Map(),limits=new Map(),logins=new Map(),ledger={amount_kurus:7890123};
 const db={prepare(sql){const q={args:[],bind(...args){this.args=args;return this;},
  async first(){
   if(sql.includes('member_signup_limits'))return limits.get(q.args[0])||null;
   if(sql.includes('FROM login_attempts'))return logins.get(q.args[0])||null;
   if(sql.includes('FROM app_members WHERE username=?'))
    return [...people.values()].find(p=>p.username===q.args[0])||null;
   if(sql.includes('FROM app_members WHERE id=?'))return people.get(q.args[0])||null;
   return null;
  },
  async all(){if(sql.includes('FROM app_members'))return {results:[...people.values()]};
   return {results:[]};
  },
  async run(){
   const a=q.args;
   if(sql.startsWith('INSERT INTO member_signup_limits')){
    const existing=limits.get(a[0]);
    if(existing && a[3]-existing.since_ms<3600000)
     limits.set(a[0],{attempts:existing.attempts+1,since_ms:existing.since_ms});
    else limits.set(a[0],{attempts:1,since_ms:a[2]});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO app_members')){
    const [id,username,display_name,salt,password_hash,status,permissions]=a;
    if([...people.values()].some(p=>p.username===username))throw Error('UNIQUE constraint failed: app_members.username');
    people.set(id,{id,username,display_name,salt,password_hash,status,permissions,session_version:0});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE app_members')){
    const [status,permissions,id]=a,row=people.get(id);
    if(!row)return {meta:{changes:0}};
    Object.assign(row,{status,permissions,session_version:row.session_version+1});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('DELETE FROM app_members WHERE id=?'))
    return {meta:{changes:Number(people.delete(a[0]))}};
   if(sql.startsWith('DELETE FROM login_attempts')){
    logins.delete(a[0]);return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO login_attempts')){
    logins.set(a[0],{attempts:a[1],blocked_until_ms:a[2],last_seen_ms:a[3]});
    return {meta:{changes:1}};
   }
   throw Error('Unexpected test SQL: '+sql);
  }
  };return q;}};
 const environment={DB:db,SESSION_SECRET:'v38-super-secret-app-key-32-characters-and-more'};
 return {environment,people,limits,ledger};
};
test('V38 accepts Turkish letters and normalized usernames; approval is still mandatory',async()=>{
 const ctx=env(),p=ctx.environment;
 const result=await registerMember(post('register',{
  username:'İpek_Öztürk',display_name:'İpek Öztürk',password:'Parola2026!'}),p);
 assert.equal(result.ok,true);
 const saved=[...ctx.people.values()][0];
 assert.equal(saved.username,'ipek_öztürk');
 assert.notEqual(saved.password_hash,'Parola2026!');
 assert.equal(saved.status,'pending');
 await assert.rejects(()=>loginMember(post('login',{
  username:'İpek_Öztürk',password:'Parola2026!'}),p),{status:403});
 await membersRoute(post('users/'+saved.id,{status:'approved',permissions:['directory']}),p,
  '/api/users/'+saved.id,'PATCH',admin);
 const cookie=await loginMember(post('login',{username:'İpek_Öztürk',password:'Parola2026!'}),p);
 const identity=await getIdentity(request('GET','session',undefined,{cookie:cookie.split(';')[0]}),p);
 assert.equal(identity.id,saved.id);
 assert.deepEqual(identity.permissions,['directory']);
});
test('V38 form validation happens before signup rate limiting',async()=>{
 const ctx=env();
 for(const username of ['a','ab','ad soyad','admin',' x ','@me','xx @xx','   ','x@y']){
  await assert.rejects(()=>registerMember(post('register',{
   username,display_name:'Test Kullanıcı',password:'12345678'}),ctx.environment),{status:400});
 }
 assert.equal(ctx.limits.size,0,'Invalid form submissions must not use up IP attempts');
 const valid=await registerMember(post('register',{
  username:'Kullanıcı123',display_name:'Test Kullanıcı',password:'12345678'}),ctx.environment);
 assert.equal(valid.ok,true);
 assert.equal([...ctx.limits.values()][0].attempts,1);
 await assert.rejects(()=>registerMember(post('register',{
  username:'Kullanıcı123',display_name:'Test Kullanıcı',password:'12345678'}),ctx.environment),{status:409});
});
test('V38 rate control allows 10 valid submissions per hour, then responds clearly',async()=>{
 const ctx=env();
 for(let i=0;i<10;i++){
  const result=await registerMember(post('register',{
   username:'test'+(100+i),display_name:'Kullanıcı Test',password:'12345678'}),ctx.environment);
  assert.equal(result.ok,true);
 }
 await assert.rejects(()=>registerMember(post('register',{
  username:'test200',display_name:'Kullanıcı Test',password:'12345678'}),ctx.environment),
  error=>error.status===429&&/1 saat/.test(error.message));
 const row=[...ctx.limits.values()][0];
 assert.equal(row.attempts,10);
});
test('V38 only admin deletes a member; old signed user cookie immediately becomes unusable',async()=>{
 const ctx=env(),p=ctx.environment;
 await registerMember(post('register',{username:'murat',
  display_name:'Murat Test',password:'Parola-2026!'}),p);
 const member=[...ctx.people.values()][0];
 await membersRoute(post('users/'+member.id,{status:'approved',permissions:['overview']}),p,
  '/api/users/'+member.id,'PATCH',admin);
 const cookie=await loginMember(post('login',{username:'murat',password:'Parola-2026!'}),p);
 const reqSession=request('GET','session',undefined,{cookie:cookie.split(';')[0]});
 assert.equal((await getIdentity(reqSession,p)).id,member.id);
 const deletion=request('DELETE','users/'+member.id);
 await assert.rejects(()=>membersRoute(deletion,p,'/api/users/'+member.id,'DELETE',user),{status:403});
 assert.equal(ctx.people.size,1);
 const result=await membersRoute(deletion,p,'/api/users/'+member.id,'DELETE',admin);
 assert.equal(result.ok,true);
 assert.equal(ctx.people.size,0);
 assert.equal(await getIdentity(reqSession,p),null,'Deleted member session must be revoked');
 await assert.rejects(()=>membersRoute(deletion,p,'/api/users/'+member.id,'DELETE',admin),{status:404});
 assert.equal(ctx.ledger.amount_kurus,7890123,'Financial information must not be touched');
});
test('V38 registration and admin deletion controls are present on mobile and desktop',()=>{
 const html=read('public/index.html'),ui=read('public/users-v26.js'),css=read('public/users-v26.css');
 const server=read('src/members-v26.js');
 assert.match(html,/id="v38UsernameHelp"/);
 assert.match(html,/name="username" maxlength="40" minlength="3" required/);
 assert.match(html,/users-v26\.js\?v=47/);
 assert.match(html,/users-v26\.css\?v=38/);
 assert.match(ui,/data-v38-delete-user/);
 assert.match(ui,/api\('users\/'\+record\.id,'DELETE'\)/);
 assert.match(ui,/confirm\('“'\+record\.display_name/);
 assert.match(css,/\.v38-user-actions/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(server,/if\(match&&method==='DELETE'\)/);
 assert.match(server,/DELETE FROM app_members WHERE id=\?/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v51');
});
