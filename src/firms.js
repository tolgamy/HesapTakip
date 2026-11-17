import { ApiError, requiredText, optionalText, positiveMoney, isoDate, idText, readJSON } from './validation.js';

export const firmSchema = [
  `CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('payable', 'receivable')),
    phone TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS firm_movements (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK(kind IN ('charge','settlement')),
    amount_kurus INTEGER NOT NULL CHECK(amount_kurus > 0),
    on_date TEXT NOT NULL,
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_firm_movements_firm ON firm_movements(firm_id)',
  'CREATE INDEX IF NOT EXISTS idx_firm_movements_date ON firm_movements(on_date)'
];

export function validCategory(value) {
  if (value !== 'payable' && value !== 'receivable') throw new ApiError(400, 'Firma türü borç veya alacak olmalı.');
  return value;
}
export function validMovementKind(value) {
  if (value !== 'charge' && value !== 'settlement') throw new ApiError(400, 'Hareket türü geçersiz.');
  return value;
}
function firmInput(data) {
  const phone = optionalText(data.phone, 40);
  if (phone && !/^[+0-9 ()-]{5,40}$/.test(phone)) throw new ApiError(400, 'Telefon numarası geçersiz.');
  return {
    name: requiredText(data.name, 'Firma adı', 120),
    category: validCategory(data.category),
    phone, note: optionalText(data.note)
  };
}
function movementInput(data) {
  return {
    firm_id: idText(data.firm_id),
    kind: validMovementKind(data.kind),
    amount_kurus: positiveMoney(data.amount_kurus),
    on_date: isoDate(data.on_date),
    due_date: data.kind === 'charge' && data.due_date ? isoDate(data.due_date) : null,
    note: optionalText(data.note)
  };
}
async function findFirm(env, id) {
  const firm = await env.DB.prepare('SELECT id, category FROM firms WHERE id=?').bind(id).first();
  if (!firm) throw new ApiError(404, 'Firma bulunamadı.');
  return firm;
}
async function balance(env, firmId) {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind='charge' THEN amount_kurus ELSE -amount_kurus END),0) AS balance FROM firm_movements WHERE firm_id=?").bind(firmId).first();
  return Number(row?.balance || 0);
}
export function remainingBalance(movements) {
  return movements.reduce((total,m) => total+(m.kind==='charge'?m.amount_kurus:-m.amount_kurus), 0);
}

export async function firmRoute(request, env, path, method) {
  if (path === '/api/firms' && method === 'GET') {
    const [firms, movements] = await Promise.all([
      env.DB.prepare('SELECT * FROM firms ORDER BY name COLLATE NOCASE ASC, id ASC').all(),
      env.DB.prepare('SELECT * FROM firm_movements ORDER BY on_date DESC, created_at DESC, id DESC').all()
    ]);
    return new Response(JSON.stringify({ firms:firms.results, firmMovements:movements.results }), {
      headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }
    });
  }
  if (path === '/api/firms' && method === 'POST') {
    const d=firmInput(await readJSON(request));
    await env.DB.prepare('INSERT INTO firms(id,name,category,phone,note) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(), d.name,d.category,d.phone,d.note).run();
    return {ok:true};
  }
  const firmMatch=path.match(/^\/api\/firms\/([a-f0-9-]{36})$/);
  if (firmMatch) {
    const id=idText(firmMatch[1]);
    const firm=await findFirm(env,id);
    if (method==='PATCH') {
      const d=firmInput(await readJSON(request));
      if(d.category!==firm.category) throw new ApiError(409,'Firma türü kayıt oluşturulduktan sonra değiştirilemez.');
      await env.DB.prepare('UPDATE firms SET name=?,phone=?,note=? WHERE id=?')
        .bind(d.name,d.phone,d.note,id).run();
      return {ok:true};
    }
    if(method==='DELETE'){
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM firm_movements WHERE firm_id=?').bind(id).first();
      if(count?.n) throw new ApiError(409,'Önce bu firmanın hareketlerini silin.');
      await env.DB.prepare('DELETE FROM firms WHERE id=?').bind(id).run();
      return {ok:true};
    }
  }
  if(path==='/api/firm-movements' && method==='POST'){
    const d=movementInput(await readJSON(request));
    await findFirm(env,d.firm_id);
    const id=crypto.randomUUID();
    if(d.kind==='settlement'){
      // Koşullu INSERT tek SQL ifadesinde kontrol eder; borçtan büyük ödemeyi önler.
      const out=await env.DB.prepare(`INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(CASE WHEN kind='charge' THEN amount_kurus ELSE -amount_kurus END),0)
          FROM firm_movements WHERE firm_id=?) >= ?`)
        .bind(id,d.firm_id,d.kind,d.amount_kurus,d.on_date,d.due_date,d.note,d.firm_id,d.amount_kurus).run();
      if(!out.meta?.changes) throw new ApiError(409,'Ödeme / tahsilat kalan bakiyeden büyük olamaz.');
    } else {
      await env.DB.prepare('INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note) VALUES(?,?,?,?,?,?,?)')
        .bind(id,d.firm_id,d.kind,d.amount_kurus,d.on_date,d.due_date,d.note).run();
    }
    return {ok:true};
  }
  const movementMatch=path.match(/^\/api\/firm-movements\/([a-f0-9-]{36})$/);
  if(movementMatch && method==='DELETE'){
    const id=idText(movementMatch[1]);
    const m=await env.DB.prepare('SELECT firm_id,kind,amount_kurus FROM firm_movements WHERE id=?').bind(id).first();
    if(!m) throw new ApiError(404,'Hareket bulunamadı.');
    if(m.kind==='charge' && await balance(env,m.firm_id) < m.amount_kurus)
      throw new ApiError(409,'Bu borcu/alacağı silmek bakiyeyi eksiye düşürür. Önce ilgili ödeme/tahsilat kayıtlarını silin.');
    await env.DB.prepare('DELETE FROM firm_movements WHERE id=?').bind(id).run();
    return {ok:true};
  }
  throw new ApiError(404,'İstenen firma işlemi bulunamadı.');
}
