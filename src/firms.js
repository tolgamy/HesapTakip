import { ApiError, requiredText, optionalText, positiveMoney, isoDate, idText, readJSON } from './validation.js';
import { correctionStatement } from './corrections.js';

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
  'CREATE INDEX IF NOT EXISTS idx_firm_movements_date ON firm_movements(on_date)',
  `CREATE TABLE IF NOT EXISTS linked_settlements (
    id TEXT PRIMARY KEY,
    movement_id TEXT NOT NULL UNIQUE REFERENCES firm_movements(id) ON DELETE RESTRICT,
    cash_entry_id TEXT UNIQUE REFERENCES cash_entries(id) ON DELETE RESTRICT,
    card_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,
    amount_kurus INTEGER NOT NULL CHECK(amount_kurus > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_linked_settlements_card ON linked_settlements(card_id)'
];

export const receivableGroups=['general','meal','platform','veresiye','person','pos'];
export function validateFirmLogo(value){
 if(value===undefined||value===null||value==='')return '';
 if(typeof value!=='string'||value.length>9500||
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
  throw new ApiError(400,'Logo PNG, JPG veya WebP biçiminde ve 7 KB altında olmalı.');
 return value;
}
function validatePayoutIsPos(value){
 if(value===true||value===1)return 1;
 if(value===undefined||value===null||value===false||value===0)return 0;
 throw new ApiError(400,'Banka/POS seçimi geçersiz.');
}
export function validatePayoutInstitution(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(value))
   throw new ApiError(400,'Banka veya ödeme kuruluşu seçimi geçersiz.');
 return value;
}
async function ensurePayoutInstitution(env,id){
 if(!id)return;
 const row=await env.DB.prepare('SELECT id FROM institutions WHERE id=? AND is_active=1').bind(id).first();
 if(!row)throw new ApiError(400,'Seçilen banka veya ödeme kuruluşu bulunamadı.');
}
export async function initializeFirmGroups(env){
 const cols=(await env.DB.prepare('PRAGMA table_info(firms)').all()).results.map(x=>x.name);
 const additions={
  receivable_group:"TEXT NOT NULL DEFAULT 'general'",
  payout_institution_id:"TEXT",
  payout_is_pos:"INTEGER NOT NULL DEFAULT 0 CHECK(payout_is_pos IN (0,1))",
  logo_data:"TEXT NOT NULL DEFAULT ''"
 };
 for(const [column,definition] of Object.entries(additions)){
  if(cols.includes(column))continue;
  try{await env.DB.prepare('ALTER TABLE firms ADD COLUMN '+column+' '+definition).run();}
  catch(error){if(!/duplicate column name/i.test(String(error)))throw error;}
 }
}
export function validReceivableGroup(value){
 if(!receivableGroups.includes(value))throw new ApiError(400,'Alacak türü geçersiz.');
 return value;
}
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
    receivable_group: data.category==='receivable'?validReceivableGroup(data.receivable_group||'general'):'general',
    phone, note: optionalText(data.note),
    payout_institution_id:validatePayoutInstitution(data.payout_institution_id),
    payout_is_pos:validatePayoutIsPos(data.payout_is_pos),
    logo_data:validateFirmLogo(data.logo_data)
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
  const firm = await env.DB.prepare('SELECT id, category, receivable_group, payout_institution_id, payout_is_pos, logo_data FROM firms WHERE id=?').bind(id).first();
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


async function settleLinked(request,env) {
 const payload=await readJSON(request),firmId=idText(payload.firm_id);
 const amount=positiveMoney(payload.amount_kurus),onDate=isoDate(payload.on_date);
 const note=optionalText(payload.note);
 const accountId=payload.account_id?idText(payload.account_id):null;
 const cardId=payload.card_id?idText(payload.card_id):null;
 if(accountId&&cardId)throw new ApiError(400,'Tek bir ödeme kaynağı seçilmelidir.');
 const firm=await findFirm(env,firmId);
 if(firm.receivable_group==='pos'&&!accountId)
   throw new ApiError(400,'POS tahsilatında banka hesabı seçilmelidir.');
 const left=await balance(env,firmId);
 if(firm.category==='receivable'&&(left<=0||amount>left))
  throw new ApiError(409,'Tahsilat mevcut alacağı aşamaz.');
 if(firm.category==='payable'&&left<=0)
  throw new ApiError(409,'Bu firmada açık borç yok. Fazla ödeme yalnız açık borca karşı kaydedilebilir.');
 const movementId=crypto.randomUUID(),linkId=crypto.randomUUID();
 const statements=[];
 let entryId=null;
 if(accountId){
  const acc=await env.DB.prepare('SELECT id,type,opening_kurus FROM cash_accounts WHERE id=?').bind(accountId).first();
  if(!acc)throw new ApiError(404,'Banka/kasa hesabı bulunamadı.');
  if(firm.receivable_group==='pos'&&acc.type!=='bank')
    throw new ApiError(400,'POS tahsilatı yalnızca banka hesabına işlenebilir.');
  const direction=firm.category==='receivable'?'in':'out';
  if(direction==='out'){
   const cash=await env.DB.prepare(
     "SELECT opening_kurus+COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount_kurus ELSE -amount_kurus END) FROM cash_entries WHERE account_id=?),0) AS balance FROM cash_accounts WHERE id=?"
   ).bind(accountId,accountId).first();
   if(!cash||cash.balance<amount)throw new ApiError(409,'Kasa veya banka bakiyesi bu ödeme için yetersiz.');
  }
  entryId=crypto.randomUUID();
  statements.push(env.DB.prepare(
    'INSERT INTO cash_entries(id,account_id,direction,amount_kurus,category,entry_date,note) VALUES(?,?,?,?,?,?,?)'
   ).bind(entryId,accountId,direction,amount,'other',onDate,
    (firm.category==='receivable'?'Cari tahsilat: ':'Firma ödemesi: ')+firmId+(note?' · '+note:'')));
 }
 if(cardId){
  if(firm.category!=='payable')throw new ApiError(400,'Kredi kartı yalnız firmaya ödeme için seçilebilir.');
  const card=await env.DB.prepare(
    'SELECT id,card_type,currency,credit_limit_kurus,available_limit_kurus FROM cards WHERE id=?'
  ).bind(cardId).first();
  if(!card||!['credit','virtual'].includes(card.card_type||'credit')||(card.currency||'TRY')!=='TRY')
   throw new ApiError(400,'TL kredi kartı seçilmelidir.');
  if(card.available_limit_kurus===null||card.available_limit_kurus<amount)
   throw new ApiError(409,'Kartın kullanılabilir limiti bu ödeme için yetersiz veya girilmemiş.');
  statements.push(env.DB.prepare('UPDATE cards SET available_limit_kurus=available_limit_kurus-? WHERE id=?')
    .bind(amount,cardId));
 }
 statements.unshift(env.DB.prepare(
   'INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note) VALUES(?,?,?,?,?,?,?)'
 ).bind(movementId,firmId,'settlement',amount,onDate,null,note));
 if(accountId||cardId)statements.push(env.DB.prepare(
   'INSERT INTO linked_settlements(id,movement_id,cash_entry_id,card_id,amount_kurus) VALUES(?,?,?,?,?)'
  ).bind(linkId,movementId,entryId,cardId,amount));
 await env.DB.batch(statements);
 return {ok:true,movement_id:movementId};
}

async function correctFirmMovement(env,id,data,extraStatements=[]){
    const old=await env.DB.prepare(
      'SELECT id,firm_id,kind,amount_kurus,on_date,due_date,note FROM firm_movements WHERE id=?'
    ).bind(id).first();
    if(!old)throw new ApiError(404,'Düzenlenecek hareket bulunamadı.');
    // An edit cannot silently change the company or move a sale into a receipt.
    if((data.kind&&data.kind!==old.kind)||
       (data.firm_id&&data.firm_id!==old.firm_id))
      throw new ApiError(400,'Firma ve hareket türü değiştirilemez.');
    const d=movementInput({...data,firm_id:old.firm_id,kind:old.kind});
    const delta=d.amount_kurus-old.amount_kurus;
    const current=await balance(env,old.firm_id);
    const after=current+(old.kind==='charge'?delta:-delta);
    if(after<0){
      const company=await env.DB.prepare('SELECT category FROM firms WHERE id=?').bind(old.firm_id).first();
      if(company?.category!=='payable')
        throw new ApiError(409,'Bu düzeltme tahsil edilen tutarı aşar. Önce ilgili tahsilatı düzeltin.');
    }
    const linked=await env.DB.prepare(
      'SELECT id,cash_entry_id,card_id,amount_kurus FROM linked_settlements WHERE movement_id=?'
    ).bind(id).first();
    // The settlement source stays fixed. Editing the amount/date here updates
    // the bank/cash entry or credit-card available limit in the same transaction.
    if(data.account_id!==undefined||data.card_id!==undefined)
      throw new ApiError(400,'Ödeme kaynağını değiştirmek için önce ilgili hareketi silip yeniden ekleyin.');
    const extra=[];
    if(linked){
      if(old.kind!=='settlement'||linked.amount_kurus!==old.amount_kurus)
        throw new ApiError(409,'Bağlı hareketlerin tutarları uyuşmuyor; kayıt kontrol edilmeli.');
      if(linked.cash_entry_id){
        const entry=await env.DB.prepare(
          'SELECT id,account_id,direction,amount_kurus,category,entry_date,note FROM cash_entries WHERE id=?'
        ).bind(linked.cash_entry_id).first();
        if(!entry||entry.amount_kurus!==old.amount_kurus)
          throw new ApiError(409,'Bağlı banka/kasa hareketi uyuşmuyor.');
        const account=await env.DB.prepare(
          "SELECT opening_kurus+COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount_kurus ELSE -amount_kurus END) FROM cash_entries WHERE account_id=?),0) AS balance FROM cash_accounts WHERE id=?"
        ).bind(entry.account_id,entry.account_id).first();
        if(!account)throw new ApiError(404,'Bağlı banka/kasa bulunamadı.');
        const balanceDelta=(entry.direction==='in'?1:-1)*delta;
        if(account.balance+balanceDelta<0)
          throw new ApiError(409,'Düzeltme bankayı/kasayı eksiye düşürür. Önce hesap hareketlerini kontrol edin.');
        extra.push(env.DB.prepare(
          'UPDATE cash_entries SET amount_kurus=?,entry_date=?,note=? WHERE id=?'
        ).bind(d.amount_kurus,d.on_date,
          (entry.direction==='in'?'Cari tahsilat: ':'Firma ödemesi: ')+old.firm_id+
          (d.note?' · '+d.note:''),entry.id));
      }
      if(linked.card_id){
        const card=await env.DB.prepare(
          'SELECT id,credit_limit_kurus,available_limit_kurus FROM cards WHERE id=?'
        ).bind(linked.card_id).first();
        if(!card||card.available_limit_kurus===null)
          throw new ApiError(409,'Bağlı kartın kullanılabilir limiti bulunamadı.');
        const available=card.available_limit_kurus-delta;
        if(available<0||(card.credit_limit_kurus!==null&&available>card.credit_limit_kurus))
          throw new ApiError(409,'Düzeltme kredi kartının kullanılabilir limitini aşar.');
        extra.push(env.DB.prepare(
          'UPDATE cards SET available_limit_kurus=? WHERE id=?'
        ).bind(available,card.id));
      }
      extra.push(env.DB.prepare('UPDATE linked_settlements SET amount_kurus=? WHERE id=?')
        .bind(d.amount_kurus,linked.id));
    }
    const updated={...old,amount_kurus:d.amount_kurus,on_date:d.on_date,due_date:d.due_date,note:d.note};
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE firm_movements SET amount_kurus=?,on_date=?,due_date=?,note=? WHERE id=?'
      ).bind(d.amount_kurus,d.on_date,d.due_date,d.note,id),
      ...extra,correctionStatement(env,'firm_movement',id,old,updated),...extraStatements
    ]);
    return {ok:true,corrected:true,remaining:after};

}

export async function firmRoute(request, env, path, method) {
 if(path==='/api/settlements'&&method==='POST')return settleLinked(request,env);
  if (path === '/api/firms' && method === 'GET') {
    const [firms, movements] = await Promise.all([
      env.DB.prepare('SELECT * FROM firms WHERE id NOT IN (SELECT firm_id FROM archived_platforms) AND id NOT IN (SELECT firm_id FROM archived_suppliers) AND id NOT IN (SELECT firm_id FROM archived_pos_firms) ORDER BY name COLLATE NOCASE ASC, id ASC').all(),
      env.DB.prepare('SELECT * FROM firm_movements WHERE firm_id NOT IN (SELECT firm_id FROM archived_platforms) AND firm_id NOT IN (SELECT firm_id FROM archived_suppliers) AND firm_id NOT IN (SELECT firm_id FROM archived_pos_firms) ORDER BY on_date DESC, created_at DESC, id DESC').all()
    ]);
    return new Response(JSON.stringify({ firms:firms.results, firmMovements:movements.results }), {
      headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }
    });
  }
  if(path==='/api/firms/with-charge' && method==='POST'){
    const payload=await readJSON(request);
    const d=firmInput({...payload,category:payload.category==='payable'?'payable':'receivable'});
    if(d.category==='receivable'&&!receivableGroups.includes(d.receivable_group))
      throw new ApiError(400,'Alacak türü geçersiz.');
    await ensurePayoutInstitution(env,d.payout_institution_id);
    const id=crypto.randomUUID(), movementId=crypto.randomUUID();
    const m=movementInput({firm_id:id,kind:'charge',amount_kurus:payload.amount_kurus,
      on_date:payload.on_date,due_date:payload.due_date,note:payload.movement_note||''});
    await env.DB.batch([
      env.DB.prepare('INSERT INTO firms(id,name,category,phone,note,receivable_group,payout_institution_id,payout_is_pos,logo_data) VALUES(?,?,?,?,?,?,?,?,?)')
       .bind(id,d.name,d.category,d.phone,d.note,d.receivable_group,d.payout_institution_id,d.payout_is_pos,d.logo_data),
      env.DB.prepare('INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note) VALUES(?,?,?,?,?,?,?)')
       .bind(movementId,id,'charge',m.amount_kurus,m.on_date,m.due_date,m.note)
    ]);
    return {ok:true,id};
  }
  if (path === '/api/firms' && method === 'POST') {
    const d=firmInput(await readJSON(request));
    await ensurePayoutInstitution(env,d.payout_institution_id);
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO firms(id,name,category,phone,note,receivable_group,payout_institution_id,payout_is_pos,logo_data) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id,d.name,d.category,d.phone,d.note,d.receivable_group,d.payout_institution_id,d.payout_is_pos,d.logo_data).run();
    return {ok:true,id};
  }
  const detailsMatch=path.match(/^\/api\/firms\/([a-f0-9-]{36})\/details$/);
  if(detailsMatch&&method==='PATCH'){
    const id=idText(detailsMatch[1]),firm=await findFirm(env,id);
    const payload=await readJSON(request);
    const d=firmInput({...payload,
      receivable_group:payload.receivable_group??firm.receivable_group,
      payout_institution_id:Object.prototype.hasOwnProperty.call(payload,'payout_institution_id')?
        payload.payout_institution_id:firm.payout_institution_id,
      payout_is_pos:Object.prototype.hasOwnProperty.call(payload,'payout_is_pos')?
        payload.payout_is_pos:Number(firm.payout_is_pos||0)===1,
      logo_data:payload.logo_data??firm.logo_data});
    await ensurePayoutInstitution(env,d.payout_institution_id);
    if(d.category!==firm.category)throw new ApiError(409,'Firma türü değiştirilemez.');
    if(!payload.movement)
      throw new ApiError(400,'Düzeltilecek tutar veya yeni tutar girilmedi.');
    let movementId=null;
    if(payload.movement.id){
      movementId=idText(payload.movement.id);
      const found=await env.DB.prepare(
        'SELECT firm_id,kind FROM firm_movements WHERE id=?'
      ).bind(movementId).first();
      if(!found||found.firm_id!==id||found.kind!=='charge')
        throw new ApiError(409,'Seçilen alış/satış hareketi bu hesaba ait değil.');
    }
    const saveFirm=env.DB.prepare(
      'UPDATE firms SET name=?,phone=?,note=?,receivable_group=?,payout_institution_id=?,payout_is_pos=?,logo_data=? WHERE id=?'
    ).bind(d.name,d.phone,d.note,d.receivable_group,d.payout_institution_id,d.payout_is_pos,d.logo_data,id);
    // One batch: if movement amount is invalid, neither firm metadata nor
    // financial balances change. Keep old movement ID and its audit history.
    const movement={
      amount_kurus:payload.movement.amount_kurus,
      on_date:payload.movement.on_date,
      due_date:payload.movement.due_date,
      note:payload.movement.note||''
    };
    if(movementId)return correctFirmMovement(env,movementId,movement,[saveFirm]);
    const exists=await env.DB.prepare('SELECT COUNT(*) AS n FROM firm_movements WHERE firm_id=?')
      .bind(id).first();
    if(exists?.n)throw new ApiError(409,'İlk tutarı eklemek için hareketleri olan hesap seçilemez.');
    const dMove=movementInput({...movement,firm_id:id,kind:'charge'});
    await env.DB.batch([
      saveFirm,
      env.DB.prepare('INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note) VALUES(?,?,?,?,?,?,?)')
       .bind(crypto.randomUUID(),id,'charge',dMove.amount_kurus,dMove.on_date,dMove.due_date,dMove.note)
    ]);
    return {ok:true,remaining:dMove.amount_kurus};
  }
  const firmMatch=path.match(/^\/api\/firms\/([a-f0-9-]{36})$/);
  if (firmMatch) {
    const id=idText(firmMatch[1]);
    const firm=await findFirm(env,id);
    if (method==='PATCH') {
      const payload=await readJSON(request);
      const d=firmInput({...payload,receivable_group:payload.receivable_group??firm.receivable_group,
       payout_institution_id:Object.prototype.hasOwnProperty.call(payload,'payout_institution_id')?payload.payout_institution_id:firm.payout_institution_id,
       payout_is_pos:Object.prototype.hasOwnProperty.call(payload,'payout_is_pos')?
        payload.payout_is_pos:Number(firm.payout_is_pos||0)===1,
      logo_data:payload.logo_data??firm.logo_data});
      await ensurePayoutInstitution(env,d.payout_institution_id);
      if(d.category!==firm.category) throw new ApiError(409,'Firma türü kayıt oluşturulduktan sonra değiştirilemez.');
      await env.DB.prepare('UPDATE firms SET name=?,phone=?,note=?,receivable_group=?,payout_institution_id=?,payout_is_pos=?,logo_data=? WHERE id=?')
        .bind(d.name,d.phone,d.note,d.receivable_group,d.payout_institution_id,d.payout_is_pos,d.logo_data,id).run();
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
    const company=await findFirm(env,d.firm_id);
    const id=crypto.randomUUID();
    if(d.kind==='settlement'){
      // Payable firms may receive an overpayment; receivables remain strictly capped.
      // Guard in a single SQL statement to avoid stale-balance race conditions.
      const out=await env.DB.prepare(`INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE
        (SELECT COALESCE(SUM(CASE WHEN kind='charge' THEN amount_kurus ELSE -amount_kurus END),0)
          FROM firm_movements WHERE firm_id=?) > 0 AND
        (? = 'payable' OR
         (SELECT COALESCE(SUM(CASE WHEN kind='charge' THEN amount_kurus ELSE -amount_kurus END),0)
          FROM firm_movements WHERE firm_id=?) >= ?)`)
        .bind(id,d.firm_id,d.kind,d.amount_kurus,d.on_date,d.due_date,d.note,
          d.firm_id,company.category,d.firm_id,d.amount_kurus).run();
      if(!out.meta?.changes) throw new ApiError(409,'Bu hesapta açık borç/alacak yok veya tahsilat alacağı aşıyor.');
    } else {
      await env.DB.prepare('INSERT INTO firm_movements(id,firm_id,kind,amount_kurus,on_date,due_date,note) VALUES(?,?,?,?,?,?,?)')
        .bind(id,d.firm_id,d.kind,d.amount_kurus,d.on_date,d.due_date,d.note).run();
    }
    return {ok:true};
  }
  const movementMatch=path.match(/^\/api\/firm-movements\/([a-f0-9-]{36})$/);
  if(movementMatch && method==='PATCH'){
    const id=idText(movementMatch[1]);
    return correctFirmMovement(env,id,await readJSON(request));
  }
  if(movementMatch && method==='DELETE'){
    const id=idText(movementMatch[1]);
    const m=await env.DB.prepare('SELECT firm_id,kind,amount_kurus FROM firm_movements WHERE id=?').bind(id).first();
    if(!m) throw new ApiError(404,'Hareket bulunamadı.');
    if(m.kind==='charge' && await balance(env,m.firm_id) < m.amount_kurus)
      throw new ApiError(409,'Bu borcu/alacağı silmek bakiyeyi eksiye düşürür. Önce ilgili ödeme/tahsilat kayıtlarını silin.');
    const linked=await env.DB.prepare('SELECT id,cash_entry_id,card_id,amount_kurus FROM linked_settlements WHERE movement_id=?').bind(id).first();
    if(!linked){await env.DB.prepare('DELETE FROM firm_movements WHERE id=?').bind(id).run();return {ok:true};}
    const reverse=[];
    if(linked.cash_entry_id){
     const entry=await env.DB.prepare('SELECT account_id,direction,amount_kurus FROM cash_entries WHERE id=?')
       .bind(linked.cash_entry_id).first();
     if(!entry)throw new ApiError(409,'Bağlı banka hareketi bulunamadı.');
     if(entry.direction==='in'){
      const cash=await env.DB.prepare(
        "SELECT opening_kurus+COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount_kurus ELSE -amount_kurus END) FROM cash_entries WHERE account_id=?),0) AS balance FROM cash_accounts WHERE id=?"
      ).bind(entry.account_id,entry.account_id).first();
      if(!cash||cash.balance<entry.amount_kurus)
       throw new ApiError(409,'Bu tahsilatı silmek banka/kasa bakiyesini eksiye düşürür.');
     }
     reverse.push(env.DB.prepare('DELETE FROM cash_entries WHERE id=?').bind(linked.cash_entry_id));
    }
    if(linked.card_id){
     const card=await env.DB.prepare('SELECT credit_limit_kurus,available_limit_kurus FROM cards WHERE id=?')
       .bind(linked.card_id).first();
     if(!card||card.available_limit_kurus===null||
        (card.credit_limit_kurus!==null&&card.available_limit_kurus+linked.amount_kurus>card.credit_limit_kurus))
       throw new ApiError(409,'Kart limiti sonradan değişmiş; bağlı ödemeyi güvenli biçimde geri alamıyoruz.');
     reverse.push(env.DB.prepare(
       'UPDATE cards SET available_limit_kurus=available_limit_kurus+? WHERE id=?'
      ).bind(linked.amount_kurus,linked.card_id));
    }
    await env.DB.batch([
     env.DB.prepare('DELETE FROM linked_settlements WHERE id=?').bind(linked.id),
     ...reverse,
     env.DB.prepare('DELETE FROM firm_movements WHERE id=?').bind(id)
    ]);
    return {ok:true};
  }
  throw new ApiError(404,'İstenen firma işlemi bulunamadı.');
}
