'use strict';
// V44: on-device OCR for one bank/platform record at a time. The image is
// never uploaded: only reviewed form fields reach the existing vault API.
(function(){
 const LIB='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
 const WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
 const $=id=>document.getElementById(id);
 let loading=null,worker=null,previewUrl='',running=false,job=0;
 const isAdmin=()=>window.HTIdentity?.role==='admin';

 function parseText(raw){
  const rows=String(raw||'').replace(/\r/g,'').replace(/[\u200b\ufeff]/g,'')
   .split('\n').map(s=>s.trim()).filter(Boolean);
  const excluded=new Set();let login_name='',password='',institution_name='',login_url='';
  const credential=/^(?:(?:admin|panel|site|sistem|giriş)\s+)?(kullanıcı\s*adı|kullanici\s*adi|kullanıcı\s*ismi|username|user\s*name|login\s*name|giriş\s*adı|şifre|sifre|password|parola)\s*[:：=\-–]\s*(.*)$/iu;
  const named=/^(?:firma|kurum|site|mağaza|magaza|platform|hesap)\s*(?:adı|ismi|unvanı|ünvanı)\s*[:：=\-–]\s*(.*)$/iu;
  for(let i=0;i<rows.length;i++){
   const line=rows[i],found=line.match(credential);
   const n=line.match(named);
   if(n&&n[1]&&!institution_name){institution_name=n[1].trim().slice(0,120);excluded.add(i);continue;}
   if(!found)continue;
   let val=(found[2]||'').trim(),next=-1;
   if(!val&&i+1<rows.length&&rows[i+1].length<=120&&!credential.test(rows[i+1])){
    val=rows[i+1];next=i+1;
   }
   if(!val)continue;
   if(/şifre|sifre|password|parola/iu.test(found[1])){
    if(!password){password=val.slice(0,500);excluded.add(i);if(next>=0)excluded.add(next);}
   }else if(!login_name){
    login_name=val.slice(0,120);excluded.add(i);if(next>=0)excluded.add(next);
   }
  }
  // Use an explicit HTTPS panel address, not a guessed /admin URL.
  const urls=rows.join(' ').match(/https:\/\/[^\s<>"'()]+/giu)||[];
  const good=urls.find(s=>/\/(?:admin|login|signin|panel)(?:\/|\?|$)/iu.test(s))||urls[0];
  if(good){try{const u=new URL(good.replace(/[.,;]+$/,''));if(u.protocol==='https:')login_url=u.href.slice(0,500);}catch{}}
  if(!institution_name){
   const title=rows.slice(0,8).find(s=>{
    const clean=s.replace(/^\d+[.)]\s*/, '').trim();
    return clean.length>=3&&clean.length<=75&&!/^(?:\d+[.):]|domain|hosting|site\s*bilgi|teknik\s*destek|altyapı|entegrasyon|admin\s*panel|kullanıcı|sifre|şifre|parola|www\.|http|netgsm|önemli|opencart)/iu.test(clean)
      &&!credential.test(s)&&!/^\+?\d[\d\s-]{5,}$/.test(s);
   });
   if(title){
    let name=title.replace(/^\d+[.)]\s*/,'').trim();
    const parts=name.split(/\s+[-–—]\s+/);
    if(parts.length>1&&/^(?:site|giriş|kurum|kullanıcı)\s+bilgileri$|^hakkında$/iu
      .test(parts.slice(1).join(' - ').toLocaleLowerCase('tr-TR')))name=parts[0];
    institution_name=name.slice(0,120);
   }
  }
  const remaining=rows.filter((s,i)=>!excluded.has(i)).join('\n');
  const notes=remaining.length<=12000?remaining:remaining.slice(0,12000);
  return {category:'platform',institution_name,login_name,login_url,password,notes,
   truncated:remaining.length>12000};
 }

 function status(message,isError=false){
  const node=$('v44OcrStatus');if(!node)return;
  node.textContent=message;node.dataset.error=isError?'true':'false';
 }
 function loadLibrary(){
  if(window.Tesseract?.createWorker)return Promise.resolve();
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=LIB;script.crossOrigin='anonymous';
   script.onload=()=>window.Tesseract?.createWorker?resolve():reject(new Error('OCR motoru yüklenemedi.'));
   script.onerror=()=>reject(new Error('OCR motoru indirilemedi. İnternet bağlantını kontrol et.'));
   document.head.appendChild(script);
  }).catch(err=>{loading=null;throw err;});
  return loading;
 }
 function cleanup(){
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
  $('v44OcrPreview').removeAttribute('src');
 }
 function stop(){
  job++;
  if(worker){const w=worker;worker=null;Promise.resolve(w.terminate()).catch(()=>{});}
  running=false;
  $('v44OcrApply').disabled=false;
  cleanup();
 }
 async function readImage(file){
  const current=++job;
  if(!isAdmin())return;
  const dialog=$('v44OcrDialog');
  if(file.size>12*1024*1024)throw new Error('Fotoğraf 12 MB sınırını aşıyor.');
  if(!file.type.startsWith('image/'))throw new Error('PNG, JPG veya telefon fotoğrafı seç.');
  if(!dialog.open)dialog.showModal();
  cleanup();previewUrl=URL.createObjectURL(file);
  $('v44OcrPreview').src=previewUrl;
  $('v44OcrRaw').value='';
  $('v44OcrApply').disabled=true;
  status('Türkçe ve İngilizce metin tanıma hazırlanıyor. İlk kullanımda dil dosyaları indirilebilir.');
  running=true;
  try{
   await loadLibrary();if(current!==job)return;
   const w=await window.Tesseract.createWorker(['tur','eng'],1,{
    workerPath:WORKER,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',workerBlobURL:true,
    logger:m=>{
     if(current!==job)return;
     const pct=Number.isFinite(m.progress)?' (%'+Math.round(m.progress*100)+')':'';
     status('Resimdeki yazılar okunuyor: '+String(m.status||'OCR')+pct);
    }
   });
   if(current!==job){await w.terminate();return;}
   worker=w;
   const result=await w.recognize(file);
   if(current!==job)return;
   const text=String(result?.data?.text||'').trim();
   $('v44OcrRaw').value=text.slice(0,20000);
   $('v44OcrApply').disabled=!text;
   status(text?
    'Metin okundu. Yanlış harf ve rakamları kontrol et, sonra “Alanlara Aktar”a bas.':
    'Resimde metin bulunamadı. Aşağıya elle yazabilir veya farklı fotoğraf seçebilirsin.',!text);
  }catch(error){
   if(current===job){
    status('Otomatik okuma başarısız: '+(error?.message||'Beklenmeyen hata')+
     '. İstersen metni aşağıya elle yapıştırıp aktar.',true);
    $('v44OcrApply').disabled=false;
   }
  }finally{
   if(worker){const w=worker;worker=null;try{await w.terminate();}catch{}}
   if(current===job)running=false;
  }
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('#v44ImageImport')){
   if(!isAdmin())return;
   const input=$('v44ImageFile');input.value='';input.click();return;
  }
  if(event.target.closest('#v44OcrCancel')){
   $('v44OcrDialog').close();return;
  }
  if(event.target.closest('#v44OcrApply')){
   if(!isAdmin()||running)return;
   const raw=$('v44OcrRaw').value.trim();
   if(!raw){status('Aktarılacak metin yok.',true);return;}
   const draft=parseText(raw);
   $('v44OcrDialog').close();
   if(typeof window.HTV26?.importImageDraft!=='function'){status('Giriş formu bulunamadı.',true);return;}
   window.HTV26.importImageDraft(draft);
   if(draft.truncated&&typeof window.notice==='function')
    window.notice('Hakkında metninin ilk 12.000 karakteri aktarıldı; kayıt öncesi kontrol et.',true);
  }
 });
 document.addEventListener('change',async event=>{
  if(event.target.id!=='v44ImageFile')return;
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||!isAdmin())return;
  try{await readImage(file);}catch(error){
   status(error?.message||'Fotoğraf açılamadı.',true);
   if(!$('v44OcrDialog').open)$('v44OcrDialog').showModal();
  }
 });
 document.addEventListener('input',event=>{
  if(event.target.id==='v44OcrRaw'&&!running)$('v44OcrApply').disabled=!event.target.value.trim();
 });
 $('v44OcrDialog').addEventListener('close',stop);
 // Escape/Cancel should not leave large images or OCR workers running.
 window.HTImage44={parseText};
})();
