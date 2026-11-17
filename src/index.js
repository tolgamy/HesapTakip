import { ApiError, requiredText, optionalText, lastFour, positiveMoney, isoDate, monthPeriod, idText, readJSON } from './validation.js';
import { isAuthenticated, getSessionRole, createSession, logoutCookie, login, secretsReady } from './auth.js';
import { financeSchema, financeRoute } from './finance.js';
import { createReminders, backupPrivateR2 } from './scheduler.js';
import { firmSchema, firmRoute } from './firms.js';
import { institutionSchema,initializeCardCatalog,institutionRoute } from './card-catalog.js';
import { parseCardDetails,cardDetailsKeys,enrichCard } from './card-details.js';
import { istanbulDate } from './scheduler.js';

// İlk API isteğinde eksik D1 tablolarını güvenli biçimde oluşturur.
// Var olan kayıtları silmez veya değiştirmez.
let schemaInitPromise;
async function ensureSchema(env) {
  if (!schemaInitPromise) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        bank TEXT NOT NULL,
        nickname TEXT NOT NULL,
        last4 TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS statements (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        period TEXT NOT NULL,
        amount_kurus INTEGER NOT NULL CHECK (amount_kurus >= 0),
        due_date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT,
        UNIQUE(card_id, period)
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        statement_id TEXT NOT NULL,
        amount_kurus INTEGER NOT NULL CHECK (amount_kurus > 0),
        paid_on TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        ip_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        blocked_until_ms INTEGER NOT NULL DEFAULT 0,
        last_seen_ms INTEGER NOT NULL DEFAULT 0
      )`,
      'CREATE INDEX IF NOT EXISTS idx_statements_due_date ON statements(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_statements_card_id ON statements(card_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_statement_id ON payments(statement_id)',
      ...firmSchema,
      ...financeSchema,
      ...institutionSchema
    ];
    schemaInitPromise = (async()=>{
      await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));
      await initializeCardCatalog(env);
    })().catch(error=>{schemaInitPromise=undefined;throw error;});
  }
  await schemaInitPromise;
}

const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://www.google.com https://cdn.jsdelivr.net; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403, 'Güvenlik kontrolü başarısız.');
}
async function requireCard(env, id) {
  const card = await env.DB.prepare('SELECT id FROM cards WHERE id = ?').bind(id).first();
  if (!card) throw new ApiError(404, 'Kart bulunamadı.');
}
async function requireStatement(env, id) {
  const statement = await env.DB.prepare('SELECT id, amount_kurus FROM statements WHERE id = ?').bind(id).first();
  if (!statement) throw new ApiError(404, 'Ekstre bulunamadı.');
  return statement;
}
async function paidTotal(env, id) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(amount_kurus), 0) AS sum_kurus FROM payments WHERE statement_id = ?').bind(id).first();
  return row?.sum_kurus || 0;
}
async function cardInput(data,env) {
  const d=parseCardDetails(data);
  if(d.institution_id){
    const institution=await env.DB.prepare('SELECT name,short_name,is_active FROM institutions WHERE id=?')
      .bind(d.institution_id).first();
    if(!institution||!institution.is_active)throw new ApiError(400,'Seçilen kurum bulunamadı veya pasif.');
    d.bank=institution.short_name||institution.name;
  }
  return d;
}

function statementInput(data) {
  return {
    card_id: idText(data.card_id),
    period: monthPeriod(data.period),
    amount_kurus: positiveMoney(data.amount_kurus, true),
    due_date: isoDate(data.due_date),
    note: optionalText(data.note)
  };
}
function paymentInput(data) {
  return {
    statement_id: idText(data.statement_id),
    amount_kurus: positiveMoney(data.amount_kurus),
    paid_on: isoDate(data.paid_on),
    note: optionalText(data.note)
  };
}
async function route(request, env) {
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname;
  if (!secretsReady(env)) {
    // Kurulum tanısı: gizli değerleri veya uzunluklarını asla döndürmeyin.
    const problems = [];
    if (typeof env.APP_PASSWORD !== 'string') problems.push('APP_PASSWORD Production ortamında bulunamadı');
    else if (env.APP_PASSWORD.length < 12) problems.push('APP_PASSWORD en az 12 karakter olmalı');
    if (typeof env.SESSION_SECRET !== 'string') problems.push('SESSION_SECRET Production ortamında bulunamadı');
    else if (env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET en az 32 karakter olmalı');
    throw new ApiError(503, problems.join('; ') || 'Giriş ayarları eksik.');
  }
  if (!env.DB) throw new ApiError(503, 'Cloudflare D1 veritabanı bağlı değil.');
  await ensureSchema(env);
  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(request);
  if (path === '/api/session' && method === 'GET') { const role=await getSessionRole(request,env); return json({ authenticated:!!role, role }); }
  if (path === '/api/login' && method === 'POST') {
    const cookie = await login(request, env);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie() });
  const role = await getSessionRole(request,env);
  if (!role) throw new ApiError(401, 'Oturum açmanız gerekiyor.');
  if (role === 'viewer' && !['GET','HEAD'].includes(method)) throw new ApiError(403, 'Salt okunur yetkiyle kayıt değiştirilemez.');
  if (path === '/api/audit' && role !== 'admin') throw new ApiError(403, 'Bu alan yalnızca yöneticiye açıktır.');
  if (path === '/api/finance' || path === '/api/audit' || path.startsWith('/api/accounts') ||
      path.startsWith('/api/entries') || path.startsWith('/api/instruments') ||
      path.startsWith('/api/reminders/')) {
    const result=await financeRoute(request,env,path,method);
    return json(result,method==='POST' ? 201 : 200);
  }
  if (path === '/api/firms' || path.startsWith('/api/firms/') || path === '/api/firm-movements' || path.startsWith('/api/firm-movements/')) {
    const result = await firmRoute(request, env, path, method);
    return result instanceof Response ? result : json(result, method === 'POST' ? 201 : 200);
  }
  if (path === '/api/institutions' || path.startsWith('/api/institutions/')) {
    const result=await institutionRoute(request,env,path,method,role);
    return json(result,method==='POST'?201:200);
  }
  if (path === '/api/data' && method === 'GET') {
    const [cards, statements, payments] = await Promise.all([
      env.DB.prepare('SELECT * FROM cards ORDER BY created_at DESC, id DESC').all(),
      env.DB.prepare('SELECT * FROM statements ORDER BY due_date ASC, id ASC').all(),
      env.DB.prepare('SELECT * FROM payments ORDER BY paid_on DESC, created_at DESC, id DESC').all()
    ]);
    return json({ cards: cards.results.map(c=>enrichCard(c,istanbulDate())), statements: statements.results, payments: payments.results });
  }
  if (path === '/api/cards' && method === 'POST') {
    const d = await cardInput(await readJSON(request),env);
    const fields=['id',...cardDetailsKeys], values=[crypto.randomUUID(),...cardDetailsKeys.map(k=>d[k])];
    await env.DB.prepare('INSERT INTO cards('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')')
      .bind(...values).run();
    return json({ ok:true },201);
  }
  const cardMatch = path.match(/^\/api\/cards\/([a-f0-9-]{36})$/);
  if (cardMatch) {
    const id = idText(cardMatch[1]);
    if (method === 'PATCH') {
      await requireCard(env, id);
      const d = await cardInput(await readJSON(request),env);
      await env.DB.prepare('UPDATE cards SET '+cardDetailsKeys.map(k=>k+'=?').join(',')+' WHERE id=?')
        .bind(...cardDetailsKeys.map(k=>d[k]),id).run();
      return json({ ok:true });
    }
    if (method === 'DELETE') {
      await requireCard(env, id);
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM statements WHERE card_id = ?').bind(id).first();
      if (count?.n) throw new ApiError(409, 'Bu karta ait ekstre var. Önce ekstreleri silin.');
      await env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/statements' && method === 'POST') {
    const d = statementInput(await readJSON(request));
    await requireCard(env, d.card_id);
    const exists = await env.DB.prepare('SELECT id FROM statements WHERE card_id = ? AND period = ?').bind(d.card_id, d.period).first();
    if (exists) throw new ApiError(409, 'Bu karta ait bu dönem için zaten ekstre var.');
    await env.DB.prepare('INSERT INTO statements(id, card_id, period, amount_kurus, due_date, note) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), d.card_id, d.period, d.amount_kurus, d.due_date, d.note).run();
    return json({ ok: true }, 201);
  }
  const statementMatch = path.match(/^\/api\/statements\/([a-f0-9-]{36})$/);
  if (statementMatch) {
    const id = idText(statementMatch[1]);
    if (method === 'PATCH') {
      await requireStatement(env, id);
      const d = statementInput(await readJSON(request));
      await requireCard(env, d.card_id);
      if (d.amount_kurus < await paidTotal(env, id)) throw new ApiError(409, 'Ekstre tutarı kayıtlı ödemelerden düşük olamaz.');
      const existing = await env.DB.prepare('SELECT id FROM statements WHERE card_id = ? AND period = ? AND id != ?').bind(d.card_id, d.period, id).first();
      if (existing) throw new ApiError(409, 'Bu karta ait bu dönem için zaten ekstre var.');
      await env.DB.prepare('UPDATE statements SET card_id=?, period=?, amount_kurus=?, due_date=?, note=? WHERE id=?').bind(d.card_id, d.period, d.amount_kurus, d.due_date, d.note, id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await requireStatement(env, id);
      if (await paidTotal(env, id)) throw new ApiError(409, 'Ödemesi olan ekstreyi silemezsiniz. Önce ödemeleri silin.');
      const exists = await env.DB.prepare('SELECT id FROM payments WHERE statement_id = ? LIMIT 1').bind(id).first();
      if (exists) throw new ApiError(409, 'Ödemesi olan ekstreyi silemezsiniz. Önce ödemeleri silin.');
      await env.DB.prepare('DELETE FROM statements WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/payments' && method === 'POST') {
    const d = paymentInput(await readJSON(request));
    const s = await requireStatement(env, d.statement_id);
    if (d.amount_kurus > s.amount_kurus - await paidTotal(env, s.id)) throw new ApiError(409, 'Ödeme kalan ekstre borcundan büyük olamaz.');
    await env.DB.prepare('INSERT INTO payments(id, statement_id, amount_kurus, paid_on, note) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), d.statement_id, d.amount_kurus, d.paid_on, d.note).run();
    return json({ ok: true }, 201);
  }
  const paymentMatch = path.match(/^\/api\/payments\/([a-f0-9-]{36})$/);
  if (paymentMatch && method === 'DELETE') {
    const id = idText(paymentMatch[1]);
    const p = await env.DB.prepare('SELECT id FROM payments WHERE id=?').bind(id).first();
    if (!p) throw new ApiError(404, 'Ödeme bulunamadı.');
    await env.DB.prepare('DELETE FROM payments WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  throw new ApiError(404, 'İstenen işlem bulunamadı.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        const response=await route(request, env);
        if (['POST','PATCH','DELETE'].includes(request.method) &&
            !['/api/login','/api/logout'].includes(url.pathname) && response.ok) {
          try {
            const role=await getSessionRole(request,env);
            if(role) await env.DB.prepare('INSERT INTO audit_events(id,role,method,entity,entity_id) VALUES(?,?,?,?,?)')
              .bind(crypto.randomUUID(),role,request.method,url.pathname.split('/').slice(0,3).join('/'),
                url.pathname.split('/')[3]||null).run();
          }catch(error){console.error('Audit event write failed',error?.name||'Error');}
        }
        return response;
      }
      catch (e) {
        if (e instanceof ApiError) return json({ error: e.message }, e.status);
        console.error('API error:', e);
        return json({ error: 'Sunucuda beklenmeyen hata oluştu.' }, 500);
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
    const result = await env.ASSETS.fetch(request);
    const headers = new Headers(result.headers);
    for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
    if (url.pathname === '/' || url.pathname === '/index.html') headers.set('Cache-Control', 'no-store');
    return new Response(result.body, { status: result.status, headers });
  },
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    await createReminders(env,new Date(event.scheduledTime||Date.now()));
    try { await backupPrivateR2(env,new Date(event.scheduledTime||Date.now())); }
    catch (error) { console.error('Scheduled private backup failed',error?.name||'Error'); }
  }
};
