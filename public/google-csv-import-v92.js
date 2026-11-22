'use strict';
// Google CSV importer, admin-only. Plaintext secrets are kept in memory only
// during preview, never rendered, logged, cached or uploaded before consent.
(function(){
 const $=id=>document.getElementById(id);
 const parser=window.HTGoogleCSVParser92;
 if(!parser||!$('v92GoogleCSVDialog'))return;
 const dialog=$('v92GoogleCSVDialog'),file=$('v92GoogleCSVFile'),preview=$('v92CsvList'),
  button=$('v92CsvSave'),cancel=$('v92CsvCancel'),agree=$('v92CsvAgree'),
  stats=$('v92CsvStats'),progress=$('v92CsvProgress');
 const isAdmin=()=>window.HTIdentity?.role==='admin';
 let staged=[],saving=false,lastCreated=0;
 const norm=parser.identity;
 function existingKey(record){
  return norm(record.institution_name,record.login_name,
   parser.sourceFromNotes(record.notes,record.login_url));
 }
 function statuses(entries,existing){
  const seen=new Set(existing.map(existingKey));
  let duplicates=0;
  return entries.map(row=>{
   const key=norm(row.institution_name,row.login_name,row.source_url);
   const duplicate=seen.has(key);
   seen.add(key);
   if(duplicate)duplicates++;
   return duplicate?'Mevcut / tekrar':'Yeni kayıt';
  });
 }
 function render(entries,labels){
  preview.replaceChildren();
  const kinds={HTTPS:0,Android:0,HTTP:0,Diğer:0};
  for(let i=0;i<entries.length;i++){
   const row=entries[i],kind=parser.sourceType(row.source_url);
   kinds[kind]++;
   const card=document.createElement('div');card.className='v92-csv-row';
   const title=document.createElement('strong');title.textContent=row.institution_name;
   const info=document.createElement('small');
   info.textContent='Hesap: '+(row.login_name||'(kullanıcı adı boş)')+
    ' · Adres: '+kind+' · Şifre: gizli';
   const state=document.createElement('span');
   state.textContent=labels[i];state.dataset.v92Duplicate=String(labels[i]!=='Yeni kayıt');
   card.append(title,info,state);
   preview.appendChild(card);
  }
  const duplicates=labels.filter(s=>s!=='Yeni kayıt').length;
  stats.textContent=entries.length+' kayıt · '+(entries.length-duplicates)+
   ' yeni · '+duplicates+' mevcut/tekrar · '+kinds.Android+' Android · '+
   (kinds.HTTP+kinds.Diğer)+' diğer güvenli olmayan veya standart dışı adres';
  if(duplicates)progress.textContent=
   'Mevcut veya aynı hesap bilgisiyle tekrarlanan kayıtlar değiştirilmeden atlanacak.';
 }
 function clear(){
  staged=[];lastCreated=0;saving=false;
  agree.checked=false;button.disabled=true;
  file.value='';preview.replaceChildren();stats.textContent='';
  progress.textContent='';
 }
 document.addEventListener('click',event=>{
  if(event.target.closest?.('#v92GoogleCSVOpen')){
   if(!isAdmin())return;
   event.preventDefault();
   file.value='';file.click();
  }
 });
 file.addEventListener('change',async()=>{
  const selected=file.files?.[0];file.value='';
  if(!selected||!isAdmin())return;
  try{
   if(selected.size>500000)throw new Error('Google CSV 500 KB sınırını aşamaz.');
   const text=await selected.text();
   const entries=parser.parse(text);
   // Metadata only. The server will recheck duplicates before each batch.
   const current=await api('vault');
   const labels=statuses(entries,current.vault||[]);
   staged=entries;
   render(entries,labels);
   agree.checked=false;button.disabled=true;
   dialog.showModal();
  }catch(error){
   clear();
   notice('Google CSV açılamadı: '+(error?.message||'Dosya biçimini kontrol et.'),true);
  }
 });
 agree.addEventListener('change',()=>{
  button.disabled=!isAdmin()||saving||!agree.checked||!staged.length;
 });
 cancel.addEventListener('click',()=>{if(!saving)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
 dialog.addEventListener('close',clear);
 button.addEventListener('click',async()=>{
  if(!isAdmin()||saving||!agree.checked||!staged.length)return;
  saving=true;button.disabled=true;cancel.disabled=true;
  let processed=0,created=0,skipped=0;
  try{
   while(processed<staged.length){
    const batch=staged.slice(processed,processed+50);
    const result=await api('vault/import-google','POST',{records:batch});
    created+=Number(result.created||0);skipped+=Number(result.skipped||0);
    processed+=batch.length;
    lastCreated=created;
    progress.textContent=processed+'/'+staged.length+
     ' işlendi · '+created+' yeni · '+skipped+' mevcut/tekrar atlandı';
   }
   dialog.close();
   await window.HTV26?.loadVault?.();
   notice(created+' yeni giriş kaydı şifreli kasaya eklendi. '+
    skipped+' mevcut/tekrar kayıt korunup atlandı.');
  }catch(error){
   progress.textContent='Aktarım '+processed+'/'+staged.length+
    ' kayıtta durdu. '+lastCreated+' yeni kayıt kaydedildi. '+
    'Aynı CSV dosyasını tekrar seçerek kalanları güvenle tamamlayabilirsin. '+
    'Neden: '+(error?.message||'Bağlantı hatası');
  }finally{
   saving=false;cancel.disabled=false;
   button.disabled=!agree.checked||!isAdmin()||!staged.length;
  }
 });
 document.addEventListener('ht:logout',()=>{
  if(dialog.open&&!saving)dialog.close();
  else if(!saving)clear();
 });
 window.HTGoogleCSV92={statuses};
})();
