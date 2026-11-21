import {ApiError} from './validation.js';

// Independent Cloudflare D1 databases are mounted as static Worker bindings.
// A membership may only be assigned a configured binding by the site owner.
// No user-provided slot, header, cookie or URL parameter is used as a database key.
const slots=Object.freeze(Array.from({length:20},(_,i)=>'TENANT_DB_'+(i+1)));
export const isTenantSlot=value=>slots.includes(value);
export const availableTenantSlots=env=>slots.filter(slot=>Boolean(env[slot]&&typeof env[slot].prepare==='function'));

// A DB can never serve two data spaces, even if someone configures two bindings
// that accidentally point at the same D1 database ID. We mark the primary DB
// before any tenant resolution, and verify the marker on each independently bound DB.
export async function assertDataSpace(db,key){
 if(!db||typeof db.prepare!=='function')throw new ApiError(503,'Veri alanı bağlı değil.');
 await db.prepare('CREATE TABLE IF NOT EXISTS ht_data_space_guard (id INTEGER PRIMARY KEY CHECK(id=1), space_key TEXT NOT NULL)').run();
 await db.prepare('INSERT OR IGNORE INTO ht_data_space_guard(id,space_key) VALUES(1,?)').bind(key).run();
 const row=await db.prepare('SELECT space_key FROM ht_data_space_guard WHERE id=1').first();
 if(!row||row.space_key!==key)throw new ApiError(503,'Veri alanı karışıklığı tespit edildi. İşlem engellendi.');
}
export async function routeTenantEnvironment(masterEnv,identity){
 if(identity.role==='admin')return masterEnv;
 if(identity.role!=='tenant'||!isTenantSlot(identity.tenant_slot))
  throw new ApiError(403,'Kişisel veri alanın henüz tanımlanmadı. Yöneticiyle iletişime geç.');
 const db=masterEnv[identity.tenant_slot];
 if(!db||typeof db.prepare!=='function')
  throw new ApiError(503,'Kişisel veri alanı sunucuda henüz bağlanmadı.');
 if(db===masterEnv.DB)throw new ApiError(503,'Kişisel alan ana veritabanıyla aynı olamaz.');
 await assertDataSpace(db,'tenant:'+identity.tenant_slot);
 return {...masterEnv,DB:db};
}
export const tenantSchema=[
 "CREATE TABLE IF NOT EXISTS app_member_tenants (member_id TEXT PRIMARY KEY REFERENCES app_members(id) ON DELETE CASCADE, tenant_slot TEXT NOT NULL UNIQUE, assigned_at TEXT NOT NULL DEFAULT (datetime('now')))",
 "CREATE INDEX IF NOT EXISTS idx_app_member_tenants_slot ON app_member_tenants(tenant_slot)"
];
