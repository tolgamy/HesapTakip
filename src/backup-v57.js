// V57: encrypted private logical backup. No user-data write occurs during export or preview.
// Cloudflare D1 Time Travel remains the authoritative point-in-time restore mechanism.
// BACKUP_BUCKET is a private R2 binding; BACKUP_ENCRYPTION_KEY is a 32-byte HEX Worker secret.
function istanbulDate(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',
    {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
    .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}

const PREFIX='hesaptakip/encrypted/daily/';
const FORMAT='hesaptakip-d1-aes256gcm-v57';
const MAX_ROWS_PER_TABLE=20000;
const MAX_BYTES=8*1024*1024;
const PAGE_SIZE=250;
const MAX_TABLES=100;
const RETAIN_DAYS=30;
const MIN_RETAIN=7;
const te=new TextEncoder();
const td=new TextDecoder();

export function backupConfiguration(env) {
  if(!env.BACKUP_BUCKET)return {enabled:false,reason:'Özel BACKUP_BUCKET R2 bağlantısı kurulmamış'};
  if(typeof env.BACKUP_ENCRYPTION_KEY!=='string'||!/^[\da-fA-F]{64}$/.test(env.BACKUP_ENCRYPTION_KEY))
    return {enabled:false,reason:'64 haneli HEX BACKUP_ENCRYPTION_KEY Cloudflare Secret eksik'};
  return {enabled:true,reason:''};
}
function bytesHex(hex) {
  if(!/^[\da-fA-F]+$/.test(hex)||hex.length%2)throw new Error('Geçersiz anahtar');
  return Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
}
function hex(bytes) {return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
function b64(bytes) {
  let out='';
  for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}
function unb64(value) {
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Yedek içeriği geçersiz');
  return Uint8Array.from(atob(value),x=>x.charCodeAt(0));
}
async function cryptoKey(env) {
  return crypto.subtle.importKey('raw',bytesHex(env.BACKUP_ENCRYPTION_KEY),
    {name:'AES-GCM'},false,['encrypt','decrypt']);
}
function quoteTable(name) {
  if(typeof name!=='string'||!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name))
    throw Error('Beklenmeyen tablo adı');
  return '"'+name+'"';
}
async function rowCount(env,table) {
  const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM '+quoteTable(table)).first();
  const n=Number(row?.n);
  if(!Number.isSafeInteger(n)||n<0||n>MAX_ROWS_PER_TABLE)
    throw Error('Yedek tablo satır sınırı: '+table);
  return n;
}
export async function exportLogicalD1(env,now=new Date()) {
  const definitions=(await env.DB.prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all()).results;
  if(!definitions?.length||definitions.length>MAX_TABLES)throw Error('Veritabanı tablo listesi doğrulanamadı');
  const tables={};
  const counts={};
  for(const def of definitions){
    const table=def.name;
    const total=await rowCount(env,table);
    const rows=[];
    for(let start=0;start<total;start+=PAGE_SIZE) {
      const page=await env.DB.prepare('SELECT * FROM '+quoteTable(table)+' ORDER BY rowid LIMIT ? OFFSET ?')
        .bind(PAGE_SIZE,start).all();
      rows.push(...(page.results||[]));
      if(rows.length>MAX_ROWS_PER_TABLE)throw Error('Yedek kapasitesi aşıldı');
    }
    if(rows.length!==total||await rowCount(env,table)!==total)
      throw Error('Yedekleme sırasında tablo değişti: '+table);
    tables[table]={schema:def.sql,rows};
    counts[table]=total;
  }
  // A logical export is NOT an atomic D1 snapshot. Refuse the archive if counts change
  // during this read; concurrent updates of equal counts still require D1 Time Travel.
  for(const table of Object.keys(counts)){
    if(await rowCount(env,table)!==counts[table])throw Error('Yedekleme sırasında kayıt sayısı değişti: '+table);
  }
  const payload={format:'hesaptakip-d1-logical-v57',created_at:now.toISOString(),tables};
  const plaintext=JSON.stringify(payload);
  if(te.encode(plaintext).byteLength>MAX_BYTES)throw Error('Yedek boyut sınırını aştı; daha büyük veri için D1 export gerekir');
  return {plaintext,counts};
}
async function encryptBackup(env,plaintext) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},
    await cryptoKey(env),te.encode(plaintext)));
  return JSON.stringify({format:FORMAT,iv:hex(iv),ciphertext:b64(ciphertext)});
}
export async function decryptBackup(env,encoded) {
  const wrapper=JSON.parse(encoded);
  if(wrapper?.format!==FORMAT||typeof wrapper.iv!=='string'||!/^[\da-fA-F]{24}$/.test(wrapper.iv))
    throw Error('Şifreli yedek biçimi geçersiz');
  const plain=td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytesHex(wrapper.iv)},
    await cryptoKey(env),unb64(wrapper.ciphertext)));
  const payload=JSON.parse(plain);
  if(payload?.format!=='hesaptakip-d1-logical-v57'||!payload.tables||
     typeof payload.tables!=='object'||Array.isArray(payload.tables))
    throw Error('Yedek veri biçimi geçersiz');
  for(const [name,def] of Object.entries(payload.tables)){
    quoteTable(name);
    if(!Array.isArray(def.rows)||typeof def.schema!=='string')
      throw Error('Yedek tablo doğrulaması başarısız');
  }
  return payload;
}
async function putRun(env,state,key,detail) {
  await env.DB.prepare('INSERT INTO backup_runs(id,state,object_key,detail) VALUES(?,?,?,?)')
    .bind(crypto.randomUUID(),state,key,detail.slice(0,300)).run();
}
async function verifyObject(env,key,expectedCounts) {
  const object=await env.BACKUP_BUCKET.get(key);
  if(!object)throw Error('Yüklenen R2 yedeği okunamadı');
  const payload=await decryptBackup(env,await object.text());
  const counts=Object.fromEntries(Object.entries(payload.tables).map(([name,def])=>[name,def.rows.length]));
  if(expectedCounts && JSON.stringify(counts)!==JSON.stringify(expectedCounts))
    throw Error('Geri okuma sırasında tablo sayıları uyuşmadı');
  return {created_at:payload.created_at,counts};
}
async function pruneExpired(env,now) {
  let cursor,objects=[];
  do {
    const listed=await env.BACKUP_BUCKET.list({prefix:PREFIX,limit:1000,...(cursor?{cursor}:{})});
    objects.push(...(listed.objects||[]).filter(o=>/^hesaptakip\/encrypted\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(o.key)));
    cursor=listed.truncated?listed.cursor:null;
  } while(cursor&&objects.length<10000);
  objects.sort((a,b)=>b.key.localeCompare(a.key));
  const cutoff=istanbulDate(new Date(now.getTime()-RETAIN_DAYS*86400000));
  for(const o of objects.slice(MIN_RETAIN)){
    const date=o.key.slice(PREFIX.length,PREFIX.length+10);
    if(date<cutoff)await env.BACKUP_BUCKET.delete(o.key);
  }
}
export async function backupPrivateR2V57(env,now=new Date()) {
  const configuration=backupConfiguration(env);
  if(!configuration.enabled)return {status:'disabled',reason:configuration.reason};
  const key=PREFIX+istanbulDate(now)+'.json';
  const saved=await env.DB.prepare(
    "SELECT id FROM backup_runs WHERE state='success' AND object_key=? LIMIT 1"
  ).bind(key).first();
  if(saved){
    // A previously logged run isn't enough: make sure R2 still contains an authentic backup.
    await verifyObject(env,key);
    return {status:'already_done',key};
  }
  try {
    const {plaintext,counts}=await exportLogicalD1(env,now);
    await env.BACKUP_BUCKET.put(key,await encryptBackup(env,plaintext),{
      httpMetadata:{contentType:'application/octet-stream'},
      customMetadata:{purpose:'private-encrypted-d1-backup',format:FORMAT}
    });
    const verified=await verifyObject(env,key,counts);
    await putRun(env,'success',key,'AES-256-GCM; '+Object.keys(counts).length+' tablo; şifre çözülerek doğrulandı');
    try{await pruneExpired(env,now);}catch(error){console.error('R2 retention cleanup failed',error?.name||'Error');}
    return {status:'success',key,table_count:Object.keys(counts).length,verified_at:verified.created_at};
  }catch(error){
    // Failure details never include records, secrets, or the plaintext archive.
    await putRun(env,'failed',key,String(error?.message||'Yedek hatası'));
    throw error;
  }
}
export async function backupAdminRoute(env,path,method) {
  if(path==='/api/backups/status'&&method==='GET'){
    const cfg=backupConfiguration(env);
    const recent=await env.DB.prepare(
      'SELECT state,object_key,detail,created_at FROM backup_runs ORDER BY created_at DESC,id DESC LIMIT 20'
    ).all();
    return {configured:cfg.enabled,reason:cfg.reason,retention_days:RETAIN_DAYS,
      point_in_time_restore:'Cloudflare D1 Time Travel',runs:recent.results||[]};
  }
  if(path==='/api/backups/run'&&method==='POST')return backupPrivateR2V57(env);
  if(path==='/api/backups/preview'&&method==='GET'){
    if(!backupConfiguration(env).enabled)return {verified:false,reason:backupConfiguration(env).reason};
    const last=await env.DB.prepare(
      "SELECT object_key FROM backup_runs WHERE state='success' AND object_key LIKE ? ORDER BY created_at DESC,id DESC LIMIT 1"
    ).bind(PREFIX+'%').first();
    if(!last)return {verified:false,reason:'Henüz doğrulanmış şifreli V57 yedeği yok'};
    const verified=await verifyObject(env,last.object_key);
    return {verified:true,created_at:verified.created_at,tables:verified.counts,
      note:'Salt okunur doğrulama. Canlı D1 kayıtları değiştirilmedi.'};
  }
  throw Error('Geçersiz yedek yönetim isteği');
}
