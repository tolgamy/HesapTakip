import { ApiError, requiredText, optionalText, positiveMoney, isoDate, idText, readJSON } from './validation.js';
import { correctionStatement } from './corrections.js';

export const financeSchema = [
  `CREATE TABLE IF NOT EXISTS cash_accounts(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('cash','bank')),
    opening_kurus INTEGER NOT NULL CHECK(opening_kurus>=0), note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cash_entries(
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK(direction IN ('in','out')),
    amount_kurus INTEGER NOT NULL CHECK(amount_kurus>0),
    category TEXT NOT NULL CHECK(category IN ('income','expense','other')),
    entry_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cash_entries_account ON cash_entries(account_id)`,
  `CREATE TABLE IF NOT EXISTS instruments(
    id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('check','note')),
    direction TEXT NOT NULL CHECK(direction IN ('payable','receivable')),
    party TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
    amount_kurus INTEGER NOT NULL CHECK(amount_kurus>0),
    issue_date TEXT NOT NULL, due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled','returned','cancelled')),
    note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_instruments_due ON instruments(status,due_date)`,
  `CREATE TABLE IF NOT EXISTS reminders(
    id TEXT PRIMARY KEY, dedup_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL, subject TEXT NOT NULL, due_date TEXT NOT NULL,
    amount_kurus INTEGER NOT NULL, offset_days INTEGER NOT NULL,
    generated_at TEXT NOT NULL DEFAULT(datetime('now')), read_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reminders_recent ON reminders(generated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS audit_events(
    id TEXT PRIMARY KEY, role TEXT NOT NULL, method TEXT NOT NULL,
    entity TEXT NOT NULL, entity_id TEXT, occurred_at TEXT NOT NULL DEFAULT(datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_events(occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS backup_runs(
    id TEXT PRIMARY KEY, state TEXT NOT NULL, object_key TEXT,
    detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT(datetime('now'))
  )`
];

