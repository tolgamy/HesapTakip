'use strict';
// Personal directory v87: independent of firms, members, finance and vault.
// Only an explicit administrator action can send selected contacts to the app.
// No hidden upload and no contacts embedded in public assets.
(function(){
 function unescapeVcard(text){
  return String(text||'').replace(/\\n/gi,'\n')
   .replace(/\\([,;\\])/g,'$1').trim();
 }
 function parseVCF(source){
  if(typeof source!=='string'||source.length>3_000_000)throw Error('Rehber dosyası en fazla 3 MB olmalı.');
  const lines=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const unfolded=[];
  for(const line of lines){
   if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);
   else unfolded.push(line);
  }
  const result=[],known=new Set();let record=null,cardCount=0,skipped=0;
  const finish=()=>{
   if(!record)return;
   cardCount++;
   const name=record.fn||record.n||'';
   if(!name||!record.tels.length){skipped++;return;}
   for(const item of record.tels){
    let phone=item.phone.replace(/^tel:/i,'').trim();
    const numbers=phone.replace(/\D/g,'');
    if(!/^[+0-9 ().-]+$/.test(phone)||numbers.length<7||numbers.length>16){skipped++;continue;}
    const key=name.normalize('NFKC').toLocaleLowerCase('tr-TR')+'\0'+numbers;
    if(known.has(key))continue;
    known.add(key);
    result.push({name,phone,label:item.label.slice(0,40)});
   }
  };
  for(const line of unfolded){
   if(/^BEGIN:VCARD$/i.test(line.trim())){record={fn:'',n:'',tels:[]};continue;}
   if(/^END:VCARD$/i.test(line.trim())){finish();record=null;continue;}
   if(!record)continue;
   const col=line.indexOf(':');if(col<0)continue;
   const param=line.slice(0,col),raw=line.slice(col+1);
   const tag=param.split(';')[0].split('.').pop().toUpperCase();
   if(tag==='FN')record.fn=unescapeVcard(raw).slice(0,120);
   else if(tag==='N'&&!record.n){
    const parts=raw.split(';').map(unescapeVcard);
    record.n=[parts[1]||'',parts[0]||''].filter(Boolean).join(' ').slice(0,120);
   }else if(tag==='TEL'){
    const label=/(?:^|;)TYPE=([^;:]+)/i.exec(param)?.[1]||'Telefon';
    record.tels.push({phone:unescapeVcard(raw),label});
   }
  }
  return {contacts:result,cards:cardCount,skipped};
 }
 const $=id=>document.getElementById(id);
 const panel=$('v87ContactsPanel');
 if(!panel)return;
 const list=$('v87ContactsList'),search=$('v87ContactSearch'),notice=$('v87ContactsNotice');
 const count=$('v87ContactsCount'),preview=$('v87ImportPreview');
 const file=$('v87VcfInput'),confirm=$('v87ConfirmImport'),importButton=$('v87OpenVcf');
 const previewText=$('v87ImportPreviewText'),form=$('v87NewContactForm');
 let contacts=[],pending=[],busy=false,loaded=false;
 // Five contiguous groups in the Turkish alphabet. Unclassified names stay
 // reachable in the final group rather than silently disappearing.
 const groups=[
  {label:'A–C',letters:'ABC'},
  {label:'Ç–F',letters:'ÇDEF'},
  {label:'G–L',letters:'GĞHIİJKL'},
  {label:'M–R',letters:'MNOÖPR'},
  {label:'S–Z',letters:'SŞTUÜVYZ'}
 ];
 const collator=new Intl.Collator('tr-TR',{sensitivity:'base',numeric:true});
 let activeGroup=0,shown=75,deleteExpected=0;
 const isAdmin=()=>window.HTIdentity?.role==='admin';
 const groupForName=name=>{
  const letter=String(name||'').normalize('NFC').match(/[A-Za-zÇĞİÖŞÜçğıöşü]/u)?.[0]?.toLocaleUpperCase('tr-TR')||'';
  const idx=groups.findIndex(group=>group.letters.includes(letter));
  return idx<0?4:idx;
 };
 const groupCounts=()=>groups.map((_,i)=>contacts.filter(c=>groupForName(c.name)===i).length);
 function groupUI(){
  const counts=groupCounts();
  for(const button of document.querySelectorAll('[data-v89-group]')){
   const index=Number(button.dataset.v89Group),active=index===activeGroup;
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
   const summary=button.querySelector('small');
   if(summary)summary.textContent=counts[index]+' kayıt';
  }
  const title=$('v89GroupTitle');
  if(title)title.textContent=activeGroup<0?'Tüm Kişiler':groups[activeGroup].label+' Grubu';
  const total=$('v89DirectoryTotal');
  if(total)total.textContent='Toplam: '+contacts.length+' numara kaydı';
  $('v89DeleteAll').disabled=!contacts.length||busy;
 }

 const announce=message=>{notice.textContent=message;};
 async function request(path,method='GET',payload){
  const options={method,credentials:'same-origin',headers:{Accept:'application/json'}};
  if(payload!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(payload);}
  const response=await fetch(path,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||data.message||'Rehber işleminde hata oluştu ('+response.status+').');
  return data;
 }
 function render(){
  if(!isAdmin()){contacts=[];list.replaceChildren();count.textContent='';return;}
  const query=search.value.trim().toLocaleLowerCase('tr-TR');
  groupUI();
  const rows=contacts.filter(c=>(query||
   activeGroup<0||groupForName(c.name)===activeGroup)&&
   (!query||String(c.name).toLocaleLowerCase('tr-TR').includes(query)||
    String(c.phone).includes(query))).sort((a,b)=>
     collator.compare(a.name,b.name)||collator.compare(a.phone,b.phone));
  count.textContent=rows.length+' numara kaydı'+(query?' · tüm rehberde arama sonucu':'');
  list.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const c of rows.slice(0,shown)){
   const li=document.createElement('li');li.className='v87-contact-row';
   const avatar=document.createElement('span');avatar.className='v87-avatar';
   avatar.textContent=String(c.name||'?').charAt(0).toLocaleUpperCase('tr-TR');
   const info=document.createElement('span');info.className='v87-contact-info';
   const name=document.createElement('strong');name.textContent=c.name;
   const phone=document.createElement('small');phone.textContent=c.phone;
   info.append(name,phone);
   const call=document.createElement('a');call.className='v87-call';
   call.textContent='☎';
   const safe=String(c.phone).replace(/[^+\\d]/g,'');
   call.href=safe?'tel:'+safe:'#';
   call.setAttribute('aria-label',c.name+' kişisini ara');
   const message=document.createElement('a');message.className='v89-message';
   message.textContent='☏';
   message.href=safe?'sms:'+safe:'#';
   message.setAttribute('aria-label',c.name+' kişisine mesaj gönder');
   li.append(avatar,info,call,message);fragment.append(li);
  }
  list.append(fragment);
  const more=$('v89MoreContacts');
  more.hidden=rows.length<=shown;
  if(!more.hidden)more.textContent='Daha fazla göster · '+Math.min(rows.length-shown,75)+' kayıt';
  if(!rows.length){
   const empty=document.createElement('li');empty.className='v87-empty';
   empty.textContent=query?'Aradığın isim veya telefon bulunamadı.':
    contacts.length?'Bu alfabetik grupta kayıt bulunmuyor.':
    'Rehberin henüz boş. iPhone .vcf dosyasından aktarabilir veya kişi ekleyebilirsin.';
   list.append(empty);
  }
 }
 async function load(){
  if(!isAdmin())return;
  try{
   const data=await request('/api/personal-contacts');
   if(!isAdmin()){reset();return;}
   contacts=Array.isArray(data.contacts)?data.contacts:[];
   loaded=true;render();
   announce(contacts.length+' kayıt güvenli rehberde.');
  }catch(error){announce(error.message);}
 }
 async function open(){
  if(!isAdmin())return;
  panel.hidden=false;
  if(!loaded)await load();else render();
 }
 const clearPreview=()=>{
  pending=[];file.value='';preview.hidden=true;confirm.disabled=false;previewText.textContent='';
 };
 importButton.addEventListener('click',()=>{if(isAdmin()&&!busy)file.click();});
 file.addEventListener('change',async()=>{
  if(!isAdmin()||!file.files?.length)return;
  try{
   const selected=file.files[0];
   if(selected.size>3_000_000)throw Error('Dosya en fazla 3 MB olmalı.');
   const parsed=parseVCF(await selected.text());
   if(!parsed.contacts.length)throw Error('Bu vCard dosyasında aktarılabilir kişi numarası bulunamadı.');
   pending=parsed.contacts;
   preview.hidden=false;
   previewText.textContent=parsed.cards+' kart okundu, '+pending.length+' numara aktarılmaya hazır. '+
    parsed.skipped+' eksik/geçersiz kayıt atlandı. Onay vermeden veri gönderilmez.';
   announce('Dosya yalnız bu ekranda önizlendi. Aktarmak için onayla.');
  }catch(error){clearPreview();announce(error.message);}
 });
 $('v87CancelImport').addEventListener('click',()=>{clearPreview();announce('Aktarım iptal edildi.');});
 confirm.addEventListener('click',async()=>{
  if(!pending.length||!isAdmin()||busy)return;
  busy=true;confirm.disabled=true;importButton.disabled=true;
  let added=0,skipped=0,done=0;
  try{
   for(let i=0;i<pending.length;i+=100){
    if(!isAdmin())throw Error('Yönetici oturumu kapandı. Aktarım durduruldu.');
    const batch=pending.slice(i,i+100);
    const r=await request('/api/personal-contacts/import','POST',{contacts:batch});
    added+=r.added||0;skipped+=r.skipped||0;done+=batch.length;
    announce(done+'/'+pending.length+' numara işlendi…');
   }
   clearPreview();await load();
   announce(added+' yeni numara aktarıldı; '+skipped+' önceden kayıtlı/tekrar numara atlandı.');
  }catch(error){
   announce(done+' numara işlendi. Hata: '+error.message+
    ' Aynı dosyayı yeniden seçmek güvenlidir; mevcut kayıtlar silinmez.');
   clearPreview();await load();
  }finally{busy=false;confirm.disabled=false;importButton.disabled=false;}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!isAdmin()||busy)return;
  const name=$('v87NewName').value.trim(),phone=$('v87NewPhone').value.trim();
  if(!name||!phone){announce('Ad ve telefon yazmalısın.');return;}
  busy=true;
  try{
   const r=await request('/api/personal-contacts/import','POST',{contacts:[{name,phone,label:'Telefon'}]});
   form.reset();await load();
   announce(r.added?'Kişi eklendi.':'Bu isim ve numara zaten kayıtlı.');
  }catch(error){announce(error.message);}finally{busy=false;}
 });
 search.addEventListener('input',()=>{shown=75;render();});
 for(const button of document.querySelectorAll('[data-v89-group]')){
  button.addEventListener('click',()=>{
   if(!isAdmin())return;
   activeGroup=Number(button.dataset.v89Group);
   shown=75;search.value='';render();
  });
 }
 $('v89ShowContacts').addEventListener('click',()=>{
  if(!isAdmin())return;
  activeGroup=-1;shown=75;search.value='';render();
 });
 $('v89AddContact').addEventListener('click',()=>{
  if(!isAdmin()||busy)return;
  const d=$('v89NewContactDetails');d.open=true;
  $('v87NewName').focus();
 });
 $('v89ImportContact').addEventListener('click',()=>{
  if(isAdmin()&&!busy)importButton.click();
 });
 $('v89MoreContacts').addEventListener('click',()=>{
  if(!isAdmin())return;
  shown+=75;render();
 });
 const deletePanel=$('v89DeletePanel'),deletePhrase=$('v89DeletePhrase'),
  deleteApply=$('v89ConfirmDelete');
 const closeDelete=()=>{
  deleteExpected=0;deletePhrase.value='';deleteApply.disabled=true;
  deletePanel.hidden=true;
 };
 $('v89DeleteAll').addEventListener('click',()=>{
  if(!isAdmin()||busy)return;
  if(!contacts.length){announce('Kişisel rehberde silinecek kayıt yok.');return;}
  deleteExpected=contacts.length;
  $('v89DeleteDescription').textContent=deleteExpected+
   ' numara kaydını kişisel rehberden kalıcı olarak sileceksin. Firma, temsilci, üye ve finans kayıtları etkilenmez. Geri alma yoktur.';
  deletePhrase.value='';deleteApply.disabled=true;
  deletePanel.hidden=false;
  deletePhrase.focus();
 });
 deletePhrase.addEventListener('input',()=>{
  deleteApply.disabled=busy||deletePhrase.value.trim().toLocaleUpperCase('tr-TR')!=='SİL';
 });
 $('v89CancelDelete').addEventListener('click',closeDelete);
 deleteApply.addEventListener('click',async()=>{
  if(!isAdmin()||busy||deleteExpected<1||
     deletePhrase.value.trim().toLocaleUpperCase('tr-TR')!=='SİL'||
     deleteExpected!==contacts.length)return;
  busy=true;deleteApply.disabled=true;
  $('v89DeleteAll').disabled=true;
  try{
   const result=await request('/api/personal-contacts/clear','POST',{
    confirmation:'TÜMÜNÜ SİL',expectedCount:deleteExpected});
   closeDelete();
   await load();
   announce(Number(result.deleted||0)+' kişisel rehber numarası silindi.');
  }catch(error){
   closeDelete();
   await load();
   announce('Silme tamamlanamadı: '+error.message);
  }finally{
   busy=false;render();
  }
 });
 function reset(){
  contacts=[];loaded=false;panel.hidden=true;
  clearPreview();list.replaceChildren();count.textContent='';
  activeGroup=0;shown=75;closeDelete();
  search.value='';announce('Yönetici oturumunda rehber açılabilir.');
 }
 document.addEventListener('ht:logout',reset);
 window.HTPersonalContacts={open,parseVCF,reset};

})();