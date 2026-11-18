import {ApiError,readJSON} from './validation.js';

export const vaultPinSchema=[
 "CREATE TABLE IF NOT EXISTS vault_pin_settings (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, pin_hash TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS vault_pin_attempts (attempt_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, blocked_until_ms INTEGER NOT NULL DEFAULT 0, last_seen_ms INTEGER NOT NULL DEFAULT 0)"
];
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const fromHex=hexstr=>new Uint8Array(hexstr.match(/.{2}/g).map(v=>parseInt(v,16)));
function validatePin(pin){
 if(typeof pin!=='string'||!/^\d{4}$/.test(pin))throw new ApiError(400,'PIN tam olarak 4 rakam olmalı.');
 return pin;
}
function safeEqual(a,b){
 if(a.length!==b.length)return false;
 let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];
 return v===0;
}
async function hashPin(pin,salt,env){
 if(typeof env.VAULT_ENCRYPTION_KEY!=='string'||env.VAULT_ENCRYPTION_KEY.length<32)
  throw new ApiError(503,'Şifre kasası anahtarı Cloudflare üzerinde tanımlanmalı.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(pin+':'+env.VAULT_ENCRYPTION_KEY),'PBKDF2',false,['deriveBits']);
 // Cloudflare workerd rejects PBKDF2 iteration counts above 100,000.
 // The separate VAULT_ENCRYPTION_KEY peppers the 4-digit PIN.
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations:100000,hash:'SHA-256'},key,256);
 return hex(new Uint8Array(bits));
}
async function attemptKey(request,principal,env){
 const subject=principal?.role==='admin'?'admin':principal?.id||'unknown';
 const ip=request.headers.get('cf-connecting-ip')||'local';
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(subject+':'+ip+':'+env.SESSION_SECRET));
 return hex(new Uint8Array(digest));
}
async function validateAgainstStored(request,env,principal,pin,stored){
 validatePin(pin);
 const key=await attemptKey(request,principal,env);
 const now=Date.now();
 const attempt=await env.DB.prepare('SELECT attempts,blocked_until_ms,last_seen_ms FROM vault_pin_attempts WHERE attempt_key=?').bind(key).first();
 if(attempt&&attempt.blocked_until_ms>now)throw new ApiError(429,'Çok fazla yanlış PIN. 15 dakika sonra yeniden dene.');
 const calculated=await hashPin(pin,stored.salt,env);
 if(!safeEqual(encoder.encode(calculated),encoder.encode(stored.pin_hash))){
  const count=attempt&&now-attempt.last_seen_ms<900000?attempt.attempts+1:1;
  await env.DB.prepare('INSERT INTO vault_pin_attempts(attempt_key,attempts,blocked_until_ms,last_seen_ms) VALUES(?,?,?,?) ON CONFLICT(attempt_key) DO UPDATE SET attempts=excluded.attempts,blocked_until_ms=excluded.blocked_until_ms,last_seen_ms=excluded.last_seen_ms')
   .bind(key,count,count>=5?now+900000:0,now).run();
  throw new ApiError(count>=5?429:403,count>=5?'Çok fazla yanlış PIN. 15 dakika sonra yeniden dene.':'PIN yanlış.');
 }
 await env.DB.prepare('DELETE FROM vault_pin_attempts WHERE attempt_key=?').bind(key).run();
}
async function storedPin(env){
 return env.DB.prepare('SELECT salt,pin_hash FROM vault_pin_settings WHERE id=1').first();
}
export async function verifyVaultPin(request,env,principal,pin){
 const stored=await storedPin(env);
 if(!stored)throw new ApiError(409,'Şifreyi görmek için önce yöneticinin 4 haneli kasa PIN’i oluşturması gerekiyor.');
 return validateAgainstStored(request,env,principal,pin,stored);
}
export async function vaultPinRoute(request,env,method,principal){
 if(!principal||(principal.role!=='admin'&&!(principal.role==='user'&&principal.permissions?.includes('vault'))))
  throw new ApiError(403,'Şifre kasasına erişim yetkisi yok.');
 if(method==='GET')return {configured:!!(await storedPin(env))};
 if(method!=='POST')throw new ApiError(405,'Bu yöntem desteklenmiyor.');
 if(principal.role!=='admin')throw new ApiError(403,'PIN ayarını yalnız yönetici değiştirebilir.');
 const d=await readJSON(request),pin=validatePin(d.pin);
 const old=await storedPin(env);
 if(old)await validateAgainstStored(request,env,principal,d.old_pin,old);
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 const hash=await hashPin(pin,salt,env);
 await env.DB.prepare("INSERT INTO vault_pin_settings(id,salt,pin_hash) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash,updated_at=datetime('now')")
  .bind(salt,hash).run();
 await env.DB.prepare('DELETE FROM vault_pin_attempts').run();
 return {ok:true,configured:true};
}