// Safe additive association only: existing account IDs, balances and movements remain unchanged.
export async function initializeFinanceAccountLinks(env) {
  const columns=(await env.DB.prepare('PRAGMA table_info(cash_accounts)').all()).results.map(c=>c.name);
  if(!columns.includes('institution_id')){
    try{await env.DB.prepare('ALTER TABLE cash_accounts ADD COLUMN institution_id TEXT').run();}
    catch(error){if(!/duplicate column name/i.test(String(error)))throw error;}
  }
}
function accountInstitutionId(value){
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(value))
    throw new ApiError(400,'Banka/ödeme kuruluşu seçimi geçersiz.');
  return value;
}
async function verifyAccountInstitution(env,id){
  if(!id)return;
  const row=await env.DB.prepare("SELECT id FROM institutions WHERE id=? AND is_active=1").bind(id).first();
  if(!row)throw new ApiError(400,'Seçilen banka veya ödeme kuruluşu aktif değil.');
}
export function accountBalance(account, entries) {
  return Number(account.opening_kurus) + entries.filter(e=>e.account_id===account.id)
    .reduce((n,e)=>n+(e.direction==='in'?e.amount_kurus:-e.amount_kurus),0);
}
export function cashSummary(entries) {
  return entries.reduce((sum,e)=>{
    if(e.category==='income' && e.direction==='in')sum.income+=e.amount_kurus;
    if(e.category==='expense' && e.direction==='out')sum.expense+=e.amount_kurus;
    return sum;
  },{income:0,expense:0});
}
const okEnum=(v,allowed,label)=>{if(!allowed.includes(v))throw new ApiError(400,label+' geçersiz.');return v;};
const finiteText=(v,label,max)=>requiredText(v,label,max);
function accountInput(d){
  return {name:finiteText(d.name,'Hesap adı',100),type:okEnum(d.type,['cash','bank'],'Hesap türü'),
    opening_kurus:positiveMoney(d.opening_kurus,true),note:optionalText(d.note),
    institution_id:accountInstitutionId(d.institution_id)};
}
function entryInput(d){
  const direction=okEnum(d.direction,['in','out'],'İşlem yönü');
  const category=okEnum(d.category,['income','expense','other'],'İşlem kategorisi');
  if((category==='income'&&direction!=='in')||(category==='expense'&&direction!=='out'))
    throw new ApiError(400,'Gelir giriş, gider çıkış olmalı.');
  return {account_id:idText(d.account_id),direction,category,
    amount_kurus:positiveMoney(d.amount_kurus),entry_date:isoDate(d.entry_date),note:optionalText(d.note)};
}
function paperInput(d){
  const type=okEnum(d.type,['check','note'],'Evrak türü');
  const direction=okEnum(d.direction,['payable','receivable'],'Evrak yönü');
  const issue_date=isoDate(d.issue_date),due_date=isoDate(d.due_date);
  if(due_date<issue_date)throw new ApiError(400,'Vade tarihi düzenleme tarihinden önce olamaz.');
  return {type,direction,party:finiteText(d.party,'Firma/kişi',120),
    reference:optionalText(d.reference,70),amount_kurus:positiveMoney(d.amount_kurus),
    issue_date,due_date,note:optionalText(d.note)};
}
async function accountExists(env,id){
  const r=await env.DB.prepare('SELECT id,opening_kurus FROM cash_accounts WHERE id=?').bind(id).first();
  if(!r)throw new ApiError(404,'Kasa/banka hesabı bulunamadı.');
  return r;
}
export async function financeRoute(request,env,path,method) {
  if(path==='/api/finance'&&method==='GET'){
    const results=await Promise.all([
      env.DB.prepare('SELECT * FROM cash_accounts ORDER BY name COLLATE NOCASE').all(),
      env.DB.prepare('SELECT * FROM cash_entries ORDER BY entry_date DESC,created_at DESC,id DESC').all(),
      env.DB.prepare('SELECT * FROM instruments ORDER BY due_date ASC').all(),
      env.DB.prepare('SELECT * FROM reminders ORDER BY generated_at DESC,id DESC LIMIT 200').all(),
      env.DB.prepare('SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 20').all()
    ]);
    return {accounts:results[0].results,entries:results[1].results,
      instruments:results[2].results,reminders:results[3].results,backupRuns:results[4].results};
  }
  if(path==='/api/audit'&&method==='GET'){
    const r=await env.DB.prepare('SELECT id,role,method,entity,entity_id,occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 200').all();
    return {events:r.results};
  }
  if(path==='/api/accounts'&&method==='POST'){
    const d=accountInput(await readJSON(request));
    await verifyAccountInstitution(env,d.institution_id);
    await env.DB.prepare('INSERT INTO cash_accounts(id,name,type,opening_kurus,note,institution_id) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),d.name,d.type,d.opening_kurus,d.note,d.type==='bank'?d.institution_id:null).run();
    return {ok:true};
  }
  const am=path.match(/^\/api\/accounts\/([a-f0-9-]{36})$/);
  if(am){
    const id=idText(am[1]);await accountExists(env,id);
    if(method==='PATCH'){
      const payload=await readJSON(request),name=finiteText(payload.name,'Hesap adı',100),note=optionalText(payload.note);
      const original=await env.DB.prepare('SELECT * FROM cash_accounts WHERE id=?').bind(id).first();
      const opening=payload.opening_kurus===undefined?original.opening_kurus:
        positiveMoney(payload.opening_kurus,true);
      const institution=payload.institution_id===undefined?original.institution_id:
        accountInstitutionId(payload.institution_id);
      if(institution&&institution!==original.institution_id)await verifyAccountInstitution(env,institution);
      const accountEntries=(await env.DB.prepare(
        'SELECT account_id,direction,amount_kurus FROM cash_entries WHERE account_id=?'
      ).bind(id).all()).results;
      if(accountBalance(original,accountEntries)+opening-original.opening_kurus<0)
        throw new ApiError(409,'Yeni açılış bakiyesi mevcut hesabı eksiye düşüremez.');
      await env.DB.batch([
        env.DB.prepare('UPDATE cash_accounts SET name=?,note=?,opening_kurus=?,institution_id=? WHERE id=?')
          .bind(name,note,opening,original.type==='bank'?institution:null,id),
        correctionStatement(env,'cash_account',id,original,
          {...original,name,note,opening_kurus:opening,institution_id:original.type==='bank'?institution:null})
      ]);
      return {ok:true};
    }
    if(method==='DELETE'){
      const r=await env.DB.prepare('SELECT COUNT(*) AS n FROM cash_entries WHERE account_id=?').bind(id).first();
      if(r.n)throw new ApiError(409,'Önce bu hesabın hareketlerini silin.');
      await env.DB.prepare('DELETE FROM cash_accounts WHERE id=?').bind(id).run();return {ok:true};
    }
  }
  if(path==='/api/entries'&&method==='POST'){
    const d=entryInput(await readJSON(request)),account=await accountExists(env,d.account_id);
    const id=crypto.randomUUID();
    if(d.direction==='out'){
      const out=await env.DB.prepare(`INSERT INTO cash_entries(id,account_id,direction,amount_kurus,category,entry_date,note)
        SELECT ?,?,?,?,?,?,? WHERE
        (SELECT a.opening_kurus+COALESCE(SUM(CASE WHEN e.direction='in' THEN e.amount_kurus ELSE -e.amount_kurus END),0)
          FROM cash_accounts a LEFT JOIN cash_entries e ON a.id=e.account_id WHERE a.id=? GROUP BY a.id)>=?`)
        .bind(id,d.account_id,d.direction,d.amount_kurus,d.category,d.entry_date,d.note,d.account_id,d.amount_kurus).run();
      if(!out.meta?.changes)throw new ApiError(409,'Hesap bakiyesi bu çıkış için yetersiz.');
    }else{
      await env.DB.prepare('INSERT INTO cash_entries(id,account_id,direction,amount_kurus,category,entry_date,note) VALUES(?,?,?,?,?,?,?)')
        .bind(id,d.account_id,d.direction,d.amount_kurus,d.category,d.entry_date,d.note).run();
    }
    return {ok:true};
  }
  const em=path.match(/^\/api\/entries\/([a-f0-9-]{36})$/);
  if(em&&method==='PATCH'){
    const id=idText(em[1]);
    const old=await env.DB.prepare(
      'SELECT id,account_id,direction,amount_kurus,category,entry_date,note FROM cash_entries WHERE id=?'
    ).bind(id).first();
    if(!old)throw new ApiError(404,'Hareket bulunamadı.');
    const linked=await env.DB.prepare('SELECT id FROM linked_settlements WHERE cash_entry_id=?')
      .bind(id).first();
    if(linked)throw new ApiError(409,'Bu banka/kasa hareketi bir cari tahsilata veya ödemeye bağlıdır. Düzenlemeyi ilgili firma hareketinden yapın.');
    const payload=await readJSON(request);
    if(payload.account_id&&payload.account_id!==old.account_id)
      throw new ApiError(400,'Hareketin bağlı hesabı değiştirilemez.');
    const d=entryInput({...payload,account_id:old.account_id,
      direction:payload.direction??old.direction,category:payload.category??old.category});
    const account=await accountExists(env,old.account_id);
    const entries=(await env.DB.prepare(
      'SELECT account_id,direction,amount_kurus FROM cash_entries WHERE account_id=?'
    ).bind(old.account_id).all()).results;
    const existing=accountBalance(account,entries);
    const difference=(d.direction==='in'?d.amount_kurus:-d.amount_kurus)-
      (old.direction==='in'?old.amount_kurus:-old.amount_kurus);
    if(existing+difference<0)
      throw new ApiError(409,'Bu düzeltme banka/kasa bakiyesini eksiye düşürür.');
    const updated={...old,direction:d.direction,amount_kurus:d.amount_kurus,
      category:d.category,entry_date:d.entry_date,note:d.note};
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE cash_entries SET direction=?,amount_kurus=?,category=?,entry_date=?,note=? WHERE id=?'
      ).bind(d.direction,d.amount_kurus,d.category,d.entry_date,d.note,id),
      correctionStatement(env,'cash_entry',id,old,updated)
    ]);
    return {ok:true,balance:existing+difference};
  }
  if(em&&method==='DELETE'){
    const id=idText(em[1]);
    const entry=await env.DB.prepare('SELECT id,account_id,direction,amount_kurus FROM cash_entries WHERE id=?').bind(id).first();
    if(!entry)throw new ApiError(404,'Hareket bulunamadı.');
    const linked=await env.DB.prepare('SELECT id FROM linked_settlements WHERE cash_entry_id=?')
      .bind(id).first();
    if(linked)throw new ApiError(409,'Bu hareket bir firma tahsilatı/ödemesine bağlıdır. Önce ilgili cari hareketi silin.');
    if(entry.direction==='in'){
      const acc=await accountExists(env,entry.account_id);
      const es=(await env.DB.prepare('SELECT * FROM cash_entries WHERE account_id=?').bind(acc.id).all()).results;
      if(accountBalance(acc,es)<entry.amount_kurus)throw new ApiError(409,'Bu girişi silmek bakiyeyi eksiye düşürür.');
    }
    await env.DB.prepare('DELETE FROM cash_entries WHERE id=?').bind(id).run();return {ok:true};
  }
  if(path==='/api/instruments'&&method==='POST'){
    const d=paperInput(await readJSON(request));
    await env.DB.prepare('INSERT INTO instruments(id,type,direction,party,reference,amount_kurus,issue_date,due_date,note) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),d.type,d.direction,d.party,d.reference,d.amount_kurus,d.issue_date,d.due_date,d.note).run();
    return {ok:true};
  }
  const pm=path.match(/^\/api\/instruments\/([a-f0-9-]{36})$/);
  if(pm){
    const id=idText(pm[1]),p=await env.DB.prepare('SELECT id,status FROM instruments WHERE id=?').bind(id).first();
    if(!p)throw new ApiError(404,'Çek/senet bulunamadı.');
    if(method==='PATCH'){
      const data=await readJSON(request),status=okEnum(data.status,['pending','settled','returned','cancelled'],'Evrak durumu');
      await env.DB.prepare('UPDATE instruments SET status=? WHERE id=?').bind(status,id).run();return {ok:true};
    }
    if(method==='DELETE'){
      if(p.status!=='pending')throw new ApiError(409,'İşlenmiş evrakı silemezsiniz; durum geçmişini koruyun.');
      await env.DB.prepare('DELETE FROM instruments WHERE id=?').bind(id).run();return {ok:true};
    }
  }
  const rm=path.match(/^\/api\/reminders\/([a-f0-9-]{36})\/read$/);
  if(rm&&method==='POST'){
    const id=idText(rm[1]);
    await env.DB.prepare("UPDATE reminders SET read_at=datetime('now') WHERE id=?").bind(id).run();return {ok:true};
  }
  throw new ApiError(404,'İstenen finans işlemi bulunamadı.');
}
