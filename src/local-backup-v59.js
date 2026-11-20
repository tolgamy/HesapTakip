// V59: user-initiated local download only. No R2, Drive or other outbound transfer.
// Explicit allowlist keeps passwords, authentication material, vault credentials,
// audit/security sessions, OAuth tokens and backup metadata out of local files.
import { ApiError } from './validation.js';

export const LOCAL_BACKUP_FORMAT='hesaptakip-finance-local-v59';
export const LOCAL_BACKUP_TABLES=Object.freeze([
  'cards','card_date_history','statements','payments',
  'firms','firm_movements','linked_settlements',
  'cash_accounts','cash_entries','instruments','reminders',
  'institutions','deleted_institutions','catalog_preferences',
  'utility_bills','correction_log',
  'directory_companies','directory_contacts',
  'directory_templates','directory_template_defaults',
  'entity_logos','firm_profiles','archived_platforms',
  'archived_pos_firms','archived_suppliers',
  'payment_plans','payment_plan_dues'
]);
const INCLUDED=new Set(LOCAL_BACKUP_TABLES);
const MAX_ROWS_PER_TABLE=20000;
const MAX_BYTES_PER_TABLE=8*1024*1024;

export async function localBackupManifest(env){
  const found=(await env.DB.prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all()).results||[];
  const tables=found.filter(row=>INCLUDED.has(row.name)&&typeof row.sql==='string')
    .map(row=>({name:row.name,schema:row.sql}));
  if(!tables.length)throw new ApiError(503,'Dışa aktarılacak finans tablosu bulunamadı.');
  return {format:LOCAL_BACKUP_FORMAT,created_at:new Date().toISOString(),tables,
    scope:'finans ve işletme kayıtları',
    excluded:'Giriş şifreleri, PIN, biyometri, kasa şifreleri, kimlik doğrulama ve OAuth bilgileri dahil değildir.'};
}
export async function localBackupTable(env,name){
  if(typeof name!=='string'||!INCLUDED.has(name))
    throw new ApiError(404,'Dışa aktarma tablosu bulunamadı.');
  const found=await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(name).first();
  if(!found)throw new ApiError(404,'Dışa aktarma tablosu mevcut değil.');
  let result;
  try{
    // Fetch each whole table in one read-only request: no COUNT(*), DB.batch(),
    // rowid, unsafe pagination or mixing with concurrent account mutations.
    result=await env.DB.prepare('SELECT * FROM "'+name+'" LIMIT ?')
      .bind(MAX_ROWS_PER_TABLE+1).all();
  }catch(error){
    console.error('Local backup table read failed',error?.name||'Error');
    throw new ApiError(503,'Finans tablosu okunamadı. Dosya oluşturulmadı.');
  }
  if(!Array.isArray(result?.results))throw new ApiError(503,'Finans tablosu yanıtı geçersiz.');
  if(result.results.length>MAX_ROWS_PER_TABLE)
    throw new ApiError(413,'Finans tablosu güvenli dışa aktarma sınırını aştı; eksik dosya oluşturulmadı.');
  const payload={name,rows:result.results};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_BYTES_PER_TABLE)
    throw new ApiError(413,'Finans verisi güvenli dosya boyutunu aştı; eksik dosya oluşturulmadı.');
  return payload;
}
export async function localBackupRoute(env,path,method){
  if(method!=='GET')throw new ApiError(405,'Yalnızca salt okunur indirme yapılabilir.');
  if(path==='/api/backups/local/manifest')return localBackupManifest(env);
  const match=path.match(/^\/api\/backups\/local\/table\/([a-z_]+)$/);
  if(match)return localBackupTable(env,match[1]);
  throw new ApiError(404,'Yerel yedekleme işlemi bulunamadı.');
}
