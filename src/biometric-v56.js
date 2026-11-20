import { ApiError, readJSON } from './validation.js';
import { pinStatus, assertPinUnlocked } from './pin-security.js';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';

// V56: Mobile platform credentials unlock only an already-authenticated browser session.
// Cryptographic WebAuthn validation is server-side; the original 6-digit PIN is retained.
export const biometricSchema = [
  "CREATE TABLE IF NOT EXISTS biometric_credentials (id TEXT PRIMARY KEY, account_key TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE INDEX IF NOT EXISTS idx_biometric_credentials_account ON biometric_credentials(account_key)",
  "CREATE TABLE IF NOT EXISTS biometric_challenges (session_key TEXT PRIMARY KEY, account_key TEXT NOT NULL, kind TEXT NOT NULL, challenge TEXT NOT NULL, expires_ms INTEGER NOT NULL)"
];
const MAX_KEYS = 5, CHALLENGE_LIFETIME_MS = 120000;
const accountFor = p => p.role === 'admin' ? 'admin' : 'user:' + p.id;
const bytesFromB64 = s => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s) || s.length > 16384)
    throw new ApiError(400, 'Geçersiz biyometrik anahtar.');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4-b64.length%4)%4)), c => c.charCodeAt(0));
};
const toB64 = bytes => {
  let out = '';
  for (let i=0; i<bytes.length; i+=8192) out += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
async function sessionAccount(request, env, principal) {
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim())
    .find(s=>s.startsWith('karttakip_session='))?.slice(18) || '';
  if (!token) throw new ApiError(401, 'Geçerli oturum bulunamadı.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.SESSION_SECRET+':'+token));
  return { account:accountFor(principal), sessionKey:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('') };
}
function rp(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
    throw new ApiError(403, 'Biyometrik doğrulama güvenli bağlantı gerektirir.');
  return { rpID:url.hostname, origin:url.origin };
}
async function credentials(env, account) {
  const result=await env.DB.prepare('SELECT id,public_key,counter,transports,created_at FROM biometric_credentials WHERE account_key=? ORDER BY created_at DESC').bind(account).all();
  return result.results || [];
}
async function issueChallenge(env, sessionKey, account, kind, challenge) {
  await env.DB.prepare('INSERT INTO biometric_challenges(session_key,account_key,kind,challenge,expires_ms) VALUES(?,?,?,?,?) ON CONFLICT(session_key) DO UPDATE SET account_key=excluded.account_key,kind=excluded.kind,challenge=excluded.challenge,expires_ms=excluded.expires_ms')
    .bind(sessionKey,account,kind,challenge,Date.now()+CHALLENGE_LIFETIME_MS).run();
}
async function takeChallenge(env, sessionKey, account, kind) {
  const row=await env.DB.prepare('SELECT challenge,expires_ms FROM biometric_challenges WHERE session_key=? AND account_key=? AND kind=?')
    .bind(sessionKey,account,kind).first();
  if (!row || row.expires_ms < Date.now()) throw new ApiError(401, 'Biyometrik doğrulama süresi doldu. Tekrar deneyin.');
  // Delete exactly once BEFORE verification, including for bad signatures; prevents replay.
  const deleted=await env.DB.prepare('DELETE FROM biometric_challenges WHERE session_key=? AND account_key=? AND kind=? AND challenge=?')
    .bind(sessionKey,account,kind,row.challenge).run();
  if (Number(deleted.meta?.changes)!==1) throw new ApiError(409, 'Bu doğrulama isteği kullanılmış.');
  return row.challenge;
}
function usable(body) {
  if (!body || body.type!=='public-key' || typeof body.id!=='string' ||
      !/^[A-Za-z0-9_-]{8,2048}$/.test(body.id) || !body.response)
    throw new ApiError(400,'Biyometrik yanıt geçersiz.');
  return body;
}
export async function biometricRoute(request,env,principal,path,method) {
  const {account,sessionKey}=await sessionAccount(request,env,principal);
  const {rpID,origin}=rp(request);
  const list=await credentials(env,account);
  if(path==='/api/biometric/status' && method==='GET')
    return {enrolled:list.length>0,count:list.length};
  if(path==='/api/biometric/register/options' && method==='POST') {
    await assertPinUnlocked(request,env,principal);
    if(list.length>=MAX_KEYS)throw new ApiError(409,'En fazla 5 mobil cihaz kaydedilebilir.');
    const opts=await generateRegistrationOptions({
      rpName:'HesapTakip',rpID,userName:principal.username||account,
      userDisplayName:principal.display_name||principal.username||'HesapTakip',
      userID:new TextEncoder().encode('hesaptakip:'+account),
      attestationType:'none', supportedAlgorithmIDs:[-7,-257],
      excludeCredentials:list.map(k=>({id:k.id,transports:JSON.parse(k.transports||'[]')})),
      authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'}
    });
    await issueChallenge(env,sessionKey,account,'register',opts.challenge);
    return opts;
  }
  if(path==='/api/biometric/register/verify' && method==='POST') {
    await assertPinUnlocked(request,env,principal);
    const body=usable(await readJSON(request));
    const challenge=await takeChallenge(env,sessionKey,account,'register');
    let verified;
    try { verified=await verifyRegistrationResponse({
      response:body, expectedChallenge:challenge,expectedOrigin:origin,
      expectedRPID:rpID,requireUserVerification:true
    }); } catch { throw new ApiError(401,'Telefon kimliği doğrulanamadı. PIN kullanın.'); }
    if(!verified.verified||!verified.registrationInfo?.credential)
      throw new ApiError(401,'Telefon kimliği doğrulanamadı.');
    // Browser must have requested a locally integrated authenticator; no Windows Hello UI.
    if (body.authenticatorAttachment && body.authenticatorAttachment !== 'platform')
      throw new ApiError(400,'Yalnızca telefondaki güvenlik doğrulaması desteklenir.');
    const key=verified.registrationInfo.credential;
    if(!key.id || !(key.publicKey instanceof Uint8Array))throw new ApiError(400,'Güvenlik anahtarı eksik.');
    const written=await env.DB.prepare('INSERT OR IGNORE INTO biometric_credentials(id,account_key,public_key,counter,transports) VALUES(?,?,?,?,?)')
      .bind(key.id,account,toB64(key.publicKey),key.counter||0,JSON.stringify(key.transports||[])).run();
    if(Number(written.meta?.changes)!==1)throw new ApiError(409,'Bu güvenlik anahtarı zaten kayıtlı.');
    return {ok:true,enrolled:true};
  }
  if(path==='/api/biometric/auth/options' && method==='POST') {
    const pin=await pinStatus(request,env,principal);
    if(!pin.configured)throw new ApiError(409,'Önce 6 haneli PIN oluşturun.');
    if(!list.length)throw new ApiError(409,'Bu hesapta mobil biyometrik giriş kayıtlı değil.');
    const opts=await generateAuthenticationOptions({
      rpID,userVerification:'required',
      allowCredentials:list.map(k=>({id:k.id,transports:JSON.parse(k.transports||'[]')}))
    });
    await issueChallenge(env,sessionKey,account,'auth',opts.challenge);
    return opts;
  }
  if(path==='/api/biometric/auth/verify' && method==='POST') {
    const pin=await pinStatus(request,env,principal);
    if(!pin.configured)throw new ApiError(409,'Önce PIN oluşturun.');
    const body=usable(await readJSON(request));
    const challenge=await takeChallenge(env,sessionKey,account,'auth');
    const record=list.find(k=>k.id===body.id);
    if(!record)throw new ApiError(401,'Bu telefona kayıtlı biyometrik giriş bulunamadı.');
    let verified;
    try { verified=await verifyAuthenticationResponse({
      response:body,expectedChallenge:challenge,expectedOrigin:origin,
      expectedRPID:rpID,requireUserVerification:true,
      credential:{id:record.id,publicKey:bytesFromB64(record.public_key),
        counter:Number(record.counter)||0,transports:JSON.parse(record.transports||'[]')}
    }); } catch { throw new ApiError(401,'Biyometrik doğrulama başarısız. PIN kullanın.'); }
    if(!verified.verified)throw new ApiError(401,'Biyometrik doğrulama reddedildi.');
    // Optimistic update rejects concurrent counter rewrites.
    const update=await env.DB.prepare('UPDATE biometric_credentials SET counter=? WHERE id=? AND account_key=? AND counter=?')
      .bind(verified.authenticationInfo.newCounter,record.id,account,record.counter).run();
    if(Number(update.meta?.changes)!==1)throw new ApiError(409,'Biyometrik sayaç değişti. Tekrar deneyin.');
    // Unlock only this already authenticated browser session, never issue a new login.
    await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,0,?) ON CONFLICT(session_key) DO UPDATE SET account_key=excluded.account_key,locked=0,last_activity_ms=excluded.last_activity_ms')
      .bind(sessionKey,account,Date.now()).run();
    return {ok:true,locked:false};
  }
  if(path==='/api/biometric/revoke' && method==='POST') {
    await assertPinUnlocked(request,env,principal);
    // Emergency recovery: revoke every mobile credential on this account.
    await env.DB.prepare('DELETE FROM biometric_credentials WHERE account_key=?').bind(account).run();
    await env.DB.prepare('DELETE FROM biometric_challenges WHERE account_key=?').bind(account).run();
    return {ok:true,enrolled:false};
  }
  throw new ApiError(404,'Biyometrik işlem bulunamadı.');
}