'use strict';
// V45: read a bulk JSON file locally, let admin review every record,
// then submit the reviewed set once. No JSON is included in public assets.
(function(){
 const $=id=>document.getElementById(id);
 const types=['bank','bank_pos','payment','platform','other'];
 const admin=()=>window.HTIdentity?.role==='admin';
 const normalize=value=>String(value||'').trim().normalize('NFKC').toLocaleLowerCase('tr-TR');
 let records=[],existing=new Set(),saving=false;
 function status(value,error=false){
  const node=$('v45BulkStatus');
  node.textContent=value;node.dataset.error=error?'true':'false';
 }
 function element(tag,className,textValue){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(textValue!==undefined)node.textContent=textValue;
  return node;
 }
 function parse(json){
  const items=Array.isArray(json)?json:json?.records;
  if(!Array.isArray(items)||items.length<1||items.length>50)
   throw new Error('Toplu JSON dosyasında 1–50 kayıt olmalı: {"records":[...]} veya doğrudan [...].');
  return items.map((r,index)=>{
   if(!r||typeof r!=='object'||Array.isArray(r))throw new Error((index+1)+'. kayıt geçersiz.');
   for(const key of ['institution_name','login_name','login_url','notes','password']){
    if(r[key]!=null&&typeof r[key]!=='string')
     throw new Error((index+1)+'. kayıt: '+key+' metin olmalı.');
   }
   const item={
    category:r.category||'other',
    institution_name:(r.institution_name||'').trim(),
    login_name:r.login_name||'',
    login_url:r.login_url||'',
    password:r.password||'',
    notes:r.notes||''
   };
   if(!types.includes(item.category))throw new Error((index+1)+'. kayıtta hesap türü geçersiz.');
   if(!item.institution_name||item.institution_name.length>120||
      item.login_name.length>120||item.login_url.length>500||
      item.password.length>500||item.notes.length>12000)
    throw new Error((index+1)+'. kayıtta eksik veya fazla uzun bilgi var.');
   if(item.login_url){
    let link;
    try{link=new URL(item.login_url);}catch{}
    if(link?.protocol!=='https:')throw new Error((index+1)+'. kaydın giriş adresi HTTPS olmalı.');
   }
   if(r.extra_fields!==undefined){
    if(!Array.isArray(r.extra_fields)||r.extra_fields.length>10)
     throw new Error((index+1)+'. kayıtta en fazla 10 ek alan olabilir.');
    item.extra_fields=r.extra_fields.map(field=>{
     if(!field||typeof field!=='object'||typeof field.label!=='string'||
      !field.label.trim()||field.label.length>60||!['text','secret'].includes(field.kind)||
      typeof field.value!=='string'||!field.value||field.value.length>500)
      throw new Error((index+1)+'. kayıtta ek alan geçersiz.');
     return {label:field.label,kind:field.kind,value:field.value};
    });
   }
   return item;
  });
 }
 function field(host,record,title,key,kind,max){
  const label=element('label','v45-field',title);
  const input=element(kind==='textarea'?'textarea':kind==='select'?'select':'input');
  if(kind==='textarea')input.rows=5;
  else if(kind==='select'){
   for(const type of types){
    const option=element('option','',type==='bank'?'Banka':
     type==='bank_pos'?'Banka POS':type==='payment'?'Ödeme Kuruluşu':
     type==='platform'?'Platform':'Diğer');
    option.value=type;input.appendChild(option);
   }
  }else input.type=kind==='password'?'password':'text';
  if(max)input.maxLength=max;
  input.value=record[key]||'';
  input.dataset.v45Field=key;
  input.addEventListener(kind==='select'?'change':'input',()=>{
   record[key]=input.value;
   refresh();
  });
  label.appendChild(input);host.appendChild(label);
 }
 function classifications(){
  const seen=new Set(existing);
  let duplicates=0,invalid=0;
  for(const record of records){
   const name=String(record.institution_name||'').trim();
   const key=normalize(name);
   record._duplicate=!!key&&seen.has(key);
   record._invalid=!key||name.length>120||
    record.login_name.length>120||record.login_url.length>500||
    record.password.length>500||record.notes.length>12000;
   if(record.login_url){
    try{const u=new URL(record.login_url);if(u.protocol!=='https:')record._invalid=true;}
    catch{record._invalid=true;}
   }
   if(record._duplicate)duplicates++;
   else if(key)seen.add(key);
   if(record._invalid)invalid++;
  }
  return {duplicates,invalid,ready:records.length-duplicates-invalid};
 }
 function refresh(){
  const totals=classifications();
  const count=$('v45BulkCount');
  count.textContent=records.length+' kayıt · '+totals.ready+' yeni · '+
   totals.duplicates+' tekrarlanan · '+totals.invalid+' hatalı';
  const cards=$('v45BulkList').children;
  for(let i=0;i<records.length;i++){
   const statusNode=cards[i].querySelector('[data-v45-rowstatus]');
   const r=records[i];
   statusNode.textContent=r._invalid?'Kontrol gerekli':r._duplicate?'Atlanacak (mevcut/tekrar)':'Yeni kayıt';
   statusNode.dataset.state=r._invalid?'invalid':r._duplicate?'duplicate':'new';
  }
  $('v45BulkSave').disabled=saving||totals.invalid>0||totals.ready===0;
  return totals;
 }
 function render(){
  const host=$('v45BulkList');host.replaceChildren();
  for(let i=0;i<records.length;i++){
   const record=records[i];
   const row=element('details','v45-bulk-record');
   const summary=element('summary');
   const heading=element('span','v45-bulk-title',(i+1)+'. ');
   const name=element('strong','',record.institution_name);
   heading.appendChild(name);
   const state=element('span','v45-bulk-state');state.dataset.v45Rowstatus='';
   summary.appendChild(heading);summary.appendChild(state);
   row.appendChild(summary);
   const editor=element('div','v45-bulk-editor');
   field(editor,record,'Kayıt adı','institution_name','text',120);
   field(editor,record,'Hesap türü','category','select');
   field(editor,record,'Kullanıcı adı','login_name','text',120);
   field(editor,record,'Şifre (gizli)','password','password',500);
   field(editor,record,'HTTPS giriş adresi','login_url','text',500);
   field(editor,record,'Hakkında','notes','textarea',12000);
   if(record.extra_fields?.length)
    editor.appendChild(element('p','hint','Ek alanlar ('+record.extra_fields.length+
     ') JSON dosyasından alınır. Ek alanları değiştirmek istersen dosyayı düzenle.'));
   row.appendChild(editor);
   host.appendChild(row);
   // Update the row title if the administrator corrects an OCR or spelling error.
   editor.querySelector('[data-v45-field="institution_name"]').addEventListener('input',()=>{
    name.textContent=record.institution_name||'(adsız kayıt)';
   });
  }
  refresh();
 }
 function clear(){
  records=[];existing=new Set();saving=false;
  $('v45BulkList').replaceChildren();
  $('v45BulkCount').textContent='';
  $('v45BulkStatus').textContent='';
  $('v45BulkFile').value='';
  $('v45BulkSave').disabled=true;
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('#v45BulkOpen')&&admin()){
   $('v45BulkFile').value='';$('v45BulkFile').click();return;
  }
  if(event.target.closest('#v45BulkCancel')){
   if(!saving)$('v45BulkDialog').close();
  }
 });
 document.addEventListener('change',async event=>{
  if(event.target.id!=='v45BulkFile'||!admin())return;
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  try{
   if(file.size>900000)throw new Error('JSON dosyası 900 KB sınırını aşamaz.');
   // Only the browser reads the file, until admin explicitly saves.
   const json=JSON.parse(await file.text());
   const items=parse(json);
   const data=await api('vault');
   existing=new Set((data.vault||[]).map(v=>normalize(v.institution_name)));
   records=items;
   render();
   status('Bilgileri, özellikle şifreleri kontrol et. Aynı isimli kayıtlar atlanacak.');
   $('v45BulkDialog').showModal();
  }catch(error){
   clear();
   notice('Toplu JSON açılamadı: '+(error?.message||'Geçersiz dosya.'),true);
  }
 });
 $('v45BulkSave').addEventListener('click',async()=>{
  if(!admin()||saving)return;
  const totals=refresh();
  if(totals.invalid){status('Kırmızı işaretli kayıtları düzelt.',true);return;}
  if(!totals.ready){status('Kaydedilecek yeni kayıt yok.',true);return;}
  saving=true;
  $('v45BulkSave').disabled=true;
  $('v45BulkCancel').disabled=true;
  status('Yeni kayıtlar şifreli kasaya kaydediliyor...');
  try{
   // Submit all validated rows; the server rechecks duplicates and permissions.
   const send=records.map(r=>{
    const {category,institution_name,login_name,login_url,password,notes,extra_fields}=r;
    return {category,institution_name,login_name,login_url,password,notes,
     ...(extra_fields?{extra_fields}:{})};
   });
   const result=await api('vault/import-batch','POST',{records:send});
   $('v45BulkDialog').close();
   await window.HTV26?.loadVault();
   notice(result.created+' kayıt eklendi. '+result.skipped+' tekrarlanan kayıt atlandı.');
  }catch(error){
   status('Kayıt yapılamadı: '+error.message,true);
  }finally{
   saving=false;
   $('v45BulkCancel').disabled=false;
   if($('v45BulkDialog').open)refresh();
  }
 });
 $('v45BulkDialog').addEventListener('close',clear);
 window.HTVaultBulk45={parse};
})();
