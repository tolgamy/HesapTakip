import { ApiError, readJSON } from './validation.js';

// Every PIN belongs to an account, while each signed browser session has its own lock.
// Do not store plaintext PINs, PINs in cookies, or personal financial records here.
export const pinSchema = [
  "CREATE TABLE IF NOT EXISTS pin_credentials (account_key TEXT PRIMARY KEY, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, blocked_until_ms INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS pin_sessions (session_key TEXT PRIMARY KEY, account_key TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 1, last_activity_ms INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_pin_sessions_account ON pin_sessions(account_key)",
  "CREATE TABLE IF NOT EXISTS pin_recovery_limits (account_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, blocked_until_ms INTEGER NOT NULL DEFAULT 0)"
];
export const PIN_IDLE_MS = 5 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const encoder = new TextEncoder();
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = value => new Uint8Array(value.match(/.{2}/g).map(x => parseInt(x, 16)));
function equal(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
async function sha(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function derived(value, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:fromHex(salt), iterations:100000, hash:'SHA-256' }, key, 256);
  return hex(new Uint8Array(bits));
}
const keyFor = identity => identity.role === 'admin' ? 'admin' : 'user:' + identity.id;
function rawCookie(request) {
  const pair = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith('karttakip_session='));
  return pair ? pair.slice('karttakip_session='.length) : '';
}
async function sessionKey(token, secret) {
  if (!token) return '';
  // A stolen D1 backup by itself must not reveal usable bearer session tokens.
  return hex(await sha(secret + ':' + token));
}
async function identityAndSession(request, env, principal) {
  return { account: keyFor(principal), id: await sessionKey(rawCookie(request), env.SESSION_SECRET) };
}
async function pinRecord(env, account) {
  return env.DB.prepare('SELECT salt,pin_hash,attempts,blocked_until_ms FROM pin_credentials WHERE account_key=?').bind(account).first();
}
async function activeSession(env, id) {
  if (!id) return null;
  return env.DB.prepare('SELECT account_key,locked,last_activity_ms FROM pin_sessions WHERE session_key=?').bind(id).first();
}
export async function primePinSession(cookie, env) {
  const token = /^karttakip_session=([^;]+)/.exec(cookie)?.[1] || '';
  if (!token) return;
  const account = token.startsWith('v3.') ? 'user:' + token.split('.')[1] : 'admin';
  const id = await sessionKey(token, env.SESSION_SECRET);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,0,?) ON CONFLICT(session_key) DO UPDATE SET account_key=excluded.account_key,locked=0,last_activity_ms=excluded.last_activity_ms')
    .bind(id, account, now).run();
  // Old, expired browser sessions need not accumulate indefinitely.
  await env.DB.prepare('DELETE FROM pin_sessions WHERE last_activity_ms<?').bind(now - 8 * 86400000).run();
}
export async function pinStatus(request, env, principal) {
  const { account, id } = await identityAndSession(request, env, principal);
  const credential = await pinRecord(env, account);
  if (!credential) return { configured:false, locked:true };
  const session = await activeSession(env, id);
  const locked = !session || session.account_key !== account || Boolean(session.locked) ||
    Date.now() - Number(session.last_activity_ms) >= PIN_IDLE_MS;
  return { configured:true, locked };
}
export async function assertPinUnlocked(request, env, principal) {
  const status = await pinStatus(request, env, principal);
  if (!status.configured || status.locked)
    throw new ApiError(423, 'Uygulama kilitli. PIN ile açın.');
}
function checkedPin(raw) {
  if (typeof raw !== 'string' || !/^\d{6}$/.test(raw))
    throw new ApiError(400, 'PIN tam 6 rakam olmalı.');
  if (/^(\d)\1{5}$/.test(raw) || ['123456','654321','012345','987654'].includes(raw))
    throw new ApiError(400, 'Daha zor tahmin edilebilecek bir PIN seçin.');
  return raw;
}
async function verifyPassword(env, principal, raw) {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  if (principal.role === 'admin')
    return equal(await sha(raw), await sha(env.APP_PASSWORD));
  const row = await env.DB.prepare('SELECT salt,password_hash FROM app_members WHERE id=?').bind(principal.id).first();
  if (!row) return false;
  return equal(encoder.encode(await derived(raw, row.salt)), encoder.encode(row.password_hash));
}
async function verifyRecoveryPassword(env, principal, account, password) {
  const now = Date.now();
  const current = await env.DB.prepare('SELECT attempts,blocked_until_ms FROM pin_recovery_limits WHERE account_key=?').bind(account).first();
  if (Number(current?.blocked_until_ms || 0) > now)
    throw new ApiError(429, 'Çok sayıda yanlış şifre denendi. 15 dakika sonra tekrar deneyin.');
  const passed = await verifyPassword(env, principal, password);
  if (!passed) {
    const prior = Number(current?.blocked_until_ms || 0) > 0 && Number(current.blocked_until_ms) <= now ?
      0 : Number(current?.attempts || 0);
    const attempts = prior + 1;
    await env.DB.prepare('INSERT INTO pin_recovery_limits(account_key,attempts,blocked_until_ms) VALUES(?,?,?) ON CONFLICT(account_key) DO UPDATE SET attempts=excluded.attempts,blocked_until_ms=excluded.blocked_until_ms')
      .bind(account,attempts,attempts >= 5 ? now + BLOCK_MS : 0).run();
    throw new ApiError(attempts >= 5 ? 429 : 401, 'Mevcut hesap şifresi yanlış.');
  }
  await env.DB.prepare('DELETE FROM pin_recovery_limits WHERE account_key=?').bind(account).run();
}
async function checkPin(env, account, raw, credential) {
  const now = Date.now();
  if (Number(credential.blocked_until_ms) > now)
    throw new ApiError(429, 'Çok sayıda hatalı PIN. 15 dakika sonra deneyin veya uzun şifrenizle giriş yapın.');
  // On expiry, reset the five-attempt counter.
  if (Number(credential.attempts) >= 5)
    await env.DB.prepare('UPDATE pin_credentials SET attempts=0,blocked_until_ms=0 WHERE account_key=?').bind(account).run();
  const supplied = typeof raw === 'string' && /^\d{6}$/.test(raw) ? raw : '------';
  const correct = equal(encoder.encode(await derived(supplied, credential.salt)), encoder.encode(credential.pin_hash));
  if (!correct) {
    const attempt = Number(credential.attempts) >= 5 ? 1 : Number(credential.attempts) + 1;
    await env.DB.prepare('UPDATE pin_credentials SET attempts=?,blocked_until_ms=? WHERE account_key=?')
      .bind(attempt, attempt >= 5 ? now + BLOCK_MS : 0, account).run();
    throw new ApiError(attempt >= 5 ? 429 : 401, attempt >= 5 ?
      '5 kez yanlış PIN girildi. 15 dakika engellendi.' : 'PIN yanlış. Tekrar deneyin.');
  }
  await env.DB.prepare('UPDATE pin_credentials SET attempts=0,blocked_until_ms=0 WHERE account_key=?').bind(account).run();
}
async function updatePin(env, account, pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derived(pin, salt);
  await env.DB.prepare("INSERT INTO pin_credentials(account_key,salt,pin_hash,attempts,blocked_until_ms) VALUES(?,?,?,0,0) ON CONFLICT(account_key) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash,attempts=0,blocked_until_ms=0,updated_at=datetime('now')")
    .bind(account, salt, hash).run();
}
export async function pinRoute(request, env, principal, path, method) {
  const { account, id } = await identityAndSession(request, env, principal);
  if (path === '/api/pin/status' && method === 'GET') return pinStatus(request, env, principal);
  if (method !== 'POST') throw new ApiError(404, 'PIN işlemi bulunamadı.');
  if (path === '/api/pin/lock') {
    await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,1,?) ON CONFLICT(session_key) DO UPDATE SET locked=1')
      .bind(id, account, Date.now()).run();
    return { ok:true, locked:true };
  }
  const credential = await pinRecord(env, account);
  if (path === '/api/pin/touch') {
    await assertPinUnlocked(request, env, principal);
    await env.DB.prepare('UPDATE pin_sessions SET last_activity_ms=? WHERE session_key=? AND account_key=? AND locked=0')
      .bind(Date.now(), id, account).run();
    return { ok:true };
  }
  if (path === '/api/pin/setup') {
    if (credential) throw new ApiError(409, 'PIN zaten oluşturulmuş.');
    const data = await readJSON(request);
    const pin = checkedPin(data.pin);
    await verifyRecoveryPassword(env, principal, account, data.password);
    await updatePin(env, account, pin);
    await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,0,?) ON CONFLICT(session_key) DO UPDATE SET locked=0,last_activity_ms=excluded.last_activity_ms')
      .bind(id, account, Date.now()).run();
    return { ok:true };
  }
  if (path === '/api/pin/unlock') {
    if (!credential) throw new ApiError(409, 'Önce PIN oluşturun.');
    const data = await readJSON(request);
    await checkPin(env, account, data.pin, credential);
    await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,0,?) ON CONFLICT(session_key) DO UPDATE SET account_key=excluded.account_key,locked=0,last_activity_ms=excluded.last_activity_ms')
      .bind(id, account, Date.now()).run();
    return { ok:true };
  }
  if (path === '/api/pin/change' || path === '/api/pin/reset') {
    if (!credential) throw new ApiError(409, 'PIN henüz oluşturulmamış.');
    if (path === '/api/pin/change') await assertPinUnlocked(request, env, principal);
    const data = await readJSON(request);
    const next = checkedPin(data.new_pin);
    if (path === '/api/pin/reset') {
      await verifyRecoveryPassword(env, principal, account, data.password);
    } else await checkPin(env, account, data.old_pin, credential);
    await updatePin(env, account, next);
    // Require the new PIN on other sessions and retain the current session.
    await env.DB.prepare('UPDATE pin_sessions SET locked=1 WHERE account_key=? AND session_key<>?').bind(account, id).run();
    await env.DB.prepare('INSERT INTO pin_sessions(session_key,account_key,locked,last_activity_ms) VALUES(?,?,0,?) ON CONFLICT(session_key) DO UPDATE SET locked=0,last_activity_ms=excluded.last_activity_ms')
      .bind(id, account, Date.now()).run();
    return { ok:true };
  }
  throw new ApiError(404, 'PIN işlemi bulunamadı.');
}
