import { ApiError, idText } from './validation.js';
import { validateFirmLogo } from './firms.js';

export const entityLogoSchema=[
  "CREATE TABLE IF NOT EXISTS entity_logos (target_type TEXT NOT NULL, target_id TEXT NOT NULL, logo_data TEXT NOT NULL DEFAULT '', changed_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(target_type,target_id))"
];
const typeTables={firm:'firms',card:'cards',account:'cash_accounts',institution:'institutions',directory:'directory_companies'};
export async function logoRoute(request,env,path,method) {
  if(path==='/api/logos'&&method==='GET'){
    const rows=await env.DB.prepare('SELECT target_type,target_id,logo_data FROM entity_logos').all();
    return {logos:rows.results};
  }
  if(path==='/api/logos'&&method==='POST'){
    const raw=await request.text();
    if(raw.length>12000)throw new ApiError(413,'Logo çok büyük.');
    let d;
    try{d=JSON.parse(raw);}catch{throw new ApiError(400,'Logo verisi okunamadı.');}
    if(!d||!Object.hasOwn(typeTables,d.target_type))throw new ApiError(400,'Logo kategorisi geçersiz.');
    const target_type=d.target_type;
    // Built-in institution IDs are readable strings; other records use UUIDs.
    const target_id=target_type==='institution'?
      String(d.target_id||''):idText(d.target_id);
    if(target_type==='institution'&&!/^[a-z0-9_-]{2,80}$/.test(target_id))
      throw new ApiError(400,'Kuruluş kimliği geçersiz.');
    const logo_data=validateFirmLogo(d.logo_data);
    const exists=await env.DB.prepare('SELECT id FROM '+typeTables[target_type]+' WHERE id=?').bind(target_id).first();
    if(!exists)throw new ApiError(404,'Logo eklenecek kayıt bulunamadı.');
    const queries=[
      env.DB.prepare("INSERT INTO entity_logos(target_type,target_id,logo_data) VALUES(?,?,?) ON CONFLICT(target_type,target_id) DO UPDATE SET logo_data=excluded.logo_data,changed_at=datetime('now')")
        .bind(target_type,target_id,logo_data)
    ];
    // Keep existing brand/account screen logos in sync with their long-standing columns.
    if(['firm','directory','institution'].includes(target_type))queries.push(
      env.DB.prepare('UPDATE '+typeTables[target_type]+' SET logo_data=? WHERE id=?').bind(logo_data,target_id));
    await env.DB.batch(queries);
    return {ok:true};
  }
  throw new ApiError(404,'Logo işlemi bulunamadı.');
}
