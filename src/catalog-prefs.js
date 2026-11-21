import {ApiError,readJSON} from './validation.js';

// Separate, additive user-selected catalog. No cash, cards, firm or movement rows are changed.
export const catalogPreferenceSchema=[
 "CREATE TABLE IF NOT EXISTS catalog_preferences ("+
 "group_key TEXT NOT NULL CHECK(group_key IN ('bank','payment','meal','platform')),"+
 "item_key TEXT NOT NULL, display_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 "+
 "CHECK(enabled IN (0,1)), updated_at TEXT NOT NULL DEFAULT (datetime('now')),"+
 "PRIMARY KEY(group_key,item_key))"
];
const groups=new Set(['bank','payment','meal','platform']);
export const normalizeCatalogName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
function cleanGroup(group){
 if(typeof group!=='string'||!groups.has(group))throw new ApiError(400,'Katalog kategorisi geçersiz.');
 return group;
}
function cleanLabel(name){
 if(typeof name!=='string')throw new ApiError(400,'Kuruluş adı geçersiz.');
 const s=name.trim().replace(/\s+/g,' ');
 if(!s||s.length>120||/[<>\x00-\x1f]/.test(s))throw new ApiError(400,'Kuruluş adı 1-120 karakter olmalı.');
 return s;
}
function keyFor(group,payload){
 if(group==='bank'||group==='payment'){
  const id=payload.item_key;
  if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(id))
   throw new ApiError(400,'Banka veya ödeme kuruluşu seçimi geçersiz.');
  return id;
 }
 return normalizeCatalogName(cleanLabel(payload.display_name||payload.item_key));
}
async function verifiedInstitution(env,group,id){
 const institution=await env.DB.prepare('SELECT id,name,type FROM institutions WHERE id=?').bind(id).first();
 if(!institution||institution.type!==group)throw new ApiError(400,'Seçilen kurum bu kategoriye ait değil.');
 return institution;
}
function upsert(env,group,key,label,enabled){
 return env.DB.prepare('INSERT INTO catalog_preferences(group_key,item_key,display_name,enabled) VALUES(?,?,?,?) '+
   'ON CONFLICT(group_key,item_key) DO UPDATE SET display_name=excluded.display_name,enabled=excluded.enabled,updated_at=datetime(\'now\')')
   .bind(group,key,label,enabled?1:0);
}
export async function catalogPreferenceRoute(request,env,path,method,role){
 if(path!=='/api/catalog-prefs')throw new ApiError(404,'Katalog işlemi bulunamadı.');
 if(method==='GET'){
  const rows=await env.DB.prepare('SELECT group_key,item_key,display_name,enabled FROM catalog_preferences ORDER BY group_key,display_name').all();
  return {catalogPrefs:rows.results};
 }
 if(!['admin','tenant'].includes(role))throw new ApiError(403,'Kuruluş listelerini yalnız hesap sahibi düzenleyebilir.');
 const p=await readJSON(request),group=cleanGroup(p.group);
 if(method==='POST'){
  if(typeof p.enabled!=='boolean')throw new ApiError(400,'Aktif/pasif tercihi belirtilmeli.');
  const key=keyFor(group,p);
  const label=group==='bank'||group==='payment'?
    (await verifiedInstitution(env,group,key)).name:cleanLabel(p.display_name||p.item_key);
  await upsert(env,group,key,label,p.enabled).run();
  return {ok:true};
 }
 if(method==='PATCH'){
  if(group!=='meal'&&group!=='platform')throw new ApiError(400,'Banka ve ödeme kuruluşlarının adını kurum yönetiminden düzenle.');
  const old=normalizeCatalogName(cleanLabel(p.item_key));
  const label=cleanLabel(p.new_name),key=normalizeCatalogName(label);
  if(old===key)throw new ApiError(400,'Yeni isim mevcut isimden farklı olmalı.');
  const selected=await env.DB.prepare('SELECT enabled FROM catalog_preferences WHERE group_key=? AND item_key=?')
    .bind(group,old).first();
  await env.DB.batch([
   upsert(env,group,old,cleanLabel(p.old_name||p.item_key),false),
   upsert(env,group,key,label,selected?.enabled!==0)
  ]);
  return {ok:true};
 }
 throw new ApiError(405,'Bu işlem desteklenmiyor.');
}
