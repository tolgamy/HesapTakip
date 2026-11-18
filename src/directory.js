import { ApiError, requiredText, optionalText, idText } from './validation.js';
import { validateFirmLogo } from './firms.js';

// Separate business address book. No finance tables or balances are changed.
export const directorySchema = [
  "CREATE TABLE IF NOT EXISTS directory_companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '', visit_day TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', linked_firm_id TEXT, logo_data TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS directory_contacts (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES directory_companies(id) ON DELETE RESTRICT, full_name TEXT NOT NULL, name_key TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', visit_day TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(company_id,name_key,phone))",
  "CREATE INDEX IF NOT EXISTS idx_directory_contacts_company ON directory_contacts(company_id)",
  "CREATE TABLE IF NOT EXISTS directory_templates (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
];
export const visitDays = ['','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
export const nameKey = value => String(value||'').toLocaleLowerCase('tr').trim().replace(/\s+/g,' ');
export function normalizePhone(value) {
  if(value==null || value==='') return '';
  if(typeof value!=='string' && typeof value!=='number')throw new ApiError(400,'Telefon geçersiz.');
  const text=String(value).trim();
  if(!/^[+0-9()\s.-]+$/.test(text))throw new ApiError(400,'Telefonda yalnızca rakam, boşluk ve + olabilir.');
  let digits=text.replace(/\D/g,'');
  if(digits.length===11 && digits.startsWith('0')) digits=digits.slice(1);
  if(digits.length===12 && digits.startsWith('90')) digits=digits.slice(2);
  if(digits.length!==10 || digits[0]!=='5' && digits[0]!=='2' && digits[0]!=='3' && digits[0]!=='4')
    throw new ApiError(400,'Telefonu 10 haneli Türkiye numarası olarak (+90 ile) girin.');
  return '+90 '+digits.slice(0,3)+' '+digits.slice(3,6)+' '+digits.slice(6,8)+' '+digits.slice(8,10);
}
function companyInput(data){
  const name=requiredText(data.name,'Firma adı',120);
  const visit_day=String(data.visit_day||'').trim();
  if(!visitDays.includes(visit_day))throw new ApiError(400,'Ziyaret günü geçersiz.');
  return {
    name,name_key:nameKey(name),phone:normalizePhone(data.phone),visit_day,note:optionalText(data.note,500),
    linked_firm_id:data.linked_firm_id?idText(data.linked_firm_id):null,
    logo_data:data.logo_data===undefined?undefined:validateFirmLogo(data.logo_data)
  };
}
function contactInput(data) {
  const full_name=requiredText(data.full_name,'Temsilci adı soyadı',120);
  const visit_day=String(data.visit_day||'').trim();
  if(!visitDays.includes(visit_day))throw new ApiError(400,'Ziyaret günü geçersiz.');
  return {full_name,name_key:nameKey(full_name),phone:normalizePhone(data.phone),
    visit_day,note:optionalText(data.note,500)};
}
async function readPayload(request,large=false){
  if(!(request.headers.get('content-type')||'').includes('application/json'))throw new ApiError(415,'JSON bekleniyor.');
  const limit=large?120000:12000;
  if(Number(request.headers.get('content-length')||0)>limit)throw new ApiError(413,'Dosya çok büyük.');
  const raw=await request.text();
  if(raw.length>limit)throw new ApiError(413,'İstek çok büyük.');
  try { const x=JSON.parse(raw);if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x; }
  catch {throw new ApiError(400,'JSON okunamadı.');}
}
async function linkedExists(env,id){
  if(!id)return;
  const firm=await env.DB.prepare('SELECT id FROM firms WHERE id=?').bind(id).first();
  if(!firm)throw new ApiError(400,'Bağlanacak cari firma bulunamadı.');
}
async function companyExists(env,id){
  const row=await env.DB.prepare('SELECT * FROM directory_companies WHERE id=?').bind(id).first();
  if(!row)throw new ApiError(404,'Firma rehberi kaydı bulunamadı.');
  return row;
}
function uniqueConflict(error){
  if(/UNIQUE constraint|SQLITE_CONSTRAINT/i.test(String(error)))throw new ApiError(409,'Firma veya temsilci zaten kayıtlı; listeyi yenileyip çakışmayı kontrol et.');
  throw error;
}
export async function directoryRoute(request,env,path,method){
  if(path==='/api/directory' && method==='GET'){
    const [companies,contacts,templates]=await Promise.all([
      env.DB.prepare('SELECT * FROM directory_companies ORDER BY name COLLATE NOCASE').all(),
      env.DB.prepare('SELECT * FROM directory_contacts ORDER BY full_name COLLATE NOCASE').all(),
      env.DB.prepare('SELECT * FROM directory_templates ORDER BY title COLLATE NOCASE').all()
    ]);
    return {companies:companies.results,contacts:contacts.results,templates:templates.results};
  }
  if(path==='/api/directory/with-contact' && method==='POST'){
    const data=await readPayload(request);
    const company=companyInput(data),person=contactInput(data.contact||{});
    await linkedExists(env,company.linked_firm_id);
    const id=crypto.randomUUID(),contactId=crypto.randomUUID();
    try{
      await env.DB.batch([
        env.DB.prepare('INSERT INTO directory_companies (id,name,name_key,phone,visit_day,note,linked_firm_id,logo_data) VALUES(?,?,?,?,?,?,?,?)')
          .bind(id,company.name,company.name_key,company.phone,company.visit_day,company.note,company.linked_firm_id,company.logo_data||''),
        env.DB.prepare('INSERT INTO directory_contacts (id,company_id,full_name,name_key,phone,visit_day,note) VALUES(?,?,?,?,?,?,?)')
          .bind(contactId,id,person.full_name,person.name_key,person.phone,person.visit_day,person.note)
      ]);
    }catch(e){uniqueConflict(e);}
    return {id,contact_id:contactId};
  }
  if(path==='/api/directory' && method==='POST'){
    const d=companyInput(await readPayload(request));
    await linkedExists(env,d.linked_firm_id);
    const id=crypto.randomUUID();
    try {await env.DB.prepare('INSERT INTO directory_companies (id,name,name_key,phone,visit_day,note,linked_firm_id,logo_data) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id,d.name,d.name_key,d.phone,d.visit_day,d.note,d.linked_firm_id,d.logo_data||'').run();}
    catch(e){uniqueConflict(e);}
    return {id};
  }
  const company=path.match(/^\/api\/directory\/companies\/([a-f0-9-]{36})$/);
  if(company && method==='PATCH'){
    const id=idText(company[1]); const original=await companyExists(env,id),d=companyInput(await readPayload(request));
    await linkedExists(env,d.linked_firm_id);
    try {await env.DB.prepare('UPDATE directory_companies SET name=?,name_key=?,phone=?,visit_day=?,note=?,linked_firm_id=?,logo_data=? WHERE id=?')
      .bind(d.name,d.name_key,d.phone,d.visit_day,d.note,d.linked_firm_id,d.logo_data===undefined?original.logo_data:d.logo_data,id).run();}
    catch(e){uniqueConflict(e);}
    return {ok:true};
  }
  if(company && method==='DELETE'){
    const id=idText(company[1]);await companyExists(env,id);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM directory_contacts WHERE company_id=?').bind(id),
      env.DB.prepare('DELETE FROM directory_companies WHERE id=?').bind(id)
    ]);
    return {ok:true};
  }
  if(path==='/api/directory/contacts' && method==='POST'){
    const data=await readPayload(request),company_id=idText(data.company_id),d=contactInput(data);
    await companyExists(env,company_id);
    const id=crypto.randomUUID();
    try{await env.DB.prepare('INSERT INTO directory_contacts (id,company_id,full_name,name_key,phone,visit_day,note) VALUES(?,?,?,?,?,?,?)')
      .bind(id,company_id,d.full_name,d.name_key,d.phone,d.visit_day,d.note).run();}
    catch(e){uniqueConflict(e);}
    return {id};
  }
  const contact=path.match(/^\/api\/directory\/contacts\/([a-f0-9-]{36})$/);
  if(contact){
    const id=idText(contact[1]);
    const row=await env.DB.prepare('SELECT id,company_id FROM directory_contacts WHERE id=?').bind(id).first();
    if(!row)throw new ApiError(404,'Temsilci bulunamadı.');
    if(method==='PATCH'){
      const d=contactInput(await readPayload(request));
      try{await env.DB.prepare('UPDATE directory_contacts SET full_name=?,name_key=?,phone=?,visit_day=?,note=? WHERE id=?')
        .bind(d.full_name,d.name_key,d.phone,d.visit_day,d.note,id).run();}
      catch(e){uniqueConflict(e);}
      return {ok:true};
    }
    if(method==='DELETE'){
      await env.DB.prepare('DELETE FROM directory_contacts WHERE id=?').bind(id).run();
      return {ok:true};
    }
  }
  if(path==='/api/directory/import' && method==='POST'){
    const payload=await readPayload(request,true);
    const raw=payload.rows;
    if(!Array.isArray(raw)||!raw.length||raw.length>100)throw new ApiError(400,'Bir seferde 1-100 Excel satırı yükleyin.');
    const mode=payload.existing_mode;
    if(!['skip','merge'].includes(mode))throw new ApiError(400,'Mevcut firmalarda ne yapılacağı seçilmeli.');
    const rows=raw.map(x=>{
      if(!x||typeof x!=='object')throw new ApiError(400,'Excel satırı hatalı.');
      const firm=companyInput({name:x.name,note:x.company_note||'',phone:x.full_name?'':x.phone||'',visit_day:x.full_name?'':x.visit_day||''});
      // A company can have no contacts, but a phone must always belong to a named person.
      let person=null;
      if(x.full_name||x.contact_note){
        person=contactInput({full_name:x.full_name,phone:x.phone||'',visit_day:x.visit_day||'',note:x.contact_note||''});
      }
      return {firm,person};
    });
    const existing=(await env.DB.prepare('SELECT id,name_key FROM directory_companies').all()).results;
    const contacts=(await env.DB.prepare('SELECT company_id,name_key,phone FROM directory_contacts').all()).results;
    const ids=new Map(existing.map(x=>[x.name_key,x.id]));
    const known=new Set(contacts.map(c=>c.company_id+'|'+c.name_key+'|'+c.phone));
    const existed=new Set(ids.keys()), pending=[],newCompanies=new Set();
    let addedCompanies=0,addedContacts=0,skipped=0;
    for(const row of rows){
      const key=row.firm.name_key;
      if(existed.has(key) && mode==='skip'){skipped++;continue;}
      let id=ids.get(key);
      if(!id){
        id=crypto.randomUUID();ids.set(key,id);newCompanies.add(key);addedCompanies++;
        pending.push(env.DB.prepare('INSERT INTO directory_companies(id,name,name_key,phone,visit_day,note) VALUES(?,?,?,?,?,?)')
          .bind(id,row.firm.name,row.firm.name_key,row.firm.phone,row.firm.visit_day,row.firm.note));
      }
      if(row.person){
        const tag=id+'|'+row.person.name_key+'|'+row.person.phone;
        if(known.has(tag)){skipped++;continue;}
        known.add(tag);addedContacts++;
        pending.push(env.DB.prepare('INSERT INTO directory_contacts(id,company_id,full_name,name_key,phone,visit_day,note) VALUES(?,?,?,?,?,?,?)')
          .bind(crypto.randomUUID(),id,row.person.full_name,row.person.name_key,row.person.phone,row.person.visit_day,row.person.note));
      }else if(!newCompanies.has(key))skipped++;
    }
    if(pending.length) {
      try{await env.DB.batch(pending);}catch(e){uniqueConflict(e);}
    }
    return {added_companies:addedCompanies,added_contacts:addedContacts,skipped};
  }
  if(path==='/api/directory/templates' && method==='POST'){
    const data=await readPayload(request),title=requiredText(data.title,'Şablon adı',60),
      body=requiredText(data.body,'Mesaj',1000),id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO directory_templates(id,title,body) VALUES(?,?,?)').bind(id,title,body).run();
    return {id};
  }
  const template=path.match(/^\/api\/directory\/templates\/([a-f0-9-]{36})$/);
  if(template){
    const id=idText(template[1]);
    const found=await env.DB.prepare('SELECT id FROM directory_templates WHERE id=?').bind(id).first();
    if(!found)throw new ApiError(404,'Şablon bulunamadı.');
    if(method==='PATCH'){
      const data=await readPayload(request);
      await env.DB.prepare('UPDATE directory_templates SET title=?,body=? WHERE id=?')
        .bind(requiredText(data.title,'Şablon adı',60),requiredText(data.body,'Mesaj',1000),id).run();
      return {ok:true};
    }
    if(method==='DELETE'){
      await env.DB.prepare('DELETE FROM directory_templates WHERE id=?').bind(id).run();
      return {ok:true};
    }
  }
  throw new ApiError(404,'Rehber işlemi bulunamadı.');
}
