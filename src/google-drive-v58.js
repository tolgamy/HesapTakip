// V58: Google Drive appDataFolder replication of the V57 *encrypted* R2 backup.
// Google OAuth runs server-side. Access/refresh tokens and financial data never reach JS.
import { backupConfiguration, decryptBackup } from './backup-v57.js';
import { ApiError } from './validation.js';

const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const CALLBACK='https://hesaptakip.tolgamy.workers.dev/api/google-drive/callback';
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE='https://www.googleapis.com/drive/v3/files';
const GOOGLE_UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const R2_PREFIX='hesaptakip/encrypted/daily/';
const FILE_PREFIX='hesaptakip-v58-';
const CIPHER_FORMAT='hesaptakip-d1-aes256gcm-v57';
const MAX_CIPHER_BYTES=12*1024*1024;
const RETAIN_DAYS=30;
const td=new TextDecoder();
const te=new TextEncoder();

export const googleBackupSchema=[
  "CREATE TABLE IF NOT EXISTS google_drive_backup_auth (id TEXT PRIMARY KEY, encrypted_refresh TEXT NOT NULL, connected_at TEXT NOT NULL DEFAULT(datetime('now')))",
  "CREATE TABLE IF NOT EXISTS google_drive_oauth_states (state_hash TEXT PRIMARY KEY, code_verifier TEXT NOT NULL, expires_ms INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS google_drive_backup_runs (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, drive_file_id TEXT, sha256 TEXT, state TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT(datetime('now')))",
  "CREATE INDEX IF NOT EXISTS google_drive_backup_runs_recent ON google_drive_backup_runs(created_at DESC)"
];
function config(env){
  const clientId=String(env.GOOGLE_OAUTH_CLIENT_ID||'').trim();
  const clientSecret=String(env.GOOGLE_OAUTH_CLIENT_SECRET||'').trim();
  const diagnostics={client_id:!clientId?'missing':/^[0-9]+-[a-z0-9_]+\\.apps\\.googleusercontent\\.com$/i.test(clientId)?'ready':'invalid',
    client_secret:clientSecret?'present':'missing',backup:backupConfiguration(env).enabled?'ready':'missing'};
  if(diagnostics.backup==='missing')return {configured:false,reason:'Önce Cloudflare Worker Production R2 şifreli yedekleme ayarlarını kontrol edin.',diagnostics};
  if(diagnostics.client_id==='missing')return {configured:false,reason:'GOOGLE_OAUTH_CLIENT_ID Cloudflare Worker Production ortamında bulunamadı. Pages ile Workers farklıdır.',diagnostics};
  if(diagnostics.client_id==='invalid')return {configured:false,reason:'GOOGLE_OAUTH_CLIENT_ID değeri geçerli Google Web OAuth Client ID biçiminde değil.',diagnostics};
  if(diagnostics.client_secret==='missing')return {configured:false,reason:'GOOGLE_OAUTH_CLIENT_SECRET Cloudflare Worker Production ortamında bulunamadı. Pages ile Workers farklıdır.',diagnostics};
  return {configured:true,reason:'',diagnostics};
}
export function googleDriveConfiguration(env){return config(env);}
function b64(data){
  let t='';for(let i=0;i<data.length;i+=8192)t+=String.fromCharCode(...data.subarray(i,i+8192));
  return btoa(t);
}
function unb64(s){
  if(typeof s!=='string'||!/^[a-zA-Z0-9+/]*={0,2}$/.test(s))throw new ApiError(400,'Şifreli bağlantı verisi bozulmuş.');
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
function b64url(data){return b64(data).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function nonce(bytes=32){return b64url(crypto.getRandomValues(new Uint8Array(bytes)));}
async function sha(bytes){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
}
async function tokenKey(env){
  const raw=Uint8Array.from(env.BACKUP_ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16));
  const base=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',
    salt:te.encode('hesaptakip-google-drive-v58'),
    info:te.encode('oauth-refresh-token-separate-purpose')},
  base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealRefreshToken(env,token){
  if(typeof token!=='string'||token.length<8||token.length>4000)throw new ApiError(400,'Google yetkilendirme yanıtı eksik.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await tokenKey(env),te.encode(token));
  return JSON.stringify({version:1,iv:b64(iv),ciphertext:b64(new Uint8Array(data))});
}
export async function openRefreshToken(env,stored){
  const payload=JSON.parse(stored);
  if(payload.version!==1)throw new ApiError(503,'Google bağlantısı doğrulanamadı.');
  return td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(payload.iv)},
    await tokenKey(env),unb64(payload.ciphertext)));
}
function requestFetch(env){return typeof env.__GOOGLE_TEST_FETCH==='function'?env.__GOOGLE_TEST_FETCH:fetch;}
async function remote(env,url,opts){
  // All target URLs are constructed from Google's fixed HTTPS API origins.
  const res=await requestFetch(env)(url,{...opts,redirect:'error',cache:'no-store'});
  if(!res.ok)throw new ApiError(502,'Google Drive isteği başarısız oldu ('+res.status+'). Bağlantıyı kontrol edin.');
  return res;
}
async function grant(env,params){
  const res=await remote(env,GOOGLE_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({...params,client_id:String(env.GOOGLE_OAUTH_CLIENT_ID).trim(),client_secret:String(env.GOOGLE_OAUTH_CLIENT_SECRET).trim()})});
  const token=await res.json();
  if(!token?.access_token)throw new ApiError(502,'Google erişim izni alınamadı.');
  return token;
}
async function currentToken(env){
  const row=await env.DB.prepare("SELECT encrypted_refresh FROM google_drive_backup_auth WHERE id='primary'").first();
  if(!row)return null;
  const refresh_token=await openRefreshToken(env,row.encrypted_refresh);
  const data=await grant(env,{grant_type:'refresh_token',refresh_token});
  return data.access_token;
}
function authHeader(accessToken){return {Authorization:'Bearer '+accessToken};}
function today(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
async function record(env,state,key,id,digest,detail=''){
  await env.DB.prepare('INSERT INTO google_drive_backup_runs(id,object_key,drive_file_id,sha256,state,detail) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),key,id||null,digest||null,state,detail.slice(0,160)).run();
}
async function listFiles(env,accessToken){
  const entries=[];let cursor;
  for(let page=0;page<20;page++){
    const u=new URL(GOOGLE_DRIVE);
    u.searchParams.set('spaces','appDataFolder');
    u.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,modifiedTime)');
    u.searchParams.set('pageSize','100');
    u.searchParams.set('q',"trashed = false and name contains 'hesaptakip-v58-'");
    if(cursor)u.searchParams.set('pageToken',cursor);
    const res=await remote(env,u.toString(),{headers:authHeader(accessToken)});
    const data=await res.json();
    entries.push(...(data.files||[]).filter(x=>typeof x.id==='string'&&/^hesaptakip-v58-\d{4}-\d{2}-\d{2}\.enc\.json$/.test(x.name)));
    if(!data.nextPageToken)return entries;
    cursor=data.nextPageToken;
  }
  throw new ApiError(503,'Google Drive arşiv listesi beklenenden büyük; güvenli kontrol gerekli.');
}
async function driveContent(env,token,id){
  if(!/^[A-Za-z0-9_-]{5,200}$/.test(id))throw new ApiError(400,'Google dosya kimliği geçersiz.');
  const u=new URL(GOOGLE_DRIVE+'/'+encodeURIComponent(id));
  u.searchParams.set('alt','media');
  const r=await remote(env,u.toString(),{headers:authHeader(token)});
  const data=await r.arrayBuffer();
  if(data.byteLength>MAX_CIPHER_BYTES)throw new ApiError(413,'Drive yedeği boyut sınırını aştı.');
  return new Uint8Array(data);
}
async function upload(env,token,name,body){
  const boundary='hesaptakip-'+nonce(15);
  const metadata={name,mimeType:'application/json',parents:['appDataFolder'],
    description:'HesapTakip AES-256-GCM encrypted backup (no plaintext)'};
  const part='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
    JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+
    '\r\n--'+boundary+'--';
  const u=new URL(GOOGLE_UPLOAD);u.searchParams.set('uploadType','multipart');u.searchParams.set('fields','id,name,size');
  const res=await remote(env,u.toString(),{method:'POST',
    headers:{...authHeader(token),'Content-Type':'multipart/related; boundary='+boundary},body:part});
  const file=await res.json();
  if(!file?.id||file.name!==name)throw new ApiError(502,'Drive yükleme yanıtı doğrulanamadı.');
  return file.id;
}
async function prune(env,token,files,now){
  const cutoff=today(new Date(now.getTime()-RETAIN_DAYS*86400000));
  const ordered=files.slice().sort((a,b)=>b.name.localeCompare(a.name));
  // Only files in the appDataFolder, using the strict V58 name, are eligible.
  for(const file of ordered.slice(7)){
    if(file.name.slice(FILE_PREFIX.length,FILE_PREFIX.length+10)>=cutoff)continue;
    await remote(env,GOOGLE_DRIVE+'/'+encodeURIComponent(file.id),
      {method:'DELETE',headers:authHeader(token)});
  }
}
export async function beginGoogleOAuth(env,now=Date.now()){
  if(!config(env).configured)throw new ApiError(503,config(env).reason);
  const state=nonce(),verifier=nonce(48),stateHash=await sha(te.encode(state));
  await env.DB.prepare('DELETE FROM google_drive_oauth_states WHERE expires_ms<?').bind(now).run();
  await env.DB.prepare('INSERT INTO google_drive_oauth_states(state_hash,code_verifier,expires_ms) VALUES(?,?,?)')
    .bind(stateHash,verifier,now+10*60*1000).run();
  const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(verifier))));
  const url=new URL(GOOGLE_AUTH);
  for(const [k,v] of Object.entries({client_id:String(env.GOOGLE_OAUTH_CLIENT_ID).trim(),
    redirect_uri:CALLBACK,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',
    state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return {url:url.toString()};
}
export async function completeGoogleOAuth(env,url,now=Date.now()){
  const params=new URL(url).searchParams,state=params.get('state')||'';
  if(!/^[A-Za-z0-9_-]{32,100}$/.test(state))throw new ApiError(400,'Google bağlantı isteği geçersiz.');
  const stateHash=await sha(te.encode(state));
  const row=await env.DB.prepare('SELECT code_verifier,expires_ms FROM google_drive_oauth_states WHERE state_hash=?')
    .bind(stateHash).first();
  const consumed=await env.DB.prepare('DELETE FROM google_drive_oauth_states WHERE state_hash=?').bind(stateHash).run();
  if(!row||Number(consumed.meta?.changes)!==1||row.expires_ms<now)
    throw new ApiError(403,'Google bağlantı süresi doldu veya bağlantı zaten kullanılmış.');
  if(params.has('error'))return {connected:false,reason:'cancelled'};
  const code=params.get('code')||'';
  if(!code||code.length>4096)throw new ApiError(400,'Google izin kodu alınamadı.');
  const tokens=await grant(env,{grant_type:'authorization_code',code,
    code_verifier:row.code_verifier,redirect_uri:CALLBACK});
  if(!tokens.refresh_token)throw new ApiError(409,'Google kalıcı izin göndermedi. Hesabın erişimini kaldırıp tekrar bağlayın.');
  if(tokens.scope&&!tokens.scope.split(' ').includes(SCOPE))throw new ApiError(403,'Google Drive uygulama klasörü izni verilmedi.');
  const sealed=await sealRefreshToken(env,tokens.refresh_token);
  await env.DB.prepare("INSERT INTO google_drive_backup_auth(id,encrypted_refresh) VALUES('primary',?) ON CONFLICT(id) DO UPDATE SET encrypted_refresh=excluded.encrypted_refresh,connected_at=datetime('now')")
    .bind(sealed).run();
  return {connected:true};
}
export async function googleDriveStatus(env){
  const cfg=config(env);
  const connected=!!(await env.DB.prepare("SELECT id FROM google_drive_backup_auth WHERE id='primary'").first());
  const logs=(await env.DB.prepare('SELECT state,object_key,drive_file_id,detail,created_at FROM google_drive_backup_runs ORDER BY created_at DESC,id DESC LIMIT 12').all()).results;
  return {configured:cfg.configured,connected,reason:cfg.reason,diagnostics:cfg.diagnostics,hidden_app_folder:true,
    retention_days:RETAIN_DAYS,runs:logs||[]};
}
export async function disconnectGoogleDrive(env){
  await env.DB.prepare("DELETE FROM google_drive_backup_auth WHERE id='primary'").run();
  return {connected:false,note:'Uygulamanın bağlantısı kaldırıldı; Google Drive arşivleri silinmedi.'};
}
export async function syncGoogleDrive(env,now=new Date()){
  const cfg=config(env);
  if(!cfg.configured)return {status:'disabled',reason:cfg.reason};
  if(!(await env.DB.prepare("SELECT id FROM google_drive_backup_auth WHERE id='primary'").first()))
    return {status:'disconnected',reason:'Önce Google hesabını bağlayın.'};
  const key=R2_PREFIX+today(now)+'.json';
  try{
    const source=await env.BACKUP_BUCKET.get(key);
    if(!source)return {status:'missing_source',reason:'Bugünkü Cloudflare R2 şifreli yedeği bulunamadı.'};
    if(source.size&&source.size>MAX_CIPHER_BYTES)throw new ApiError(413,'Yedek boyut sınırını aştı.');
    const body=await source.text();
    if(te.encode(body).byteLength>MAX_CIPHER_BYTES)throw new ApiError(413,'Yedek boyut sınırını aştı.');
    const encrypted=JSON.parse(body);
    if(encrypted.format!==CIPHER_FORMAT)throw new ApiError(400,'Şifresiz veya eski arşiv Google Drive’a gönderilemez.');
    await decryptBackup(env,body); // authenticate R2 archive before copying ciphertext
    const digest=await sha(te.encode(body));
    const token=await currentToken(env);
    const filename=FILE_PREFIX+today(now)+'.enc.json';
    const files=await listFiles(env,token);
    const existing=files.find(f=>f.name===filename);
    let id=existing?.id;
    if(existing){
      const old=await driveContent(env,token,id);
      if(await sha(old)!==digest)throw new ApiError(409,'Google Drive’daki aynı tarihli yedek farklı. Güvenlik için üzerine yazılmadı.');
    }else{id=await upload(env,token,filename,body);}
    if(await sha(await driveContent(env,token,id))!==digest)
      throw new ApiError(502,'Google Drive yedeği geri okunurken bütünlük kontrolü başarısız oldu.');
    await record(env,'success',key,id,digest,'Şifreli dosya geri okunarak doğrulandı');
    // After a successful verified upload, prune only expired V58-owned backups.
    try{await prune(env,token,[...files,...(!existing?[{id,name:filename}]:[])],now);}
    catch{ /* Retention failures do not destroy the verified backup. */ }
    return {status:existing?'already_done':'success',verified:true,file_name:filename};
  }catch(error){
    try{await record(env,'failed',key,null,null,'Google Drive kopyası doğrulanamadı');}catch{}
    if(error instanceof ApiError)throw error;
    throw new ApiError(502,'Google Drive yedekleme doğrulanamadı.');
  }
}
export async function verifyGoogleDrive(env){
  const cfg=config(env);
  if(!cfg.configured)return {verified:false,reason:cfg.reason};
  const row=await env.DB.prepare(
    "SELECT object_key,drive_file_id,sha256 FROM google_drive_backup_runs WHERE state='success' ORDER BY created_at DESC,id DESC LIMIT 1"
  ).first();
  if(!row?.drive_file_id)return {verified:false,reason:'Henüz başarılı Google Drive arşivi yok'};
  const token=await currentToken(env);
  if(!token)return {verified:false,reason:'Google hesabı bağlı değil'};
  const actual=await sha(await driveContent(env,token,row.drive_file_id));
  if(actual!==row.sha256)throw new ApiError(502,'Google Drive arşivinin bütünlüğü bozulmuş.');
  return {verified:true,object_key:row.object_key,note:'Google Drive’dan şifreli içerik okundu, SHA-256 doğrulandı. D1 değişmedi.'};
}
export async function googleDriveAdminRoute(request,env,path,method){
  if(path==='/api/google-drive/status'&&method==='GET')return googleDriveStatus(env);
  if(path==='/api/google-drive/connect'&&method==='POST')return beginGoogleOAuth(env);
  if(path==='/api/google-drive/disconnect'&&method==='POST')return disconnectGoogleDrive(env);
  if(path==='/api/google-drive/sync'&&method==='POST')return syncGoogleDrive(env);
  if(path==='/api/google-drive/verify'&&method==='GET')return verifyGoogleDrive(env);
  throw new ApiError(404,'Google Drive yedekleme işlemi bulunamadı.');
}
