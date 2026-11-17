import { ApiError, requiredText, optionalText, readJSON } from './validation.js';
import { institutionSeeds } from './institution-seeds.js';

export const institutionSchema = [
 "CREATE TABLE IF NOT EXISTS institutions ("+
 "id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL DEFAULT '',"+
 "type TEXT NOT NULL CHECK(type IN ('bank','payment')),"+
 "domain TEXT NOT NULL DEFAULT '',search_keywords TEXT NOT NULL DEFAULT '',"+
 "logo_data TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1,"+
 "sort_order INTEGER NOT NULL DEFAULT 500,is_custom INTEGER NOT NULL DEFAULT 0,"+
 "created_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE INDEX IF NOT EXISTS idx_institutions_type ON institutions(type,is_active,name)"
];
export const cardExtraColumns={
 institution_id:"TEXT",
 card_type:"TEXT NOT NULL DEFAULT 'credit'",
 usage_type:"TEXT NOT NULL DEFAULT 'personal'",
 is_additional:"INTEGER NOT NULL DEFAULT 0",
 credit_limit_kurus:"INTEGER",
 available_limit_kurus:"INTEGER",
 cash_advance_limit_kurus:"INTEGER",
 statement_day:"INTEGER",
 due_day:"INTEGER",
 current_statement_date:"TEXT",
 current_due_date:"TEXT",
 next_statement_date:"TEXT",
 next_due_date:"TEXT",
 currency:"TEXT NOT NULL DEFAULT 'TRY'",
 status:"TEXT NOT NULL DEFAULT 'active'",
 reminder_enabled:"INTEGER NOT NULL DEFAULT 1",
 min_payment_percent:"REAL",
 interest_note:"TEXT NOT NULL DEFAULT ''",
 commission_note:"TEXT NOT NULL DEFAULT ''",
 linked_iban:"TEXT NOT NULL DEFAULT ''",
 note:"TEXT NOT NULL DEFAULT ''",
 color:"TEXT NOT NULL DEFAULT '#0a2c38'"
};
export function institutionId(value) {
 if(typeof value!=='string'||!(/^[a-z0-9][a-z0-9_-]{1,79}$/.test(value)))
   throw new ApiError(400,'Kuruluş kodu geçersiz.');
 return value;
}
export function institutionInput(d) {
 const name=requiredText(d.name,'Kuruluş adı',120);
 if(!['bank','payment'].includes(d.type))throw new ApiError(400,'Kuruluş türü geçersiz.');
 const short_name=optionalText(d.short_name,90)||name;
 const domain=optionalText(d.domain,160).toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
 if(domain&&!/^(?=.{3,160}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain))
   throw new ApiError(400,'Kurum web alan adı geçersiz.');
 const logo_data=optionalText(d.logo_data,9500);
 if(logo_data && (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo_data)||logo_data.length>9500))
   throw new ApiError(400,'Logo PNG, JPEG veya WebP biçiminde ve 7 KB altında olmalı.');
 return {name,type:d.type,short_name,domain,logo_data,
   search_keywords:optionalText(d.search_keywords,220),is_active:d.is_active===0||d.is_active===false?0:1};
}
export async function initializeCardCatalog(env) {
 const cols=(await env.DB.prepare('PRAGMA table_info(cards)').all()).results.map(x=>x.name);
 for(const [name,ddl] of Object.entries(cardExtraColumns)){
  if(cols.includes(name))continue;
  try{await env.DB.prepare('ALTER TABLE cards ADD COLUMN '+name+' '+ddl).run();}
  catch(e){if(!/duplicate column name/i.test(String(e)))throw e;}
 }
 await env.DB.prepare(
  "INSERT OR IGNORE INTO institutions(id,name,short_name,type,domain,search_keywords,is_active,sort_order) "+
  "SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.short_name'),"+
  "json_extract(value,'$.type'),json_extract(value,'$.domain'),json_extract(value,'$.search_keywords'),"+
  "1,json_extract(value,'$.sort_order') FROM json_each(?)"
 ).bind(JSON.stringify(institutionSeeds)).run();
}
export async function institutionRoute(request,env,path,method,role) {
 if(path==='/api/institutions'&&method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM institutions ORDER BY is_active DESC, sort_order ASC, name COLLATE NOCASE ASC').all();
  return {institutions:rows.results};
 }
 if(role!=='admin')throw new ApiError(403,'Kuruluş kataloğunu yalnızca yönetici değiştirebilir.');
 if(path==='/api/institutions'&&method==='POST'){
  const d=institutionInput(await readJSON(request)),id='custom-'+crypto.randomUUID();
  await env.DB.prepare(
   'INSERT INTO institutions(id,name,short_name,type,domain,search_keywords,logo_data,is_active,is_custom) VALUES(?,?,?,?,?,?,?,?,1)'
  ).bind(id,d.name,d.short_name,d.type,d.domain,d.search_keywords,d.logo_data,d.is_active).run();
  return {ok:true,id};
 }
 if(path==='/api/institutions/import'&&method==='POST'){
  const data=await readJSON(request);
  if(!Array.isArray(data.items)||data.items.length<1||data.items.length>25)
   throw new ApiError(400,'Bir seferde 1-25 kuruluş eklenebilir.');
  const items=data.items.map(institutionInput);
  await env.DB.batch(items.map(d=>env.DB.prepare(
   'INSERT INTO institutions(id,name,short_name,type,domain,search_keywords,logo_data,is_active,is_custom) VALUES(?,?,?,?,?,?,?,?,1)'
  ).bind('custom-'+crypto.randomUUID(),d.name,d.short_name,d.type,d.domain,d.search_keywords,d.logo_data,d.is_active)));
  return {ok:true,created:items.length};
 }
 const match=path.match(/^\/api\/institutions\/([a-z0-9_-]{2,80})$/);
 if(match){
  const id=institutionId(match[1]);
  const previous=await env.DB.prepare('SELECT * FROM institutions WHERE id=?').bind(id).first();
  if(!previous)throw new ApiError(404,'Kuruluş bulunamadı.');
  if(method==='PATCH'){
   const d=institutionInput({...previous,...await readJSON(request)});
   await env.DB.prepare(
    'UPDATE institutions SET name=?,short_name=?,type=?,domain=?,search_keywords=?,logo_data=?,is_active=? WHERE id=?'
   ).bind(d.name,d.short_name,d.type,d.domain,d.search_keywords,d.logo_data,d.is_active,id).run();
   return {ok:true};
  }
  if(method==='DELETE'){
   if(!previous.is_custom)throw new ApiError(409,'Hazır kurumlar silinemez; pasife alabilirsiniz.');
   const linked=await env.DB.prepare('SELECT COUNT(*) AS n FROM cards WHERE institution_id=?').bind(id).first();
   if(linked.n)throw new ApiError(409,'Önce bu kuruma bağlı kartları başka kuruma taşıyın.');
   await env.DB.prepare('DELETE FROM institutions WHERE id=?').bind(id).run();
   return {ok:true};
  }
 }
 throw new ApiError(404,'Kurum işlemi bulunamadı.');
}
