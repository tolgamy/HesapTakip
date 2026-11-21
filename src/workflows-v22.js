import {ApiError,requiredText,positiveMoney,isoDate,idText,readJSON} from './validation.js';

export const workflowSchema=[
 "CREATE TABLE IF NOT EXISTS firm_profiles(firm_id TEXT PRIMARY KEY REFERENCES firms(id) ON DELETE RESTRICT,"+
 "description TEXT NOT NULL DEFAULT '',products TEXT NOT NULL DEFAULT '',conditions TEXT NOT NULL DEFAULT '',"+
 "urgent_notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS archived_platforms(firm_id TEXT PRIMARY KEY REFERENCES firms(id) ON DELETE RESTRICT,"+
 "firm_name TEXT NOT NULL,archived_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS archived_pos_firms(firm_id TEXT PRIMARY KEY REFERENCES firms(id) ON DELETE RESTRICT,"+
 "firm_name TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS archived_suppliers(firm_id TEXT PRIMARY KEY REFERENCES firms(id) ON DELETE RESTRICT,"+
 "firm_name TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS payment_plans(id TEXT PRIMARY KEY,name TEXT NOT NULL,purpose TEXT NOT NULL,"+
 "total_kurus INTEGER NOT NULL CHECK(total_kurus>0),monthly_kurus INTEGER NOT NULL CHECK(monthly_kurus>0),"+
 "installment_count INTEGER NOT NULL CHECK(installment_count BETWEEN 1 AND 120),first_due TEXT NOT NULL,"+
 "note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE TABLE IF NOT EXISTS payment_plan_dues(id TEXT PRIMARY KEY,"+
 "plan_id TEXT NOT NULL REFERENCES payment_plans(id) ON DELETE RESTRICT,installment_index INTEGER NOT NULL,"+
 "due_date TEXT NOT NULL,amount_kurus INTEGER NOT NULL CHECK(amount_kurus>0),paid_on TEXT,cash_entry_id TEXT UNIQUE,"+
 "note TEXT NOT NULL DEFAULT '',UNIQUE(plan_id,installment_index))",
 "CREATE INDEX IF NOT EXISTS idx_payment_plan_dues_plan ON payment_plan_dues(plan_id,due_date)"
];
const txt=(x,label,max=4000)=>{
 if(x===undefined||x===null)return '';
 if(typeof x!=='string'||x.length>max)throw new ApiError(400,label+' en fazla '+max+' karakter olmalı.');
 return x.trim();
};
async function firm(env,id){
 const x=await env.DB.prepare('SELECT id,name,category,receivable_group FROM firms WHERE id=?').bind(id).first();
 if(!x)throw new ApiError(404,'Firma bulunamadı.');return x;
}
export async function firmProfileRoute(request,env,path,method){
 if(path==='/api/firm-profiles'&&method==='GET'){
  const r=await env.DB.prepare('SELECT firm_id,description,products,conditions,urgent_notes,updated_at FROM firm_profiles').all();
  return {profiles:r.results};
 }
 const m=path.match(/^\/api\/firm-profiles\/([a-f0-9-]{36})$/);
 if(m&&method==='PATCH'){
  const id=idText(m[1]),f=await firm(env,id);
  if(f.category!=='payable')throw new ApiError(400,'Bu alan tedarikçi firmalar içindir.');
  // Longer supplier notes are safe here: strict JSON/object validation and a bounded payload.
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))
   throw new ApiError(415,'JSON bekleniyor.');
  if(Number(request.headers.get('content-length')||0)>30000)throw new ApiError(413,'Firma bilgileri çok uzun.');
  const raw=await request.text();
  if(raw.length>30000)throw new ApiError(413,'Firma bilgileri çok uzun.');
  let p;
  try{p=JSON.parse(raw);}catch{throw new ApiError(400,'Geçerli firma bilgisi bekleniyor.');}
  if(!p||typeof p!=='object'||Array.isArray(p))throw new ApiError(400,'Geçerli firma bilgisi bekleniyor.');
  const values=[txt(p.description,'Genel tanım'),txt(p.products,'Ürünler'),
   txt(p.conditions,'Alım şartları'),txt(p.urgent_notes,'Acil ihtiyaç notları')];
  await env.DB.prepare("INSERT INTO firm_profiles(firm_id,description,products,conditions,urgent_notes) VALUES(?,?,?,?,?) "+
   "ON CONFLICT(firm_id) DO UPDATE SET description=excluded.description,products=excluded.products,"+
   "conditions=excluded.conditions,urgent_notes=excluded.urgent_notes,updated_at=datetime('now')")
   .bind(id,...values).run();
  return {ok:true};
 }
 throw new ApiError(404,'Firma hakkında işlem bulunamadı.');
}
export async function platformArchiveRoute(request,env,path,method,role){
 if(!['admin','tenant'].includes(role))throw new ApiError(403,'Bu işlem yalnız yöneticiye açıktır.');
 if(path==='/api/platform-archive'&&method==='GET'){
  const rows=await env.DB.prepare('SELECT firm_id,firm_name,archived_at FROM archived_platforms ORDER BY archived_at DESC').all();
  return {archivedPlatforms:rows.results};
 }
 if(path==='/api/platform-archive'&&method==='POST'){
  const p=await readJSON(request),id=idText(p.firm_id),f=await firm(env,id);
  if(f.category!=='receivable'||f.receivable_group!=='platform')
   throw new ApiError(400,'Sadece platform firmaları bu yolla kaldırılır.');
  if(p.confirmation!=='1453'||p.firm_name!==f.name)
   throw new ApiError(403,'Son onay için İstanbul’un fetih yılını 1453 olarak yaz.');
  await env.DB.prepare('INSERT INTO archived_platforms(firm_id,firm_name) VALUES(?,?)').bind(id,f.name).run();
  return {ok:true,archived:true};
 }
 const m=path.match(/^\/api\/platform-archive\/([a-f0-9-]{36})\/restore$/);
 if(m&&method==='POST'){
  const r=await env.DB.prepare('DELETE FROM archived_platforms WHERE firm_id=?').bind(idText(m[1])).run();
  if(!r.meta?.changes)throw new ApiError(404,'Arşiv kaydı bulunamadı.');
  return {ok:true};
 }
 throw new ApiError(404,'Platform arşiv işlemi bulunamadı.');
}
// POS sales archives are reversible and retain every associated financial movement.
export async function posArchiveRoute(request,env,path,method,role){
 if(!['admin','tenant'].includes(role))throw new ApiError(403,'POS hesaplarını yalnız yönetici kaldırabilir.');
 if(path==='/api/pos-archive'&&method==='GET'){
  const rows=await env.DB.prepare('SELECT firm_id,firm_name,archived_at FROM archived_pos_firms ORDER BY archived_at DESC').all();
  return {archivedPos:rows.results};
 }
 if(path==='/api/pos-archive'&&method==='POST'){
  const data=await readJSON(request);
  const id=idText(data.firm_id),item=await firm(env,id);
  if(item.category!=='receivable'||item.receivable_group!=='pos')
   throw new ApiError(400,'Yalnız POS günlük ciro hesapları bu bölümden kaldırılır.');
  if(data.firm_name!==item.name||data.confirmation!=='KALDIR')
   throw new ApiError(403,'POS hesabını kaldırma onayı geçersiz.');
  const previous=await env.DB.prepare('SELECT firm_id FROM archived_pos_firms WHERE firm_id=?').bind(id).first();
  if(previous)throw new ApiError(409,'POS hesabı zaten arşivde.');
  await env.DB.prepare('INSERT INTO archived_pos_firms(firm_id,firm_name) VALUES(?,?)').bind(id,item.name).run();
  return {ok:true,archived:true};
 }
 const restore=path.match(/^\/api\/pos-archive\/([a-f0-9-]{36})\/restore$/);
 if(restore&&method==='POST'){
  const result=await env.DB.prepare('DELETE FROM archived_pos_firms WHERE firm_id=?')
   .bind(idText(restore[1])).run();
  if(!result.meta?.changes)throw new ApiError(404,'Arşivlenen POS hesabı bulunamadı.');
  return {ok:true};
 }
 throw new ApiError(404,'POS arşiv işlemi bulunamadı.');
}
// Supplier removal is a reversible archive, not destruction of settled financial records.
export async function supplierArchiveRoute(request,env,path,method,role){
 if(!['admin','tenant'].includes(role))throw new ApiError(403,'Firma kaldırma ve geri getirme yalnız yöneticiye açıktır.');
 if(path==='/api/supplier-archive'&&method==='GET'){
  const result=await env.DB.prepare(
    'SELECT firm_id,firm_name,archived_at FROM archived_suppliers ORDER BY archived_at DESC,firm_name').all();
  return {archivedSuppliers:result.results};
 }
 if(path==='/api/supplier-archive'&&method==='POST'){
  const p=await readJSON(request);
  const id=idText(p.firm_id),f=await firm(env,id);
  if(f.category!=='payable')throw new ApiError(400,'Bu kaldırma işlemi yalnız borç / tedarikçi firmalar içindir.');
  if(p.firm_name!==f.name||p.confirmation!=='KALDIR')
   throw new ApiError(403,'Silme onayı geçersiz. Firmayı yeniden seçip onaylayın.');
  const existing=await env.DB.prepare('SELECT firm_id FROM archived_suppliers WHERE firm_id=?').bind(id).first();
  if(existing)throw new ApiError(409,'Firma zaten arşivde.');
  await env.DB.prepare('INSERT INTO archived_suppliers(firm_id,firm_name) VALUES(?,?)').bind(id,f.name).run();
  return {ok:true,archived:true};
 }
 const restore=path.match(/^\/api\/supplier-archive\/([a-f0-9-]{36})\/restore$/);
 if(restore&&method==='POST'){
  const id=idText(restore[1]);
  const out=await env.DB.prepare('DELETE FROM archived_suppliers WHERE firm_id=?').bind(id).run();
  if(!out.meta?.changes)throw new ApiError(404,'Arşivlenmiş firma bulunamadı.');
  return {ok:true};
 }
 throw new ApiError(404,'Firma arşivi işlemi bulunamadı.');
}
export function installmentDates(value,count){
 const first=isoDate(value),[y,m,d]=first.split('-').map(Number);
 const dates=[];
 for(let i=0;i<count;i++){
  const base=new Date(Date.UTC(y,m-1+i,1));
  const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
  dates.push(base.getUTCFullYear()+'-'+String(base.getUTCMonth()+1).padStart(2,'0')+
   '-'+String(Math.min(d,last)).padStart(2,'0'));
 }return dates;
}
async function requireDue(env,id){
 const row=await env.DB.prepare('SELECT * FROM payment_plan_dues WHERE id=?').bind(id).first();
 if(!row)throw new ApiError(404,'Taksit bulunamadı.');return row;
}
export async function paymentPlanRoute(request,env,path,method){
 if(path==='/api/payment-plans'&&method==='GET'){
  const [plans,dues]=await Promise.all([
   env.DB.prepare('SELECT * FROM payment_plans ORDER BY created_at DESC,id DESC').all(),
   env.DB.prepare('SELECT * FROM payment_plan_dues ORDER BY due_date,installment_index').all()]);
  return {plans:plans.results,dues:dues.results};
 }
 if(path==='/api/payment-plans'&&method==='POST'){
  const p=await readJSON(request),name=requiredText(p.name,'Kuruluş',120);
  const purpose=requiredText(p.purpose||'Araç','Ödeme amacı',120);
  const count=Number(p.installment_count);
  if(!Number.isInteger(count)||count<1||count>120)throw new ApiError(400,'Taksit sayısı 1-120 arasında olmalı.');
  const monthly=positiveMoney(p.monthly_kurus),calculated=monthly*count;
  const total=p.total_kurus===undefined||p.total_kurus===null||p.total_kurus===''?
   calculated:positiveMoney(p.total_kurus);
  if(!Number.isSafeInteger(total)||total>100000000000||total<=monthly*(count-1))
   throw new ApiError(400,'Toplam tutar, taksitlerle uyuşmuyor. Son taksit sıfır/negatif olamaz.');
  const start=isoDate(p.first_due),note=txt(p.note,'Açıklama',1000);
  const dates=installmentDates(start,count),id=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO payment_plans(id,name,purpose,total_kurus,monthly_kurus,installment_count,first_due,note) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id,name,purpose,total,monthly,count,start,note),
   ...dates.map((date,i)=>env.DB.prepare('INSERT INTO payment_plan_dues(id,plan_id,installment_index,due_date,amount_kurus) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),id,i+1,date,i===count-1?total-monthly*i:monthly))
  ]);
  return {ok:true,id};
 }
 const plan=path.match(/^\/api\/payment-plans\/([a-f0-9-]{36})$/);
 if(plan&&method==='PATCH'){
  const id=idText(plan[1]),original=await env.DB.prepare('SELECT id FROM payment_plans WHERE id=?').bind(id).first();
  if(!original)throw new ApiError(404,'Ödeme planı bulunamadı.');
  const p=await readJSON(request);
  await env.DB.prepare('UPDATE payment_plans SET name=?,purpose=?,note=? WHERE id=?')
   .bind(requiredText(p.name,'Kuruluş',120),requiredText(p.purpose,'Amaç',120),
    txt(p.note,'Açıklama',1000),id).run();
  return {ok:true};
 }
 const pay=path.match(/^\/api\/payment-plan-dues\/([a-f0-9-]{36})\/pay$/);
 if(pay&&method==='POST'){
  const id=idText(pay[1]),due=await requireDue(env,id),p=await readJSON(request);
  if(due.paid_on)throw new ApiError(409,'Bu taksit zaten ödenmiş.');
  const paid=isoDate(p.paid_on),note=txt(p.note,'Not',280),account=p.account_id?idText(p.account_id):null;
  if(!account){
   const r=await env.DB.prepare('UPDATE payment_plan_dues SET paid_on=?,note=? WHERE id=? AND paid_on IS NULL')
    .bind(paid,note,id).run();
   if(!r.meta?.changes)throw new ApiError(409,'Bu taksit zaten ödendi.');
   return {ok:true};
  }
  if(!await env.DB.prepare('SELECT id FROM cash_accounts WHERE id=?').bind(account).first())
   throw new ApiError(404,'Banka/kasa hesabı bulunamadı.');
  const related=await env.DB.prepare('SELECT name FROM payment_plans WHERE id=?').bind(due.plan_id).first();
  const entryId=crypto.randomUUID(),amount=Number(due.amount_kurus);
  const result=await env.DB.batch([
   env.DB.prepare("INSERT INTO cash_entries(id,account_id,direction,amount_kurus,category,entry_date,note) "+
    "SELECT ?,?,'out',?,'other',?,? WHERE EXISTS(SELECT 1 FROM payment_plan_dues WHERE id=? AND paid_on IS NULL) AND "+
    "(SELECT a.opening_kurus+COALESCE(SUM(CASE WHEN e.direction='in' THEN e.amount_kurus ELSE -e.amount_kurus END),0) "+
    "FROM cash_accounts a LEFT JOIN cash_entries e ON a.id=e.account_id WHERE a.id=? GROUP BY a.id)>=?")
    .bind(entryId,account,amount,paid,'Taksit ödemesi: '+(related?.name||'Ödeme planı')+' · '+id+
     (note?' · '+note:''),id,account,amount),
   env.DB.prepare('UPDATE payment_plan_dues SET paid_on=?,cash_entry_id=?,note=? WHERE id=? AND paid_on IS NULL AND EXISTS(SELECT 1 FROM cash_entries WHERE id=?)')
    .bind(paid,entryId,note,id,entryId)
  ]);
  if(!result[1]?.meta?.changes)throw new ApiError(409,'Yetersiz banka bakiyesi veya taksit zaten ödenmiş.');
  return {ok:true};
 }
 const undo=path.match(/^\/api\/payment-plan-dues\/([a-f0-9-]{36})\/undo$/);
 if(undo&&method==='POST'){
  const id=idText(undo[1]),due=await requireDue(env,id);
  if(!due.paid_on)throw new ApiError(409,'Taksit henüz ödenmemiş.');
  const statements=[env.DB.prepare("UPDATE payment_plan_dues SET paid_on=NULL,cash_entry_id=NULL,note='' WHERE id=?").bind(id)];
  if(due.cash_entry_id){
   const entry=await env.DB.prepare('SELECT id FROM cash_entries WHERE id=?').bind(due.cash_entry_id).first();
   if(!entry)throw new ApiError(409,'Bağlı banka hareketi bulunamadı.');
   statements.push(env.DB.prepare('DELETE FROM cash_entries WHERE id=?').bind(due.cash_entry_id));
  }
  await env.DB.batch(statements);
  return {ok:true};
 }
 throw new ApiError(404,'Ödeme planı işlemi bulunamadı.');
}
