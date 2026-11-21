'use strict';
/* V71 - Review-first bill / card statement photo import.
   OCR stays in the browser. No image or OCR text is posted to any application API.
   Only an explicitly confirmed existing record form can save financial data. */
(function(){
 const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
 const lines=s=>String(s||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
 const makeDate=(y,m,d)=>{
   const year=Number(y),month=Number(m),day=Number(d);
   if(year<2000||year>2100||month<1||month>12||day<1||day>31)return '';
   const date=new Date(Date.UTC(year,month-1,day));
   if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '';
   return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 };
 function dateFrom(text){
   const s=String(text||'');
   let m=s.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
   if(m)return makeDate(m[1],m[2],m[3]);
   m=s.match(/\b(\d{1,2})[-./](\d{1,2})[-./](20\d{2})\b/);
   return m?makeDate(m[3],m[2],m[1]):'';
 }
 function labeledDate(rows,pattern){
   const index=rows.findIndex(x=>pattern.test(x));
   if(index<0)return '';
   return dateFrom(rows[index])||dateFrom(rows[index+1]||'');
 }
 function periodFrom(rows){
   const index=rows.findIndex(x=>/\b(?:fatura\s+dönemi|ekstre\s+dönemi|hesap\s+özeti\s+dönemi|dönem)\b/iu.test(x));
   if(index<0)return '';
   const relevant=[rows[index],rows[index+1]||''].join(' ');
   let m=relevant.match(/\b(20\d{2})[-./](0?[1-9]|1[0-2])\b/);
   if(m)return m[1]+'-'+String(m[2]).padStart(2,'0');
   m=relevant.match(/\b(0?[1-9]|1[0-2])[-./](20\d{2})\b/);
   if(m)return m[2]+'-'+String(m[1]).padStart(2,'0');
   return '';
 }
 function parseMoney(value){
   const input=String(value||'').replace(/[₺\u00a0\s]|(?:TL|TRY)/giu,'').trim();
   if(!input)return '';
   let major='',minor='';
   if(/,\d{1,2}$/.test(input)){const i=input.lastIndexOf(',');major=input.slice(0,i).replace(/[.,]/g,'');minor=input.slice(i+1);}
   else if(/\.\d{2}$/.test(input)){const i=input.lastIndexOf('.');major=input.slice(0,i).replace(/[.,]/g,'');minor=input.slice(i+1);}
   else {major=input.replace(/[.,]/g,'');minor='00';}
   if(!/^\d{1,9}$/.test(major)||!/^\d{1,2}$/.test(minor))return '';
   const kuru=Number(major)*100+Number(minor.padEnd(2,'0'));
   if(kuru<=0||!Number.isSafeInteger(kuru))return '';
   return Number(major)+','+minor.padEnd(2,'0');
 }
 function findLabeledAmount(rows,labels){
   const re=/((?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[.,]\d{2})?)\s*(?:₺|TL|TRY)?/giu;
   for(const pattern of labels){
     for(let i=0;i<rows.length;i++){
       if(!pattern.test(rows[i]))continue;
       for(const row of [rows[i],rows[i+1]||'']){
         const found=[...row.matchAll(re)].map(m=>m).filter(m=>{
           const token=m[1];
           if(/\b20\d{2}\b/.test(token)&&!/[.,]/.test(token)&&!/(?:TL|TRY|₺)/iu.test(m[0]))return false;
           return /[.,]\d{2}$/.test(token)||/(?:TL|TRY|₺)/iu.test(m[0]);
         });
         const value=parseMoney(found.at(-1)?.[1]||'');
         if(value)return value;
       }
     }
   }
   return '';
 }
 function labeledCode(rows,pattern){
   for(let i=0;i<rows.length;i++){
     const m=rows[i].match(pattern);
     if(!m)continue;
     const val=String(m[1]||rows[i+1]||'').trim().split(/\s{2,}/)[0];
     if(/^[\p{L}\d/-]{3,90}$/u.test(val))return val.slice(0,90);
   }
   return '';
 }
 function parseBill(raw){
   const rows=lines(raw),blob=norm(raw);
   const providers=[
     ['İSKİ',/iski|istanbul su ve kanalizasyon/iu],
     ['İGDAŞ',/igdaş|igd[aâ]ş|istanbul gaz/iu],
     ['Enerjisa',/enerjisa/iu],['CK Boğaziçi Elektrik',/ck\s*boğaziçi/iu],
     ['BEDAŞ',/bedaş/iu],['Türk Telekom',/türk\s*telekom/iu],
     ['Turkcell',/turkcell/iu],['Vodafone',/vodafone/iu],
     ['Superonline',/superonline/iu],['İZSU',/izsu/iu],['ASKİ',/\baski\b/iu]
   ];
   const company=providers.find(([,match])=>match.test(blob));
   const category=/(?:doğal\s*gaz|doğalgaz|igd[aâ]ş)/iu.test(blob)?'gas':
     /(?:su ve kanalizasyon|içme suyu|iski|izsu)/iu.test(blob)?'water':
     /(?:elektrik|enerji\s*bedeli|bedaş|enerjisa)/iu.test(blob)?'electricity':
     /(?:internet|fiber|superonline)/iu.test(blob)?'internet':
     /(?:gsm|mobil\s*hat|telefon)/iu.test(blob)?'phone':'other';
   const issue_date=labeledDate(rows,/fatura\s*tarihi|düzenleme\s*tarihi/iu);
   const due_date=labeledDate(rows,/son\s*ödeme(?:\s*tarihi)?|ödeme\s*son\s*tarihi|son\s*ödeme\s*günü/iu);
   const explicitPeriod=periodFrom(rows);
   return {category,provider:company?.[0]||'',
     subscription_no:labeledCode(rows,/(?:abonelik|abone|tesisat)\s*(?:no|numara(?:sı)?)\s*[:#-]?\s*(.*)$/iu),
     invoice_no:labeledCode(rows,/fatura\s*(?:no|numara(?:sı)?)\s*[:#-]?\s*(.*)$/iu),
     issue_date,due_date,period:explicitPeriod||issue_date.slice(0,7),
     period_estimated:!explicitPeriod&&!!issue_date,
     amount:findLabeledAmount(rows,[/ödenecek\s*(?:toplam|tutar|miktar)/iu,/toplam\s*(?:ödenecek|fatura)\s*(?:tutar|bedel)/iu,/fatura\s*tutarı/iu,/genel\s*toplam/iu])
   };
 }
 function parseStatement(raw,cards=[]){
   const rows=lines(raw),clean=norm(raw);
   const due_date=labeledDate(rows,/son\s*ödeme\s*tarihi|ödeme\s*son\s*tarihi/iu);
   const statement_date=labeledDate(rows,/hesap\s*kesim\s*tarihi|ekstre\s*tarihi/iu);
   const explicitPeriod=periodFrom(rows);
   let last4='';
   const tail=String(raw||'').match(/(?:\*{3,}|x{3,}|X{3,}|•{3,})[\s-]*(\d{4})\b/);
   if(tail)last4=tail[1];
   const known=(Array.isArray(cards)?cards:[]).filter(c=>{
     const bank=norm(c.bank);
     return bank&&bank.length>=3&&clean.includes(bank);
   });
   const last4Cards=last4?(Array.isArray(cards)?cards:[]).filter(c=>String(c.last4||'')===last4):[];
   let matched=[];
   if(last4Cards.length&&known.length)matched=last4Cards.filter(c=>known.some(k=>k.id===c.id));
   else if(last4Cards.length)matched=last4Cards;
   else matched=known;
   const card_id=matched.length===1?matched[0].id:'';
   return {card_id,bank_name:known.length===1?known[0].bank:'',
     last4,statement_date,due_date,period:explicitPeriod||statement_date.slice(0,7),
     period_estimated:!explicitPeriod&&!!statement_date,
     amount:findLabeledAmount(rows,[/dönem\s*borcu/iu,/hesap\s*özeti\s*borcu/iu,/ekstre\s*(?:borcu|tutarı)/iu,/toplam\s*borç/iu,/ödenecek\s*(?:toplam|tutar)/iu])
   };
 }
 const publicApi={dateFrom,parseMoney,parseBill,parseStatement};
 if(typeof window!=='undefined')window.HTDocumentImportV71=publicApi;
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id);
 const canEdit=()=>window.HTIdentity?.role==='admin';
 const lib='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
 let loading=null,worker=null,imageUrl='',currentKind='',run=0,busy=false;
 function status(message,error=false){const e=$('v71DocStatus');if(e){e.textContent=message;e.dataset.error=error?'true':'false';}}
 function library(){
   if(window.Tesseract?.createWorker)return Promise.resolve();
   if(loading)return loading;
   loading=new Promise((resolve,reject)=>{
     const script=document.createElement('script');script.src=lib;script.crossOrigin='anonymous';
     script.onload=()=>window.Tesseract?.createWorker?resolve():reject(Error('Metin okuma motoru yüklenemedi.'));
     script.onerror=()=>reject(Error('Metin okuma indirilemedi. İnternet bağlantısını kontrol et.'));
     document.head.append(script);
   }).catch(e=>{loading=null;throw e;});
   return loading;
 }
 function reset(){
   run++;busy=false;
   if(worker){const old=worker;worker=null;Promise.resolve(old.terminate()).catch(()=>{});}
   if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl='';}
   $('v71DocPreview').removeAttribute('src');
   $('v71DocRaw').value='';$('v71DocFound').replaceChildren();
 }
 function draft(){
   const raw=$('v71DocRaw').value;
   const data=currentKind==='bill'?parseBill(raw):parseStatement(raw,typeof state==='undefined'?[]:state.cards);
   const preview=$('v71DocFound');preview.replaceChildren();
   const entries=currentKind==='bill'?
     [['Tür',({electricity:'Elektrik',gas:'Doğalgaz',water:'Su',phone:'Telefon',internet:'İnternet',other:'Belirlenemedi'})[data.category]],
      ['Kurum',data.provider],['Fatura numarası',data.invoice_no],['Abonelik',data.subscription_no],
      ['Dönem',data.period],['Fatura tarihi',data.issue_date],['Son ödeme',data.due_date],['Tutar',data.amount]]:
     [['Banka',data.bank_name],['Kart son 4',data.last4],
      ['Kart eşleştirme',data.card_id?'Kart bulundu':'Kartı formda seç'],
      ['Dönem',data.period],['Kesim tarihi',data.statement_date],['Son ödeme',data.due_date],['Ekstre tutarı',data.amount]];
   for(const [label,value] of entries){
     const row=document.createElement('div');row.className='v71-doc-result-row';
     const k=document.createElement('span'),v=document.createElement('strong');
     k.textContent=label;v.textContent=value||'Kontrol gerekli';row.append(k,v);preview.append(row);
   }
   const guessed=$('v71DocGuess');
   guessed.textContent=data.period_estimated?'Dönem tarihi belgeden kesin okunamadı; tahmini dönemi mutlaka kontrol et.':'Okunan rakamları ve tarihleri kayıt öncesi kontrol et.';
   return data;
 }
 async function normalizeImage(file){
   if(!file||file.size>10*1024*1024)throw Error('Görsel en fazla 10 MB olabilir.');
   if(!/^image\/(?:png|jpeg|webp|heic|heif)$/i.test(file.type||'')&&
      !/\.(?:png|jpe?g|webp|heic|heif)$/i.test(file.name||''))throw Error('JPG, PNG, WebP veya iPhone fotoğrafı seç.');
   const img=new Image();
   const src=URL.createObjectURL(file);
   imageUrl=src;$('v71DocPreview').src=src;
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Görsel açılamadı. HEIC kullanıyorsan ekran görüntüsü veya JPG seç.'));img.src=src;});
   const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Görsel dönüştürülemedi.')),'image/jpeg',.93));
 }
 async function importFile(file){
   const serial=++run;
   const dialog=$('v71DocDialog');dialog.showModal();busy=true;
   $('v71DocFound').replaceChildren();$('v71DocRaw').value='';
   $('v71DocApply').disabled=true;
   status('Görsel hazırlanıyor...');
   try{
     const blob=await normalizeImage(file);if(serial!==run)return;
     status('Türkçe metin tanıma hazırlanıyor...');
     await library();if(serial!==run)return;
     const w=await window.Tesseract.createWorker(['tur','eng'],1,{
       workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
       corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
       workerBlobURL:true
     });
     if(serial!==run){await w.terminate();return;}
     worker=w;
     status('Fotoğraftaki bilgiler okunuyor...');
     const result=await w.recognize(blob);
     if(serial!==run)return;
     const raw=String(result?.data?.text||'').trim().slice(0,20000);
     $('v71DocRaw').value=raw;
     status(raw?'Bilgiler okundu. Eksikleri kontrol edip ilgili forma aktar.':'Metin bulunamadı. Daha net fotoğraf seç veya metni elle yaz.',!raw);
     $('v71DocApply').disabled=!raw;
     draft();
   }catch(error){
     if(serial===run)status('Görsel okunamadı: '+String(error?.message||error)+' Metni elle girebilirsin.',true);
   }finally{
     if(worker){const old=worker;worker=null;try{await old.terminate();}catch{}}
     if(serial===run)busy=false;
   }
 }
 document.addEventListener('click',event=>{
   if(event.target.closest('#v71BillClearFilters')){
     for(const [id,value] of [['v50BillSearch',''],['v50BillCategory','all'],['v50BillStatus','all'],['v50BillPeriod','']]){
       const field=$(id);if(field)field.value=value;
     }
     window.HTBillsV50?.render?.();return;
   }
   const importButton=event.target.closest('[data-v71-photo]');
   if(importButton){
     if(!canEdit())return;
     currentKind=importButton.dataset.v71Photo;
     if(!['bill','statement'].includes(currentKind))return;
     const input=$('v71DocFile');input.value='';input.click();return;
   }
   if(event.target.closest('#v71DocCancel')){$('v71DocDialog').close();return;}
   if(event.target.closest('#v71DocApply')){
     if(!canEdit()||busy)return;
     if(!$('v71DocRaw').value.trim()){status('Önce bir fotoğraf okut veya metni gir.',true);return;}
     const data=draft();
     const applied=currentKind==='bill'?
       window.HTBillsV50?.openImportedDraft?.(data):
       window.HTStatementImportV71?.(data);
     if(applied!==false&&applied!==undefined)$('v71DocDialog').close();
     else if(applied===undefined)status('Kayıt formu açılamadı.',true);
   }
 });
 document.addEventListener('input',event=>{
   if(event.target.id==='v71DocRaw'){
     $('v71DocApply').disabled=busy||!event.target.value.trim();
     draft();
   }
 });
 document.addEventListener('change',async event=>{
   if(event.target.id!=='v71DocFile')return;
   const file=event.target.files?.[0];
   if(file&&canEdit())await importFile(file);
 });
 $('v71DocDialog')?.addEventListener('close',reset);
})();