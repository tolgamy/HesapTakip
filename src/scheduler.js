// Hatırlatmalar yalnızca uygulama içi kayıt olarak üretilir; SMS/WhatsApp/e-posta göndermez.
export function istanbulDate(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',
    {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
    .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function daysUntil(due,today) {
  return Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
}
export function allocateFirmDues(charges, settlements) {
  const available=new Map();
  for(const s of settlements)available.set(s.firm_id,(available.get(s.firm_id)||0)+s.amount_kurus);
  return charges.slice().sort((a,b)=>a.on_date.localeCompare(b.on_date) || a.id.localeCompare(b.id)).map(c=>{
    const paid=Math.min(c.amount_kurus, available.get(c.firm_id)||0);
    available.set(c.firm_id,(available.get(c.firm_id)||0)-paid);
    return {...c,remaining_kurus:c.amount_kurus-paid};
  });
}
export async function getDueItems(env){
  const [st,pa,fi,mo,papers]=await Promise.all([
    env.DB.prepare('SELECT id,card_id,due_date,amount_kurus,period FROM statements').all(),
    env.DB.prepare('SELECT statement_id,amount_kurus FROM payments').all(),
    env.DB.prepare('SELECT id,name,category FROM firms').all(),
    env.DB.prepare('SELECT id,firm_id,kind,amount_kurus,due_date,on_date FROM firm_movements').all(),
    env.DB.prepare("SELECT id,type,direction,party,due_date,amount_kurus FROM instruments WHERE status='pending'").all()
  ]);
  const paid=new Map();for(const p of pa.results)paid.set(p.statement_id,(paid.get(p.statement_id)||0)+p.amount_kurus);
  const statements=st.results.map(s=>({source:'card',source_id:s.id,subject:'Kart ekstresi '+s.period,
    due_date:s.due_date,amount_kurus:Math.max(0,s.amount_kurus-(paid.get(s.id)||0))})).filter(s=>s.amount_kurus>0);
  const firmById=new Map(fi.results.map(f=>[f.id,f]));
  const firmMovements=mo.results;
  const remaining=allocateFirmDues(firmMovements.filter(m=>m.kind==='charge'),
    firmMovements.filter(m=>m.kind==='settlement'));
  const firms=remaining.filter(m=>m.remaining_kurus>0&&m.due_date).map(m=>{
    const f=firmById.get(m.firm_id);
    return {source:'firm',source_id:m.id,subject:(f?.category==='payable'?'Firma borcu: ':'Firma alacağı: ')+(f?.name||'Firma'),
      due_date:m.due_date,amount_kurus:m.remaining_kurus};
  });
  const instruments=papers.results.map(p=>({source:'instrument',source_id:p.id,
    subject:(p.type==='check'?'Çek: ':'Senet: ')+p.party,due_date:p.due_date,amount_kurus:p.amount_kurus}));
  return [...statements,...firms,...instruments];
}
export async function createReminders(env,now=new Date()){
  const today=istanbulDate(now),dues=await getDueItems(env);
  let created=0;
  for(const item of dues){
    const offset=daysUntil(item.due_date,today);
    if(![7,3,1,0].includes(offset))continue;
    const dedup=[item.source,item.source_id,item.due_date,offset].join('|');
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO reminders(id,dedup_key,source,subject,due_date,amount_kurus,offset_days) VALUES(?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),dedup,item.source,item.subject,item.due_date,item.amount_kurus,offset).run();
    created+=result.meta?.changes||0;
  }
  return {created,dueItems:dues.length,today};
}
const BACKUP_TABLES=['cards','statements','payments','firms','firm_movements','cash_accounts',
  'cash_entries','instruments','reminders','audit_events'];
export async function backupPrivateR2(env,now=new Date()){
  if(!env.BACKUP_BUCKET)return {status:'disabled',reason:'Özel R2 BACKUP_BUCKET bağlantısı henüz tanımlı değil'};
  const date=istanbulDate(now);
  const already=await env.DB.prepare("SELECT id FROM backup_runs WHERE state='success' AND object_key=? LIMIT 1")
    .bind('hesaptakip/'+date+'.json').first();
  if(already)return {status:'already_done',date};
  const payload={format:'hesaptakip-private-backup-v1',created_at:now.toISOString(),tables:{}};
  for(const table of BACKUP_TABLES){
    // Büyük veri depolarında sessizce eksik yedek üretmeyi engelle.
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM '+table).first();
    if(count.n>20000)throw new Error('Yedek kapasite sınırı aşıldı; R2 streaming exporter gerekli: '+table);
    payload.tables[table]=(await env.DB.prepare('SELECT * FROM '+table).all()).results;
  }
  const key='hesaptakip/'+date+'.json';
  await env.BACKUP_BUCKET.put(key,JSON.stringify(payload),{
    httpMetadata:{contentType:'application/json'},
    customMetadata:{purpose:'private-financial-backup',version:'1'}
  });
  await env.DB.prepare('INSERT INTO backup_runs(id,state,object_key,detail) VALUES(?,?,?,?)')
    .bind(crypto.randomUUID(),'success',key,'R2 özel yedek').run();
  return {status:'success',key};
}
