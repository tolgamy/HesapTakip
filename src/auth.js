import { ApiError, readJSON } from './validation.js';

const encoder = new TextEncoder();
const COOKIE_NAME = 'karttakip_session';
const SESSION_LIFETIME_SEC = 60 * 60 * 24 * 7;

function hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function digest(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))); }
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
function cookieHeader(cookie) {
  return `${COOKIE_NAME}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SEC}`;
}
export function logoutCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
export function secretsReady(env) { return typeof env.APP_PASSWORD === 'string' && env.APP_PASSWORD.length >= 8 && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32; }
// Eski v1 yönetici oturumları geçerliliğini korur. Yeni roller v2 imzasına dahildir.
export async function createSession(secret, now = Date.now(), role = null) {
  const expires = Math.floor(now / 1000) + SESSION_LIFETIME_SEC;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = role ? `v2.${role}.${expires}.${nonce}` : `v1.${expires}.${nonce}`;
  return cookieHeader(`${payload}.${await sign(payload, secret)}`);
}
export async function getSessionRole(request, env, now = Date.now()) {
  if (!secretsReady(env)) return null;
  const cookies = request.headers.get('cookie') || '';
  const raw = cookies.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return null;
  const parts = raw.slice(COOKIE_NAME.length + 1).split('.');
  const legacy = parts.length === 4 && parts[0] === 'v1';
  const modern = parts.length === 5 && parts[0] === 'v2' && ['admin','staff','viewer'].includes(parts[1]);
  if (!legacy && !modern) return null;
  const expiryIndex = legacy ? 1 : 2, nonceIndex = expiryIndex+1, sigIndex = nonceIndex+1;
  if (!/^\d{10}$/.test(parts[expiryIndex]) || !/^[a-f0-9]{32}$/.test(parts[nonceIndex]) ||
      !/^[a-f0-9]{64}$/.test(parts[sigIndex])) return null;
  const expires = Number(parts[expiryIndex]), sec = Math.floor(now / 1000);
  if (expires < sec || expires > sec + SESSION_LIFETIME_SEC) return null;
  const expected = await sign(parts.slice(0,sigIndex).join('.'),env.SESSION_SECRET);
  return constantTimeEqual(encoder.encode(expected),encoder.encode(parts[sigIndex])) ?
    (legacy ? 'admin' : parts[1]) : null;
}
export async function isAuthenticated(request, env, now = Date.now()) {
  return (await getSessionRole(request,env,now)) !== null;
}

async function ipHash(request, secret) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  return sign(ip, secret);
}

export async function login(request, env) {
  if (!secretsReady(env)) throw new ApiError(503, 'Kurulum tamamlanmamış. Cloudflare gizli değişkenlerini tanımlayın.');
  const data = await readJSON(request);
  const password = typeof data.password === 'string' ? data.password : '';
  if (password.length > 500) throw new ApiError(400, 'Şifre çok uzun.');
  const now = Date.now();
  const key = await ipHash(request, env.SESSION_SECRET);
  const recent = await env.DB.prepare('SELECT attempts, blocked_until_ms, last_seen_ms FROM login_attempts WHERE ip_hash = ?').bind(key).first();
  if (recent && recent.blocked_until_ms > now) throw new ApiError(429, 'Çok sayıda hatalı deneme. 15 dakika sonra tekrar deneyin.');
  const hashed = await digest(password);
  const admin = constantTimeEqual(hashed, await digest(env.APP_PASSWORD));
  const staff = typeof env.STAFF_PASSWORD === 'string' && env.STAFF_PASSWORD.length >= 12 &&
    constantTimeEqual(hashed, await digest(env.STAFF_PASSWORD));
  const viewer = typeof env.VIEWER_PASSWORD === 'string' && env.VIEWER_PASSWORD.length >= 12 &&
    constantTimeEqual(hashed, await digest(env.VIEWER_PASSWORD));
  const role = admin ? 'admin' : staff ? 'staff' : viewer ? 'viewer' : null;
  if (!role) {
    const attempts = recent && (now - recent.last_seen_ms < 15 * 60 * 1000) ? recent.attempts + 1 : 1;
    const blockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
    await env.DB.prepare('INSERT INTO login_attempts(ip_hash, attempts, blocked_until_ms, last_seen_ms) VALUES (?, ?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts, blocked_until_ms=excluded.blocked_until_ms, last_seen_ms=excluded.last_seen_ms').bind(key, attempts, blockedUntil, now).run();
    throw new ApiError(401, attempts >= 5 ? 'Çok sayıda hatalı deneme. 15 dakika sonra tekrar deneyin.' : 'Şifre yanlış.');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(key).run();
  return await createSession(env.SESSION_SECRET, now, role);
}
