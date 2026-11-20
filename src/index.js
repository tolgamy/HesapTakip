import { ApiError, requiredText, optionalText, lastFour, positiveMoney, isoDate, monthPeriod, idText, readJSON } from './validation.js';
import { logoutCookie, secretsReady } from './auth.js';
import { pinSchema, pinStatus, pinRoute, assertPinUnlocked, primePinSession } from './pin-security.js';
import { biometricSchema, biometricRoute } from './biometric-v56.js';
import {memberSchema,getIdentity,loginMember,registerMember,membersRoute,vaultRoute,visibleFirm} from './members-v26.js';
import { financeSchema, financeRoute, initializeFinanceAccountLinks } from './finance.js';
import { correctionSchema,correctionStatement } from './corrections.js';
import { createReminders, backupPrivateR2 } from './scheduler.js';
import { backupAdminRoute } from './backup-v57.js';
import { firmSchema, firmRoute, initializeFirmGroups } from './firms.js';
import { directorySchema, directoryRoute } from './directory.js';
import { billsSchema, billsRoute } from './bills.js';
import {catalogPreferenceSchema,catalogPreferenceRoute} from './catalog-prefs.js';
import {workflowSchema,firmProfileRoute,platformArchiveRoute,posArchiveRoute,supplierArchiveRoute,paymentPlanRoute} from './workflows-v22.js';
import { entityLogoSchema, logoRoute } from './entity-logos.js';
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
      `CREATE TABLE IF NOT EXISTS card_date_history (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        statement_date TEXT,
        due_date TEXT,
        replaced_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_card_date_history_card ON card_date_history(card_id,replaced_at)',
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
      ...institutionSchema,
      ...correctionSchema,
      ...directorySchema,
      ...catalogPreferenceSchema,
      ...workflowSchema,
      ...entityLogoSchema,
      ...memberSchema,
      ...pinSchema,
      ...biometricSchema,
      ...billsSchema
    ];
    schemaInitPromise = (async()=>{
      await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));
      await initializeCardCatalog(env);
      await initializeFirmGroups(env);
      await initializeFinanceAccountLinks(env);
    })().catch(error=>{schemaInitPromise=undefined;throw error;});
  }
  await schemaInitPromise;
}

const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/ https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/; worker-src 'self' blob:; style-src 'self'; img-src 'self' data: blob: https://www.google.com https://cdn.jsdelivr.net; font-src 'self'; connect-src 'self' https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
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
async function cardInput(data,env,existingCardId=null) {
  const d=parseCardDetails(data);
  if(d.institution_id){
    const institution=await env.DB.prepare('SELECT name,short_name,is_active FROM institutions WHERE id=?')
      .bind(d.institution_id).first();
    if(!institution)throw new ApiError(400,'Seçilen kurum bulunamadı.');
    if(!institution.is_active){
     const current=existingCardId?await env.DB.prepare('SELECT institution_id FROM cards WHERE id=?')
       .bind(existingCardId).first():null;
     if(!current||current.institution_id!==d.institution_id)
      throw new ApiError(400,'Yeni kart için gizli veya pasif banka seçilemez.');
    }
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
    else if (env.APP_PASSWORD.length < 8) problems.push('APP_PASSWORD en az 8 karakter olmalı');
    if (typeof env.SESSION_SECRET !== 'string') problems.push('SESSION_SECRET Production ortamında bulunamadı');
    else if (env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET en az 32 karakter olmalı');
    throw new ApiError(503, problems.join('; ') || 'Giriş ayarları eksik.');
  }
  if (!env.DB) throw new ApiError(503, 'Cloudflare D1 veritabanı bağlı değil.');
  await ensureSchema(env);
  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(request);
  if(path==='/api/register'&&method==='POST')return json(await registerMember(request,env),201);
  if(path==='/api/login'&&method==='POST'){
    const cookie=await loginMember(request,env);
    await primePinSession(cookie,env);
    return json({ok:true},200,{'Set-Cookie':cookie});
  }
  if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':logoutCookie()});
  const principal=await getIdentity(request,env);
  if(path==='/api/session'&&method==='GET'){
    const pin=principal?await pinStatus(request,env,principal):{configured:false,locked:true};
    return json(principal?{authenticated:true,role:principal.role,username:principal.username,
      display_name:principal.display_name||'',permissions:principal.permissions,pin}:{authenticated:false,role:null,permissions:[]});
  }
  if(!principal)throw new ApiError(401,'Oturum açmanız gerekiyor.');
  if(path.startsWith('/api/pin/')) return json(await pinRoute(request,env,principal,path,method));
  if(path.startsWith('/api/biometric/')) return json(await biometricRoute(request,env,principal,path,method));
  await assertPinUnlocked(request,env,principal);
  if(path.startsWith('/api/backups/')){
    if(principal.role!=='admin')throw new ApiError(403,'Yedekleme yalnızca yöneticiye açıktır.');
    if(!['GET','POST'].includes(method))throw new ApiError(405,'Geçersiz yedek yöntemi.');
    return json(await backupAdminRoute(env,path,method));
  }
  const role=principal.role;
  if(path==='/api/users'||path.startsWith('/api/users/'))
    return json(await membersRoute(request,env,path,method,principal));
  if(path==='/api/vault'||path.startsWith('/api/vault/'))
    return json(await vaultRoute(request,env,path,method,principal),method==='POST'&&path==='/api/vault'?201:200);
  // V26 users are read-only by default. Permissions are enforced on the server,
  // not just by hiding navigation items. No unapproved user can access data.
  if(role==='user'){
    if(method!=='GET')throw new ApiError(403,'Bu kullanıcı için düzenleme yetkisi verilmedi.');
    const perms=principal.permissions;
    if(path==='/api/bills'&&method==='GET'&&perms.includes('payables'))
      return json(await billsRoute(request,env,path,method));
    if(path==='/api/data'){
      if(!perms.includes('cards'))return json({cards:[],statements:[],payments:[]});
      const [cards,statements,payments]=await Promise.all([
        env.DB.prepare('SELECT * FROM cards ORDER BY created_at DESC,id DESC').all(),
        env.DB.prepare('SELECT * FROM statements ORDER BY due_date ASC,id ASC').all(),
        env.DB.prepare('SELECT * FROM payments ORDER BY paid_on DESC,created_at DESC,id DESC').all()
      ]);
      return json({cards:cards.results.map(c=>enrichCard(c,istanbulDate())),
        statements:statements.results,payments:payments.results});
    }
    if(path==='/api/finance'){
      if(!perms.includes('banking'))return json({accounts:[],entries:[],instruments:[],reminders:[],backupRuns:[]});
      const f=await financeRoute(request,env,path,method);
      return json({...f,backupRuns:[],reminders:[]});
    }
    if(path==='/api/firms'){
      const response=await firmRoute(request,env,path,method);
      const data=await response.json();
      const ids=new Set(data.firms.filter(f=>visibleFirm(f,perms)).map(f=>f.id));
      return json({firms:data.firms.filter(f=>ids.has(f.id)),
        firmMovements:data.firmMovements.filter(m=>ids.has(m.firm_id))});
    }
    if(path==='/api/institutions')return json(await institutionRoute(request,env,path,method,role));
    if(path==='/api/directory'&&perms.includes('directory'))
      return json(await directoryRoute(request,env,path,method));
    if(path==='/api/firm-profiles'&&perms.includes('payables')){
      const data=await firmProfileRoute(request,env,path,method);
      const allowed=await env.DB.prepare("SELECT id FROM firms WHERE category='payable'").all();
      const ids=new Set(allowed.results.map(x=>x.id));
      return json({...data,profiles:(data.profiles||[]).filter(x=>ids.has(x.firm_id))});
    }
    if(path==='/api/payment-plans'&&perms.includes('banking'))
      return json(await paymentPlanRoute(request,env,path,method));
    throw new ApiError(403,'Bu bölüme erişim yetkin yok.');
  }
  if (role === 'viewer' && !['GET','HEAD'].includes(method)) throw new ApiError(403, 'Salt okunur yetkiyle kayıt değiştirilemez.');
  if (path === '/api/audit' && role !== 'admin') throw new ApiError(403, 'Bu alan yalnızca yöneticiye açıktır.');
  if(path==='/api/bills'||path.startsWith('/api/bills/'))
    return json(await billsRoute(request,env,path,method),method==='POST'?201:200);
  if (path === '/api/finance' || path === '/api/audit' || path.startsWith('/api/accounts') ||
      path.startsWith('/api/entries') || path.startsWith('/api/instruments') ||
      path.startsWith('/api/reminders/')) {
    const result=await financeRoute(request,env,path,method);
    return json(result,method==='POST' ? 201 : 200);
  }
  if (path === '/api/settlements' || path === '/api/firms' || path.startsWith('/api/firms/') || path === '/api/firm-movements' || path.startsWith('/api/firm-movements/')) {
    const result = await firmRoute(request, env, path, method);
    return result instanceof Response ? result : json(result, method === 'POST' ? 201 : 200);
  }
  if (path==='/api/firm-profiles'||path.startsWith('/api/firm-profiles/')){
    return json(await firmProfileRoute(request,env,path,method));
  }
  if(path==='/api/supplier-archive'||path.startsWith('/api/supplier-archive/')){
    return json(await supplierArchiveRoute(request,env,path,method,role));
  }
  if(path==='/api/pos-archive'||path.startsWith('/api/pos-archive/')){
    return json(await posArchiveRoute(request,env,path,method,role));
  }
  if(path==='/api/platform-archive'||path.startsWith('/api/platform-archive/')){
    return json(await platformArchiveRoute(request,env,path,method,role));
  }
  if(path==='/api/payment-plans'||path.startsWith('/api/payment-plans/')||
     path.startsWith('/api/payment-plan-dues/')){
    return json(await paymentPlanRoute(request,env,path,method));
  }
  if (path === '/api/catalog-prefs') {
    return json(await catalogPreferenceRoute(request,env,path,method,role));
  }
  if (path === '/api/directory' || path.startsWith('/api/directory/')) {
    const result=await directoryRoute(request,env,path,method);
    return json(result,method==='POST'?201:200);
  }
  if (path === '/api/logos') {
    const result=await logoRoute(request,env,path,method);
    return json(result,method==='POST'?201:200);
  }
  if (path === '/api/institutions' || path.startsWith('/api/institutions/')) {
    const result=await institutionRoute(request,env,path,method,role);
    return json(result,method==='POST'?201:200);
  }
  if(path==='/api/corrections'&&method==='GET'){
    if(role!=='admin')throw new ApiError(403,'Düzeltme geçmişini yalnızca yönetici görebilir.');
    const rows=await env.DB.prepare(
      'SELECT id,record_type,record_id,before_json,after_json,corrected_at FROM correction_log ORDER BY corrected_at DESC,id DESC LIMIT 100'
    ).all();
    return json({corrections:rows.results});
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
  const renewalMatch=path.match(/^\/api\/cards\/([a-f0-9-]{36})\/renew-dates$/);
  if(renewalMatch&&method==='POST'){
    const id=idText(renewalMatch[1]);
    const before=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(id).first();
    if(!before)throw new ApiError(404,'Kredi kartı bulunamadı.');
    if((before.card_type||'credit')!=='credit')
      throw new ApiError(400,'Hesap kesim tarihleri yalnız kredi kartları için güncellenebilir.');
    const body=await readJSON(request);
    const statement=isoDate(body.statement_date),due=isoDate(body.due_date);
    if(due<statement)throw new ApiError(400,'Son ödeme tarihi hesap kesim tarihinden önce olamaz.');
    if(before.current_statement_date&&statement<=before.current_statement_date)
      throw new ApiError(409,'Yeni kesim tarihi önceki hesap kesim tarihinden sonra olmalı.');
    const changes=[];
    if(before.current_statement_date||before.current_due_date)
      changes.push(env.DB.prepare('INSERT INTO card_date_history(id,card_id,statement_date,due_date) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),id,before.current_statement_date||null,before.current_due_date||null));
    changes.push(env.DB.prepare('UPDATE cards SET current_statement_date=?,current_due_date=?,statement_day=?,due_day=?,next_statement_date=NULL,next_due_date=NULL WHERE id=?')
      .bind(statement,due,Number(statement.slice(8,10)),Number(due.slice(8,10)),id));
    changes.push(...correctionStatement(env,'card',id,before,{...before,current_statement_date:statement,
      current_due_date:due,statement_day:Number(statement.slice(8,10)),
      due_day:Number(due.slice(8,10)),next_statement_date:null,next_due_date:null}));
    await env.DB.batch(changes);
    return json({ok:true,statement_date:statement,due_date:due});
  }
  const cardHistoryMatch=path.match(/^\/api\/card-date-history\/([a-f0-9-]{36})$/);
  if(cardHistoryMatch&&method==='GET'){
    const id=idText(cardHistoryMatch[1]);await requireCard(env,id);
    const rows=await env.DB.prepare('SELECT statement_date,due_date,replaced_at FROM card_date_history WHERE card_id=? ORDER BY replaced_at DESC,id DESC LIMIT 48').bind(id).all();
    return json({history:rows.results});
  }
  const cardMatch = path.match(/^\/api\/cards\/([a-f0-9-]{36})$/);
  if (cardMatch) {
    const id = idText(cardMatch[1]);
    if (method === 'PATCH') {
      await requireCard(env, id);
      const before=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(id).first();
      const d = await cardInput(await readJSON(request),env,id);
      await env.DB.batch([
        env.DB.prepare('UPDATE cards SET '+cardDetailsKeys.map(k=>k+'=?').join(',')+' WHERE id=?')
          .bind(...cardDetailsKeys.map(k=>d[k]),id),
        correctionStatement(env,'card',id,before,{...before,...d})
      ]);
      return json({ ok:true });
    }
    if (method === 'DELETE') {
      await requireCard(env, id);
      const linked=await env.DB.prepare('SELECT COUNT(*) AS n FROM linked_settlements WHERE card_id=?').bind(id).first();
      if(linked?.n)throw new ApiError(409,'Bu kartla firma ödemesi kaydedilmiş. Önce ilgili firma ödeme hareketlerini silin.');
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
      const before=await env.DB.prepare('SELECT * FROM statements WHERE id=?').bind(id).first();
      const d = statementInput(await readJSON(request));
      await requireCard(env, d.card_id);
      if (d.amount_kurus < await paidTotal(env, id)) throw new ApiError(409, 'Ekstre tutarı kayıtlı ödemelerden düşük olamaz.');
      const existing = await env.DB.prepare('SELECT id FROM statements WHERE card_id = ? AND period = ? AND id != ?').bind(d.card_id, d.period, id).first();
      if (existing) throw new ApiError(409, 'Bu karta ait bu dönem için zaten ekstre var.');
      await env.DB.batch([
        env.DB.prepare('UPDATE statements SET card_id=?, period=?, amount_kurus=?, due_date=?, note=? WHERE id=?')
          .bind(d.card_id, d.period, d.amount_kurus, d.due_date, d.note, id),
        correctionStatement(env,'statement',id,before,{...before,...d})
      ]);
      return json({ ok:true });
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
  if (paymentMatch && method === 'PATCH') {
    const id=idText(paymentMatch[1]);
    const original=await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(id).first();
    if(!original)throw new ApiError(404,'Kart ödemesi bulunamadı.');
    const d=paymentInput({...await readJSON(request),statement_id:original.statement_id});
    const statement=await requireStatement(env,original.statement_id);
    const others=await paidTotal(env,original.statement_id)-original.amount_kurus;
    if(others+d.amount_kurus>statement.amount_kurus)
      throw new ApiError(409,'Düzeltilen ödeme ekstre tutarını aşamaz.');
    await env.DB.batch([
      env.DB.prepare('UPDATE payments SET amount_kurus=?,paid_on=?,note=? WHERE id=?')
       .bind(d.amount_kurus,d.paid_on,d.note,id),
      correctionStatement(env,'card_payment',id,original,
       {...original,amount_kurus:d.amount_kurus,paid_on:d.paid_on,note:d.note})
    ]);
    return json({ok:true});
  }
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
            !['/api/login','/api/logout','/api/register'].includes(url.pathname) && response.ok) {
          try {
            const principal=await getIdentity(request,env);
            if(principal) await env.DB.prepare('INSERT INTO audit_events(id,role,method,entity,entity_id) VALUES(?,?,?,?,?)')
              .bind(crypto.randomUUID(),principal.role,request.method,url.pathname.split('/').slice(0,3).join('/'),
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
    // Explicit PWA content types; the service worker must always be revalidated.
    if (url.pathname === '/manifest.webmanifest') {
      headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
      headers.set('Cache-Control', 'no-cache');
    }
    if (url.pathname === '/version.json') {
      headers.set('Content-Type','application/json; charset=utf-8');
      headers.set('Cache-Control','no-store');
    }
    if (url.pathname === '/sw.js') {
      headers.set('Content-Type', 'text/javascript; charset=utf-8');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Service-Worker-Allowed', '/');
    }
    return new Response(result.body, { status: result.status, headers });
  },
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    await createReminders(env,new Date(event.scheduledTime||Date.now()));
    try { await backupPrivateR2(env,new Date(event.scheduledTime||Date.now())); }
    catch (error) { console.error('Scheduled private backup failed',error?.name||'Error'); }
  }
};
