import { ApiError, readJSON, requiredText } from './validation.js';
import { getSessionRole, login as legacyLogin } from './auth.js';

// V26: individually approved accounts. The original APP_PASSWORD remains the
// bootstrap administrator secret; no existing financial records are migrated.
export const memberPermissions=['overview','banking','cards','meal','platforms','people','payables','directory','vault'];
export const memberSchema=[
  "CREATE TABLE IF NOT EXISTS app_members (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','blocked')), permissions TEXT NOT NULL DEFAULT '[]', session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS vault_credentials (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('bank','bank_pos','payment','platform','other')), institution_name TEXT NOT NULL, login_name TEXT NOT NULL DEFAULT '', login_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', secret_cipher TEXT NOT NULL DEFAULT '', secret_iv TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS member_signup_limits (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since_ms INTEGER NOT NULL)"
];

const enc=new TextEncoder();
const utf8=new TextDecoder();
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
const fromHex=s=>new Uint8Array(s.match(/.{2}/g).map(x=>parseInt(x,16)));
const base64=bytes=>btoa(String.fromCharCode(...bytes));
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const same=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a[i]^b[i];return n===0;};
const validPerms=value=>Array.isArray(value)?[...new Set(value.filter(p=>memberPermissions.includes(p)))]:[];
function username(value){
 const x=String(value||'').trim().toLocaleLowerCase('tr-TR');
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(x)||x==='admin')throw new ApiError(400,'Kullanıcı adı 3-40 karakter olmalı (a-z, 0-9, nokta, tire).');
 return x;
}
function password(value){
 if(typeof value!=='string'||value.length<12||value.length>128)throw new ApiError(400,'Şifre 12-128 karakter olmalı.');
 return value;
}
async function hashedPassword(pass,salt){
 const key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations:210000,hash:'SHA-256'},key,256);
 return hex(new Uint8Array(bits));
}
async function signature(value,secret){
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))));
}
function readSessionCookie(request){
 const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('karttakip_session='));
 return raw?raw.slice('karttakip_session='.length):'';
}
function userCookie(id,version,secret){
 return (async()=>{
  const until=Math.floor(Date.now()/1000)+7*86400;
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload=['v3',id,version,until,nonce].join('.');
  return 'karttakip_session='+payload+'.'+await signature(payload,secret)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800';
 })();
}
export async function getIdentity(request,env){
 const legacy=await getSessionRole(request,env);
 if(legacy)return {role:legacy,username:legacy==='admin'?'admin':legacy,permissions:legacy==='admin'?memberPermissions:[]};
 const parts=readSessionCookie(request).split('.');
 if(parts.length!==6||parts[0]!=='v3'||!/^[a-f0-9-]{36}$/.test(parts[1])||
   !/^\d+$/.test(parts[2])||!/^\d{10}$/.test(parts[3])||
   !/^[a-f0-9]{32}$/.test(parts[4])||!/^[a-f0-9]{64}$/.test(parts[5]))return null;
 const now=Math.floor(Date.now()/1000),expires=Number(parts[3]);
 if(expires<now||expires>now+604800)return null;
 const expected=await signature(parts.slice(0,5).join('.'),env.SESSION_SECRET);
 if(!same(enc.encode(expected),enc.encode(parts[5])))return null;
 const row=await env.DB.prepare('SELECT id,username,display_name,status,permissions,session_version FROM app_members WHERE id=?').bind(parts[1]).first();
 if(!row||row.status!=='approved'||Number(row.session_version)!==Number(parts[2]))return null;
 let permissions=[];try{permissions=validPerms(JSON.parse(row.permissions));}catch{}
 return {role:'user',id:row.id,username:row.username,display_name:row.display_name,permissions};
}
async function guardIp(request,env,key){
 const ip=request.headers.get('cf-connecting-ip')||'local';
 const id=await signature(key+':'+ip,env.SESSION_SECRET);
 const row=await env.DB.prepare('SELECT attempts,since_ms FROM member_signup_limits WHERE ip_hash=?').bind(id).first();
 if(row&&Date.now()-row.since_ms<86400000&&row.attempts>=5)throw new ApiError(429,'Çok fazla talep. Daha sonra tekrar deneyin.');
 await env.DB.prepare('INSERT INTO member_signup_limits(ip_hash,attempts,since_ms) VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN ?-since_ms>86400000 THEN 1 ELSE attempts+1 END,since_ms=CASE WHEN ?-since_ms>86400000 THEN ? ELSE since_ms END')
  .bind(id,1,Date.now(),Date.now(),Date.now(),Date.now()).run();
}
export async function registerMember(request,env){
 await guardIp(request,env,'signup');
 const d=await readJSON(request),name=username(d.username);
 const display=requiredText(d.display_name,'Ad soyad',80),pass=password(d.password);
 const salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await hashedPassword(pass,salt);
 try{
  await env.DB.prepare('INSERT INTO app_members(id,username,display_name,salt,password_hash,status,permissions) VALUES(?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),name,display,salt,digest,'pending','[]').run();
 }catch(e){
  if(/unique|constraint/i.test(String(e?.message)))throw new ApiError(409,'Bu kullanıcı adı kullanılıyor.');
  throw e;
 }
 return {ok:true,message:'Kayıt alındı. Yönetici onayladıktan sonra giriş yapabilirsin.'};
}
export async function loginMember(request,env){
 const d=await readJSON(request),name=String(d.username||'').trim().toLocaleLowerCase('tr-TR');
 if(!name||name==='admin'){
  // Only the explicit admin username can use the bootstrap password.
  return legacyLogin(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({password:d.password})}),env);
 }
 const pass=String(d.password||'');
 const ip=request.headers.get('cf-connecting-ip')||'local';
 const id=await signature('login:'+ip,env.SESSION_SECRET);
 const previous=await env.DB.prepare('SELECT attempts,blocked_until_ms,last_seen_ms FROM login_attempts WHERE ip_hash=?').bind(id).first();
 const now=Date.now();
 if(previous?.blocked_until_ms>now)throw new ApiError(429,'Çok sayıda hatalı giriş. 15 dakika sonra deneyin.');
 const row=await env.DB.prepare('SELECT * FROM app_members WHERE username=?').bind(name).first();
 let matches=false;
 if(row&&pass.length<=500)matches=same(enc.encode(await hashedPassword(pass,row.salt)),enc.encode(row.password_hash));
 if(!matches){
  const attempts=previous&&now-previous.last_seen_ms<900000?previous.attempts+1:1;
  await env.DB.prepare('INSERT INTO login_attempts(ip_hash,attempts,blocked_until_ms,last_seen_ms) VALUES(?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts,blocked_until_ms=excluded.blocked_until_ms,last_seen_ms=excluded.last_seen_ms')
   .bind(id,attempts,attempts>=5?now+900000:0,now).run();
  throw new ApiError(401,'Kullanıcı adı veya şifre yanlış.');
 }
 if(row.status!=='approved')throw new ApiError(403,row.status==='pending'?'Üyeliğin yönetici onayını bekliyor.':'Bu hesap erişime kapatılmış.');
 await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(id).run();
 return userCookie(row.id,row.session_version,env.SESSION_SECRET);
}
export async function membersRoute(request,env,path,method,principal){
 if(principal?.role!=='admin')throw new ApiError(403,'Üyelik yönetimi yalnızca yöneticiye açıktır.');
 if(path==='/api/users'&&method==='GET'){
  const x=await env.DB.prepare('SELECT id,username,display_name,status,permissions,created_at,updated_at FROM app_members ORDER BY created_at DESC').all();
  return {users:x.results.map(r=>({...r,permissions:validPerms(JSON.parse(r.permissions||'[]'))}))};
 }
 const match=path.match(/^\/api\/users\/([a-f0-9-]{36})$/);
 if(match&&method==='PATCH'){
  const d=await readJSON(request);
  if(!['pending','approved','blocked'].includes(d.status)||!Array.isArray(d.permissions)||
     d.permissions.some(x=>!memberPermissions.includes(x)))throw new ApiError(400,'Durum veya yetkiler geçersiz.');
  const perms=validPerms(d.permissions);
  const result=await env.DB.prepare("UPDATE app_members SET status=?,permissions=?,session_version=session_version+1,updated_at=datetime('now') WHERE id=?")
   .bind(d.status,JSON.stringify(perms),match[1]).run();
  if(!result.meta?.changes)throw new ApiError(404,'Kullanıcı bulunamadı.');
  return {ok:true};
 }
 throw new ApiError(404,'Kullanıcı işlemi bulunamadı.');
}
const vaultText=(value,label,max=200)=>{const v=String(value??'').trim();if(v.length>max)throw new ApiError(400,label+' çok uzun.');return v;};
function safeUrl(raw){
 const value=vaultText(raw,'Giriş adresi',500);
 if(!value)return '';
 let url;try{url=new URL(value);}catch{throw new ApiError(400,'Giriş adresi geçersiz.');}
 if(url.protocol!=='https:')throw new ApiError(400,'Giriş adresi HTTPS olmalı.');
 return url.toString();
}
async function vaultKey(env){
 if(typeof env.VAULT_ENCRYPTION_KEY!=='string'||env.VAULT_ENCRYPTION_KEY.length<32)
  throw new ApiError(503,'Şifre kasası için Cloudflare VAULT_ENCRYPTION_KEY (en az 32 karakter) tanımlanmalı.');
 const bits=await crypto.subtle.digest('SHA-256',enc.encode(env.VAULT_ENCRYPTION_KEY));
 return crypto.subtle.importKey('raw',bits,'AES-GCM',false,['encrypt','decrypt']);
}
async function encryptSecret(plain,env){
 if(!plain)return {cipher:'',iv:''};
 if(plain.length>500)throw new ApiError(400,'Giriş şifresi çok uzun.');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(env),enc.encode(plain));
 return {cipher:base64(new Uint8Array(data)),iv:base64(iv)};
}
async function decryptSecret(record,env){
 if(!record.secret_cipher)return '';
 try{
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(record.secret_iv)},await vaultKey(env),unbase64(record.secret_cipher));
  return utf8.decode(value);
 }catch(e){
  if(e instanceof ApiError)throw e;
  throw new ApiError(503,'Şifre çözülmedi. Şifreleme anahtarı değişmiş olabilir.');
 }
}
function vaultInput(d){
 const category=String(d.category||'');
 if(!['bank','bank_pos','payment','platform','other'].includes(category))throw new ApiError(400,'Hesap türü geçersiz.');
 return {category,institution_name:requiredText(d.institution_name,'Kurum adı',120),
  login_name:vaultText(d.login_name,'Kullanıcı adı',120),login_url:safeUrl(d.login_url),
  notes:vaultText(d.notes,'Not',500)};
}
export async function vaultRoute(request,env,path,method,principal){
 if(!principal||(principal.role!=='admin'&&!(principal.role==='user'&&principal.permissions.includes('vault'))))
  throw new ApiError(403,'Kullanıcı İşlemleri yetkin yok.');
 if(path==='/api/vault'&&method==='GET'){
  const result=await env.DB.prepare('SELECT id,category,institution_name,login_name,login_url,notes,created_at,updated_at,secret_cipher FROM vault_credentials ORDER BY institution_name COLLATE NOCASE').all();
  return {vault:result.results.map(({secret_cipher,...x})=>({...x,has_password:!!secret_cipher}))};
 }
 const reveal=path.match(/^\/api\/vault\/([a-f0-9-]{36})\/reveal$/);
 if(reveal&&method==='POST'){
  const record=await env.DB.prepare('SELECT secret_cipher,secret_iv FROM vault_credentials WHERE id=?').bind(reveal[1]).first();
  if(!record)throw new ApiError(404,'Giriş bilgisi bulunamadı.');
  return {password:await decryptSecret(record,env)};
 }
 if(principal.role!=='admin')throw new ApiError(403,'Giriş bilgilerini yalnız yönetici değiştirebilir.');
 if(path==='/api/vault'&&method==='POST'){
  const d=await readJSON(request),v=vaultInput(d),encrypted=await encryptSecret(String(d.password||''),env);
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO vault_credentials(id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id,v.category,v.institution_name,v.login_name,v.login_url,v.notes,encrypted.cipher,encrypted.iv).run();
  return {ok:true,id};
 }
 const match=path.match(/^\/api\/vault\/([a-f0-9-]{36})$/);
 if(match&&method==='PATCH'){
  const old=await env.DB.prepare('SELECT id FROM vault_credentials WHERE id=?').bind(match[1]).first();
  if(!old)throw new ApiError(404,'Giriş bilgisi bulunamadı.');
  const d=await readJSON(request),v=vaultInput(d),setPassword=Object.prototype.hasOwnProperty.call(d,'password');
  const encrypted=setPassword?await encryptSecret(String(d.password||''),env):null;
  const fields=setPassword?"secret_cipher=?,secret_iv=?,":'';
  const values=setPassword?[encrypted.cipher,encrypted.iv]:[];
  await env.DB.prepare("UPDATE vault_credentials SET category=?,institution_name=?,login_name=?,login_url=?,notes=?,"+fields+"updated_at=datetime('now') WHERE id=?")
   .bind(v.category,v.institution_name,v.login_name,v.login_url,v.notes,...values,match[1]).run();
  return {ok:true};
 }
 if(match&&method==='DELETE'){
  const res=await env.DB.prepare('DELETE FROM vault_credentials WHERE id=?').bind(match[1]).run();
  if(!res.meta?.changes)throw new ApiError(404,'Giriş bilgisi bulunamadı.');
  return {ok:true};
 }
 throw new ApiError(404,'Giriş bilgisi işlemi bulunamadı.');
}
export function visibleFirm(f,perms){
 if(f.category==='payable')return perms.includes('payables');
 if(f.receivable_group==='meal')return perms.includes('meal');
 if(f.receivable_group==='person')return perms.includes('people');
 if(f.receivable_group==='pos')return perms.includes('banking');
 return perms.includes('platforms');
}
