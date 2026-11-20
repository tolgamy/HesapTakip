import { ApiError } from './validation.js';
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
// Only fixed diagnostic categories are surfaced: never include SQL, table data, or secrets.
function d1ErrorCategory(error){
  const msg=String(error?.message||'').toLowerCase();
  if(/no such column:\s*rowid|without rowid/.test(msg))return 'ROWID';
  if(/no such table|does not exist|no such column/.test(msg))return 'SCHEMA';
  if(/too many api requests|subrequest|quota|daily limit|limit exceeded/.test(msg))return 'LIMIT';
  if(/sqlite_busy|database is locked|busy/.test(msg))return 'BUSY';
  if(/cpu time|timed out|timeout|time limit/.test(msg))return 'TIMEOUT';
  if(/d1_error|sqlite|database|sql error/.test(msg))return 'DATABASE';
  return 'UNKNOWN';
}
function d1ReadError(stage,error){
  return new Error('D1_'+stage+'_'+d1ErrorCategory(error));
}
// Free D1 allows only 50 queries per Worker invocation. Batch counts + pages so
// one private backup does not exhaust the per-request query/subrequest budget.
const PAGE_BATCH_SIZE=24;
const MAX_PAGES=384;
function batchCountResult(results,names) {
  if(!Array.isArray(results)||results.length!==names.length)throw Error('D1_COUNT_RESULTS');
  return names.map((name,i)=>{
    const n=Number(results[i]?.results?.[0]?.n);
    if(!Number.isSafeInteger(n)||n<0||n>MAX_ROWS_PER_TABLE)
      throw Error('D1_ROW_LIMIT');
    return n;
  });
}
// Keep the D1 batch small: a failed batch can hide an error on one table.
// On generic D1 database errors, recheck each table in that small group with
// independent read-only queries so the backup can proceed or identify the exact
// failing schema index. No rows or credentials are returned in failure details.
const COUNT_BATCH_SIZE=6;
const COUNT_QUERY_BUDGET=32;
function countNumber(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>MAX_ROWS_PER_TABLE)throw Error('D1_ROW_LIMIT');
  return n;
}
async function batchedCounts(env,names,stage='COUNT',budget={queries:0}) {
  const counts=[];
  for(let start=0;start<names.length;start+=COUNT_BATCH_SIZE){
    const chunk=names.slice(start,start+COUNT_BATCH_SIZE);
    if(++budget.queries>COUNT_QUERY_BUDGET)throw Error('D1_QUERY_BUDGET');
    let rows;
    try{
      rows=await env.DB.batch(chunk.map(name=>
        env.DB.prepare('SELECT COUNT(*) AS n FROM '+quoteTable(name))));
    }catch(error){
      if(d1ErrorCategory(error)!=='DATABASE')throw d1ReadError(stage,error);
      for(let j=0;j<chunk.length;j++){
        if(++budget.queries>COUNT_QUERY_BUDGET)throw Error('D1_QUERY_BUDGET');
        let row;
        try{
          row=await env.DB.prepare('SELECT COUNT(*) AS n FROM '+quoteTable(chunk[j])).first();
        }catch(singleError){
          const index=start+j+1;
          const category=d1ErrorCategory(singleError);
          throw Error('D1_'+stage+'_'+category+'_TABLE_'+index);
        }
        if(row?.n===undefined||row?.n===null)throw Error('D1_COUNT_RESULTS');
        counts.push(countNumber(row.n));
      }
      continue;
    }
    counts.push(...batchCountResult(rows,chunk));
  }
  if(counts.length!==names.length)throw Error('D1_COUNT_RESULTS');
  return counts;
}
export async function exportLogicalD1(env,now=new Date()) {
  let definitions;
  try {
    definitions=(await env.DB.prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"
    ).all()).results;
  }catch(error){throw d1ReadError('SCHEMA',error);}
  if(!definitions?.length||definitions.length>MAX_TABLES)
    throw Error('D1_TABLE_LIMIT');
  const names=definitions.map(d=>d.name);
  for(const name of names)quoteTable(name);
  const budget={queries:0};
  const totals=await batchedCounts(env,names,'COUNT',budget);
  const tables={};
  const counts={};
  const pages=[];
  definitions.forEach((def,i)=>{
    const total=totals[i];
    tables[def.name]={schema:def.sql,rows:[]};
    counts[def.name]=total;
    for(let offset=0;offset<total;offset+=PAGE_SIZE)
      pages.push({table:def.name,offset});
  });
  if(pages.length>MAX_PAGES)throw Error('D1_PAGE_LIMIT');
  for(let i=0;i<pages.length;i+=PAGE_BATCH_SIZE) {
    const selection=pages.slice(i,i+PAGE_BATCH_SIZE);
    let result;
    try{
      result=await env.DB.batch(selection.map(({table,offset})=>
        env.DB.prepare('SELECT * FROM '+quoteTable(table)+' ORDER BY rowid LIMIT ? OFFSET ?')
          .bind(PAGE_SIZE,offset)));
    }catch(error){throw d1ReadError('PAGE',error);}
    if(!Array.isArray(result)||result.length!==selection.length)throw Error('D1_PAGE_RESULTS');
    selection.forEach(({table},j)=>{
      if(!Array.isArray(result[j]?.results))throw Error('D1_PAGE_RESULTS');
      tables[table].rows.push(...result[j].results);
    });
  }
  for(const name of names)
    if(tables[name].rows.length!==counts[name])throw Error('D1_COUNT_MISMATCH');
  const verified=await batchedCounts(env,names,'VERIFY',budget);
  if(verified.some((n,i)=>n!==totals[i]))throw Error('D1_COUNT_MISMATCH');
  // This is a non-atomic logical copy. For point-in-time recovery use D1 Time Travel.
  const payload={format:'hesaptakip-d1-logical-v57',created_at:now.toISOString(),tables};
  const plaintext=JSON.stringify(payload);
  if(te.encode(plaintext).byteLength>MAX_BYTES)throw Error('D1_SIZE_LIMIT');
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
function backupPublicError(error,stage){
  const msg=String(error?.message||'');
  if(msg.includes('D1_ROW_LIMIT')||msg.includes('D1_PAGE_LIMIT')||msg.includes('D1_SIZE_LIMIT')||msg.includes('D1_TABLE_LIMIT'))
    return {code:'D1_CAPACITY',description:'Yedek kapsamı güvenli kapasite sınırını aştı.'};
  if(msg.includes('D1_COUNT_MISMATCH'))
    return {code:'D1_CONCURRENT_UPDATE',description:'Yedekleme sırasında kayıt sayısı değişti; tekrar deneyin.'};
  if(/^D1_(SCHEMA|COUNT|VERIFY|PAGE)_(ROWID|SCHEMA|LIMIT|BUSY|TIMEOUT|DATABASE|UNKNOWN)$/.test(msg))
    return {code:msg,description:msg.includes('_LIMIT')?'Cloudflare D1 işlem sınırına ulaşıldı.':
      msg.includes('_BUSY')?'Veritabanı geçici olarak meşgul.':
      msg.includes('_ROWID')?'D1 tablosu standart satır sıralamasını desteklemiyor.':
      'D1 sorgusu tamamlanamadı; güvenli hata kodunu kontrol edin.'};
  const failed=msg.match(/^D1_(COUNT|VERIFY)_(ROWID|SCHEMA|LIMIT|BUSY|TIMEOUT|DATABASE|UNKNOWN)_TABLE_(\\d{1,3})$/);
  if(failed)return {code:'D1_'+failed[1]+'_'+failed[2]+'_TABLE_'+failed[3],
    description:'Yedekleme sırasında '+failed[3]+'. tablo sayımı başarısız. Kayıtlar değiştirilmedi.'};
  if(msg==='D1_QUERY_BUDGET')return {code:'D1_QUERY_BUDGET',
    description:'Güvenli D1 sorgu bütçesi aşıldı, yedekleme durduruldu.'};
  if(['D1_COUNT_RESULTS','D1_PAGE_RESULTS'].includes(msg))
    return {code:msg,description:'D1 sorgu yanıtının biçimi beklenenden farklı.'};
  return {code:stage,description:'İşlem tamamlanamadı. Hata aşaması: '+stage+'.'};
}
export async function backupPrivateR2V57(env,now=new Date()) {
  const configuration=backupConfiguration(env);
  if(!configuration.enabled)return {status:'disabled',reason:configuration.reason};
  const key=PREFIX+istanbulDate(now)+'.json';
  let stage='D1_EXPORT';
  try{
    const saved=await env.DB.prepare(
      "SELECT id FROM backup_runs WHERE state='success' AND object_key=? LIMIT 1"
    ).bind(key).first();
    if(saved){
      stage='R2_READBACK';
      await verifyObject(env,key);
      return {status:'already_done',key};
    }
    stage='D1_EXPORT';
    const {plaintext,counts}=await exportLogicalD1(env,now);
    stage='R2_UPLOAD';
    await env.BACKUP_BUCKET.put(key,await encryptBackup(env,plaintext),{
      httpMetadata:{contentType:'application/octet-stream'},
      customMetadata:{purpose:'private-encrypted-d1-backup',format:FORMAT}
    });
    stage='R2_READBACK';
    const verified=await verifyObject(env,key,counts);
    stage='D1_LOG';
    await putRun(env,'success',key,'AES-256-GCM; '+Object.keys(counts).length+' tablo; doğrulandı');
    try{await pruneExpired(env,now);}
    catch(error){console.error('Backup retention maintenance skipped',error?.name||'Error');}
    return {status:'success',key,table_count:Object.keys(counts).length,verified_at:verified.created_at};
  }catch(error){
    const failure=backupPublicError(error,stage);
    console.error('Encrypted backup failed',failure.code,error?.name||'Error');
    try{await putRun(env,'failed',key,failure.code);}
    catch(logError){console.error('Backup status recording failed',logError?.name||'Error');}
    throw new ApiError(503,'Şifreli yedek alınamadı: '+failure.description+' Kod: '+failure.code);
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
