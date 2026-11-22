import {ApiError,readJSON,requiredText,optionalText} from './validation.js';

// Personal address book is independent of the company/representative directory.
// Nothing is imported until the signed-in administrator selects a file and
// confirms the preview. No source contact records are shipped in the codebase.
export const personalContactsSchema=[
 "CREATE TABLE IF NOT EXISTS personal_contacts_v87 (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,phone TEXT NOT NULL,phone_key TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(name_key,phone_key))",
 "CREATE INDEX IF NOT EXISTS idx_personal_contacts_v87_name ON personal_contacts_v87(name_key)"
];

function contactInput(row){
 if(!row||typeof row!=='object'||Array.isArray(row))
  throw new ApiError(400,'Rehber kaydı geçersiz.');
 const name=requiredText(row.name,'Kişi adı',120).normalize('NFC');
 const phone=requiredText(row.phone,'Telefon numarası',35);
 const digits=phone.replace(/\D/g,'');
 if(!/^[+0-9 ().-]+$/.test(phone)||digits.length<7||digits.length>16)
  throw new ApiError(400,'Telefon 7-16 rakam içeren geçerli bir numara olmalı.');
 const label=optionalText(row.label,40);
 return {name,name_key:name.normalize('NFKC').toLocaleLowerCase('tr-TR'),
  phone,phone_key:digits,label};
}

export async function personalContactsRoute(request,env,path,method,principal){
 if(principal?.role!=='admin')throw new ApiError(403,'Kişi rehberi yalnız yöneticiye açıktır.');
 if(path==='/api/personal-contacts'&&method==='GET'){
  const response=await env.DB.prepare(
   'SELECT id,name,phone,label FROM personal_contacts_v87 ORDER BY name_key,phone_key').all();
  return {contacts:response.results||[]};
 }
 if(path==='/api/personal-contacts/import'&&method==='POST'){
  // Bounded, validated, additive operation. Never truncates old address book.
  const body=await readJSON(request,50000);
  if(!Array.isArray(body.contacts)||body.contacts.length<1||body.contacts.length>100)
   throw new ApiError(400,'Bir seferde 1-100 rehber numarası aktarabilirsin.');
  const input=body.contacts.map(contactInput);
  const known=new Set(),unique=[];
  for(const item of input){
   const key=JSON.stringify([item.name_key,item.phone_key]);
   if(known.has(key))continue;
   known.add(key);unique.push(item);
  }
  const statements=unique.map(c=>env.DB.prepare(
   'INSERT OR IGNORE INTO personal_contacts_v87(id,name,name_key,phone,phone_key,label) VALUES(?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),c.name,c.name_key,c.phone,c.phone_key,c.label));
  const results=await env.DB.batch(statements);
  const added=results.reduce((sum,r)=>sum+Number(r.meta?.changes||0),0);
  return {added,skipped:input.length-added};
 }
 throw new ApiError(404,'Rehber işlemi bulunamadı.');
}
