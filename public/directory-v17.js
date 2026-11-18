'use strict';
// HesapTakip V17: company directory, multiple representatives, weekly visits,
// local Excel/CSV preview and user-confirmed WhatsApp links. No auto messaging.
(function(){
 const days=['','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
 const safe=x=>esc(String(x??''));
 const norm=x=>String(x||'').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g,' ');
 const directory=()=>state.directory||{companies:[],contacts:[],templates:[]};
 const editing=()=>currentRole!=='viewer';
 let previewRows=[],previewErrors=[],messageRecipient=null;
 const defaultMessages=[
  {id:'visit',title:'Ziyaret hatırlatması',body:'Merhaba {temsilci}, {firma} için bu haftaki ziyaret planınızı öğrenebilir miyim?'},
  {id:'order',title:'Sipariş talebi',body:'Merhaba {temsilci}, {firma} için sipariş hakkında görüşmek istiyorum.'},
  {id:'payment',title:'Ödeme hatırlatması',body:'Merhaba {temsilci}, {firma} ile ilgili ödeme durumunu paylaşabilir misiniz?'}
 ];
 const visitOptions=selected=>days.map(x=>'<option value="'+safe(x)+'"'+(x===selected?' selected':'')+'>'+(x||'Belirtilmedi')+'</option>').join('');
 function init(){
  el('settingsView').insertAdjacentHTML('beforebegin',[
   '<section id="representativesView" class="view" hidden>',
   '<div class="section-head"><div><h2>Temsilciler</h2><p class="muted">Kişi ara ve WhatsApp / Business ile iletişim kur.</p></div></div>',
   '<div class="surface v19-rep-search"><label for="dirQuickSearch">Temsilci ara</label>',
   '<input id="dirQuickSearch" type="search" autocomplete="off" placeholder="Kişi, firma veya telefon..."></div>',
   '<div id="dirQuickList" class="v19-rep-list" aria-live="polite"></div></section>',
   '<section id="directoryView" class="view" hidden>',
   '<div class="section-head"><div><h2>Firma Rehberi</h2><p class="muted">Firmalar, temsilciler, telefonlar ve ziyaret günleri. Finans hesaplarından bağımsızdır.</p></div>',
   '<div class="row-actions"><button type="button" class="btn secondary" data-dir-new-company>+ Firma ekle</button>',
   '<button type="button" class="btn subtle" id="dirTemplateDownload">↓ Örnek Excel</button></div></div>',
   '<section class="surface dir-tools"><div class="dir-filters">',
   '<div><label for="dirSearch">Firma / temsilci ara</label><input type="search" id="dirSearch" autocomplete="off" placeholder="Firma, temsilci, telefon..."></div>',
   '<div><label for="dirDayFilter">Ziyaret günü</label><select id="dirDayFilter"><option value="">Tüm günler</option>',
   days.slice(1).map(day=>'<option>'+day+'</option>').join(''),'</select></div></div>',
   '<div class="dir-import-controls"><label for="dirExcelInput" class="btn subtle dir-upload-label">↑ Excel / CSV yükle</label>',
   '<input type="file" id="dirExcelInput" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">',
   '<p class="hint">Önce Excel satırlarını önizle; mevcut firma ve temsilciler isteğin dışında değiştirilmez.</p></div></section>',
   '<section class="surface dir-preview" id="dirImportPreview" hidden><h3>Excel önizleme</h3>',
   '<p class="muted" id="dirImportSummary" role="status"></p>',
   '<div class="table-wrap"><table><thead><tr><th>Satır</th><th>Firma</th><th>Temsilci</th><th>Telefon</th><th>Gün</th><th>Durum</th></tr></thead>',
   '<tbody id="dirImportRows"></tbody></table></div>',
   '<div class="dir-import-bottom"><div><label for="dirImportMode">Kayıtlı firmalar</label>',
   '<select id="dirImportMode"><option value="skip">Mevcut firmaları atla</option>',
   '<option value="merge">Yeni temsilcileri ekle, mevcut bilgileri değiştirme</option></select></div>',
   '<div class="row-actions"><button class="btn subtle" id="dirImportCancel" type="button">Vazgeç</button>',
   '<button class="btn primary" id="dirImportSave" type="button">Önizlemeyi kaydet</button></div></div></section>',
   '<div id="directoryList" class="dir-card-grid" aria-live="polite"></div></section>'
  ].join(''));
  el('settingsView').insertAdjacentHTML('afterbegin',[
   '<section class="ht-settings-panel" id="htUpdatePanel"><div class="ht-settings-heading">',
   '<span class="ht-settings-heading-icon">↻</span><div><h3>Uygulama güncellemeleri</h3>',
   '<p>Canlı sunucuda güncel sürüm varsa yükle.</p></div></div>',
   '<p class="muted">Açık sürüm: <b id="htCurrentVersion">v24</b> · Canlı sürüm: <b id="htServerVersion">Henüz kontrol edilmedi</b></p>',
   '<div class="row-actions"><button type="button" class="btn secondary" id="htCheckUpdates">Güncellemeleri kontrol et</button>',
   '<button type="button" class="btn primary" id="htApplyUpdate" hidden>Güncellemeyi yükle</button></div>',
   '<p class="hint" id="htUpdateStatus" role="status">GitHub kodu henüz Cloudflare üzerinde yayınlanmadıysa buton bu yayını kendiliğinden yapamaz.</p></section>',
   '<details class="ht-settings-panel v19-logo-details" id="htLogoPanel"><summary class="v19-logo-summary"><div class="ht-settings-heading">',
   '<span class="ht-settings-heading-icon">▧</span><div><h3>Tüm kayıtların logoları</h3>',
   '<p>Şahıs, firma, yemek kartı, platform, POS, banka, kredi kartı, kasa ve rehber. Dokunarak aç, isimle ara.</p></div></div></summary>',
   '<div class="dir-filters"><div><label for="htLogoCategory">Kategori</label>',
   '<select id="htLogoCategory"><option value="all">Tüm kayıtlar</option><option value="directory">Firma Rehberi</option>',
   '<option value="firm">Firmalar / şahıslar / yemek kartları / platformlar / POS</option>',
   '<option value="institution">Bankalar ve ödeme kuruluşları</option>',
   '<option value="card">Kredi kartları</option><option value="account">Banka hesapları / kasalar</option></select></div>',
   '<div><label for="htLogoSearch">Kayıt ara</label><input id="htLogoSearch" type="search" placeholder="İsim veya marka..."></div></div>',
   '<div id="htUniversalLogoList" class="ht-logo-catalog"></div>',
   '<input id="htUniversalLogoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>',
   '<p class="hint">PNG / JPG / WebP kabul edilir. Yüklenen küçük görsel veri tabanına kaydedilir; kaldırabilirsin.</p></details>',
   '<section class="ht-settings-panel"><div class="ht-settings-heading"><span class="ht-settings-heading-icon">✉</span>',
   '<div><h3>WhatsApp mesaj şablonları</h3><p>Ziyaret, sipariş ve ödeme metinlerini düzenle.</p></div></div>',
   '<button type="button" class="btn secondary" id="dirTemplateNew">+ Mesaj şablonu oluştur</button>',
   '<div id="dirSettingsTemplates" class="dir-templates"></div></section>'
  ].join(''));
  document.body.insertAdjacentHTML('beforeend',[
   '<dialog id="dirMessageDialog"><div class="modal-head"><h2>WhatsApp mesajı</h2>',
   '<button type="button" class="icon-btn" id="dirMessageClose" aria-label="Kapat">×</button></div>',
   '<p id="dirMessageRecipient" class="muted"></p>',
   '<label for="dirMessagePreset">Şablon</label><select id="dirMessagePreset"></select>',
   '<label for="dirMessageBody">Mesajı düzenle</label><textarea id="dirMessageBody" maxlength="1000" rows="6"></textarea>',
   '<div class="dir-message-actions">',
   '<button type="button" class="btn secondary" id="dirSendWhatsapp">WhatsApp</button>',
   '<button type="button" class="btn subtle" id="dirSendBusiness">WhatsApp Business</button></div>',
   '<p class="hint">Mesaj otomatik gönderilmez. Business seçimi kurulu uygulama ve cihaz ayarlarına bağlıdır.</p></dialog>'
  ].join(''));
 }
 function formatPhone(value){
  const digits=String(value||'').replace(/\D/g,'');
  let x=digits;if(x.length===12&&x.startsWith('90'))x=x.slice(2);
  if(x.length===11&&x.startsWith('0'))x=x.slice(1);
  if(x.length!==10||!/[2345]/.test(x[0]))throw Error('Telefon 10 haneli Türkiye numarası olmalı.');
  return '+90 '+x.slice(0,3)+' '+x.slice(3,6)+' '+x.slice(6,8)+' '+x.slice(8);
 }
 function waNumber(phone){return String(phone||'').replace(/\D/g,'');}
 const phoneLink=phone=>phone?'<a href="tel:+'+waNumber(phone)+'">'+safe(phone)+'</a>':'';
 function messagesFor(company,contact){
  if(!contact?.phone && !company.phone)return '';
  const obj=contact?.phone?contact:company;
  return '<button type="button" class="mini-btn dir-whatsapp" data-dir-chat="'+safe(company.id)+'" data-dir-chat-contact="'+safe(contact?.id||'')+'">WhatsApp / Business</button>'+
    '<a class="mini-btn dir-call" href="tel:+'+waNumber(obj.phone)+'">Ara</a>';
 }

 function renderQuickRepresentatives(){
  const host=el('dirQuickList');if(!host)return;
  const d=directory(),query=norm(el('dirQuickSearch')?.value||'');
  const companies=new Map((d.companies||[]).map(c=>[c.id,c]));
  const people=(d.contacts||[]).map(p=>({person:p,company:companies.get(p.company_id)}))
    .filter(x=>x.company&&[x.person.full_name,x.person.phone,x.company.name]
      .some(value=>norm(value).includes(query)))
    .sort((a,b)=>a.person.full_name.localeCompare(b.person.full_name,'tr'));
  host.innerHTML=people.length?people.map(({person:p,company:c})=>
    '<article class="v19-rep-card"><div class="v19-rep-avatar" aria-hidden="true">'+
    safe((p.full_name||'?').trim().slice(0,2).toLocaleUpperCase('tr-TR'))+'</div>'+
    '<div class="v19-rep-info"><strong>'+safe(p.full_name)+'</strong>'+
    '<small>'+safe(c.name)+'</small>'+
    '<small>'+safe(p.phone||c.phone||'Telefon kayıtlı değil')+'</small>'+
    ((p.visit_day||c.visit_day)?'<small>Ziyaret: '+safe(p.visit_day||c.visit_day)+'</small>':'')+'</div>'+
    ((p.phone||c.phone)?'<button type="button" class="mini-btn v19-rep-chat" data-dir-chat="'+safe(c.id)+
      '" data-dir-chat-contact="'+safe(p.id)+'">WhatsApp / Business</button>':
      '<span class="v19-rep-unavailable">Numara yok</span>')+'</article>').join(''):
    '<div class="surface core-empty"><strong>Temsilci bulunamadı.</strong><p>Firmalar → Firma Temsilcileri üzerinden kişi ekleyebilirsin.</p></div>';
 }
 function renderDirectory(){
  const d=directory(),query=norm(el('dirSearch').value),day=el('dirDayFilter').value;
  // Old financial firms are also reachable here, without copying or modifying
  // their transaction records. A directory entry is created only on user action.
  const directoryIds=new Set(d.companies.map(c=>c.linked_firm_id).filter(Boolean));
  const directoryNames=new Set(d.companies.map(c=>norm(c.name)));
  const financialOnly=(state.firms||[]).filter(f=>f.category==='payable'&&
    !directoryIds.has(f.id)&&!directoryNames.has(norm(f.name))).map(f=>({
     id:'finance:'+f.id,finance_id:f.id,fromFinance:true,
     name:f.name,phone:f.phone||'',note:'',visit_day:''
    }));
  const list=[...d.companies,...financialOnly].filter(c=>{
    const contacts=d.contacts.filter(x=>x.company_id===c.id);
    const hits=[c.name,c.phone,c.note,...contacts.flatMap(x=>[x.full_name,x.phone])].some(x=>norm(x).includes(query));
    return hits&&(!day||c.visit_day===day||contacts.some(x=>x.visit_day===day));
  });
  el('directoryList').innerHTML=list.length?list.map(c=>{
    const people=d.contacts.filter(x=>x.company_id===c.id);
    const linked=(state.firms||[]).find(f=>f.id===(c.finance_id||c.linked_firm_id));
    const logo=window.HTEntityLogo?.('directory',c.id,c.logo_data)||c.logo_data||'';
    const icon=logo?'<img src="'+safe(logo)+'" alt="" class="dir-company-logo">':
      '<span class="dir-company-logo dir-placeholder">'+safe(c.name.trim().slice(0,2).toLocaleUpperCase('tr-TR'))+'</span>';
    return '<article class="dir-card"><div class="dir-card-head">'+icon+'<div class="dir-company-info"><h3>'+safe(c.name)+'</h3>'+
      '<p>'+safe(c.visit_day?'Ziyaret: '+c.visit_day:'')+
      (c.phone?' · '+phoneLink(c.phone):'')+'</p>'+(linked?'<small>Bağlı cari hesap: '+safe(linked.name)+'</small>':'')+
      (c.note?'<small>'+safe(c.note)+'</small>':'')+'</div></div>'+
      '<div class="dir-contact-list">'+(people.length?people.map(p=>
        '<div class="dir-contact"><div class="dir-contact-details"><small class="dir-contact-label">Firma iş temsilcisi</small><strong>'+safe(p.full_name)+'</strong>'+
        '<small>'+(p.phone?phoneLink(p.phone):'Telefon belirtilmedi')+
        (p.visit_day?' · '+safe(p.visit_day):'')+'</small>'+
        (p.note?'<small>'+safe(p.note)+'</small>':'')+'</div>'+
        '<div class="dir-contact-actions">'+messagesFor(c,p)+
        (editing()?'<button class="mini-btn" type="button" data-dir-edit-contact="'+safe(p.id)+'">Düzenle</button>'+ 
        '<button class="mini-btn delete" type="button" data-dir-delete-contact="'+safe(p.id)+'">Sil</button>':'')+
        '</div></div>').join(''):
        '<div class="dir-missing-contact"><strong>Firma iş temsilcisi henüz eklenmedi.</strong>'+
        (editing()?'<button type="button" class="mini-btn" data-dir-contact-start="'+
         safe(c.fromFinance?'finance:'+c.finance_id:c.id)+'">+ İş temsilcisi ekle</button>':'')+
        '</div>')+'</div>'+
      '<div class="row-actions dir-company-actions">'+(c.fromFinance?'':messagesFor(c,null))+
      (editing()&&!c.fromFinance?'<button class="mini-btn" type="button" data-dir-new-contact="'+safe(c.id)+'">+ İş Temsilcisi</button>'+
      '<button class="mini-btn" type="button" data-dir-edit-company="'+safe(c.id)+'">Düzenle</button>'+
      '<button class="mini-btn" type="button" data-dir-logo="'+safe(c.id)+'">Logo</button>'+
      '<button class="mini-btn delete" type="button" data-dir-delete-company="'+safe(c.id)+'">Sil</button>':'')+
      '</div></article>';
  }).join(''):'<div class="surface core-empty"><strong>Firma bulunamadı.</strong><p>Yeni firma ekle veya Excel dosyanı yükle.</p></div>';
  el('dirTemplateNew').hidden=!editing();
  el('dirSettingsTemplates').innerHTML=[...defaultMessages,...d.templates].map(x=>
    '<div class="dir-template-row"><strong>'+safe(x.title)+'</strong><small>'+safe(x.body)+'</small>'+
    (editing()?'<button type="button" class="mini-btn" data-dir-template-edit="'+safe(x.id)+'">'+
       (defaultMessages.some(y=>y.id===x.id)?'Kopyala / Düzenle':'Düzenle')+'</button>':'')+'</div>').join('');
 }
 function openForm(title,body,submit){
  el('modalTitle').textContent=title;
  el('modalContents').innerHTML='<form id="dirEditForm" class="modal-form">'+body+
    '<div class="form-actions"><button type="button" class="btn subtle" id="dirFormCancel">Vazgeç</button>'+
    '<button type="submit" class="btn primary">Kaydet</button></div></form>';
  el('modal').showModal();
  el('dirFormCancel').onclick=()=>el('modal').close();
  el('dirEditForm').onsubmit=async event=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    try{await submit(Object.fromEntries(new FormData(event.currentTarget)));el('modal').close();await load();notice('Rehber kaydedildi.');}
    catch(e){notice(e.message,true);}finally{button.disabled=false;}
  };
 }
 const input=(title,name,value='',attrs='')=>
  '<div><label for="dirf-'+name+'">'+safe(title)+'</label><input id="dirf-'+name+'" name="'+name+'" value="'+safe(value)+'" '+attrs+'></div>';
 function companyForm(id='',defaultName=''){
  if(!editing())return;
  const c=directory().companies.find(x=>x.id===id);
  const canAddContact=!c||!directory().contacts.some(p=>p.company_id===c.id);
  const linked=[['','Bağlı cari hesap yok'],...(state.firms||[]).map(f=>[f.id,f.name])];
  openForm(c?'Firmayı düzenle':'Yeni firma',[
    input('Firma adı','name',c?.name||defaultName,'required maxlength="120"'),
    input('Firma ana telefonu (+90)','phone',c?.phone||'+90 ','type="tel" inputmode="tel"'),
    ...(canAddContact?[
      '<div class="dir-contact-label">FİRMA İŞ TEMSİLCİSİ (İSTEĞE BAĞLI)</div>',
      input('İş temsilcisi adı soyadı','contact_name','','maxlength="120" placeholder="Temsilcinin adı soyadı"'),
      input('İş temsilcisinin telefonu (+90)','contact_phone','+90 ','type="tel" inputmode="tel"'),
      '<div><label>Temsilci ziyaret günü</label><select name="contact_visit_day">'+visitOptions('')+'</select></div>'
    ]:[]),
    '<div><label>Ziyaret günü</label><select name="visit_day">'+visitOptions(c?.visit_day||'')+'</select></div>',
    '<div><label>Mevcut cari hesaba bağla (isteğe bağlı)</label><select name="linked_firm_id">'+
    linked.map(([key,name])=>'<option value="'+safe(key)+'"'+(key===c?.linked_firm_id?' selected':'')+'>'+safe(name)+'</option>').join('')+'</select></div>',
    '<div><label>Not</label><textarea name="note" maxlength="500">'+safe(c?.note||'')+'</textarea></div>',
    '<p class="hint">Cari hesapla eşleştirme yalnızca bağlantıdır; ödeme veya borç kaydı oluşturmaz.</p>'
  ].join(''),async data=>{
    const company={name:data.name,phone:data.phone.trim()==='+90'?'':data.phone,visit_day:data.visit_day,
      linked_firm_id:data.linked_firm_id,note:data.note};
    const representative=canAddContact&&data.contact_name?.trim()?{
      full_name:data.contact_name.trim(),
      phone:(data.contact_phone||'').trim()==='+90'?'':data.contact_phone,
      visit_day:data.contact_visit_day||'',note:''
    }:null;
    if(!c&&representative){
      // Atomic new company + contact: no orphaned company if contact validation fails.
      await api('directory/with-contact','POST',{...company,contact:representative});
    }else{
      await api(c?'directory/companies/'+c.id:'directory',c?'PATCH':'POST',company);
      if(c&&representative)await api('directory/contacts','POST',{company_id:c.id,...representative});
    }
  });
 }
 function contactForm(companyId,id=''){
  if(!editing())return;
  const p=directory().contacts.find(x=>x.id===id);
  openForm(p?'Temsilciyi düzenle':'Yeni temsilci',[
    input('Temsilci adı soyadı','full_name',p?.full_name||'','required maxlength="120"'),
    input('Telefon (+90)','phone',p?.phone||'+90 ','type="tel" inputmode="tel"'),
    '<div><label>Ziyaret günü</label><select name="visit_day">'+visitOptions(p?.visit_day||'')+'</select></div>',
    '<div><label>Not</label><textarea name="note" maxlength="500">'+safe(p?.note||'')+'</textarea></div>'
  ].join(''),data=>api(p?'directory/contacts/'+p.id:'directory/contacts',p?'PATCH':'POST',
    {company_id:companyId,full_name:data.full_name,phone:data.phone.trim()==='+90'?'':data.phone,
     visit_day:data.visit_day,note:data.note}));
 }
 function templateForm(id=''){
  const found=[...defaultMessages,...directory().templates].find(x=>x.id===id);
  const original=directory().templates.find(x=>x.id===id);
  openForm(original?'Mesaj şablonunu düzenle':'Yeni mesaj şablonu',[
    input('Şablon adı','title',found?.title||'','required maxlength="60"'),
    '<div><label>Mesaj ( {firma}, {temsilci}, {telefon} kullanılabilir)</label>'+
    '<textarea name="body" required maxlength="1000" rows="6">'+safe(found?.body||'')+'</textarea></div>'
  ].join(''),data=>api(original?'directory/templates/'+id:'directory/templates',
    original?'PATCH':'POST',{title:data.title,body:data.body}));
 }
 function templateFill(template,company,person){
  const firm=String(company?.name||'').trim(),representative=String(person?.full_name||'').trim();
  const phone=String(person?.phone||company?.phone||'').trim();
  // Always show the recipient identity, even when an older custom template
  // contains no {firma}/{temsilci} placeholders.
  const raw=String(template?.body||'');
  const body=raw.replace(/\{\s*firma\s*\}/gi,firm)
    .replace(/\{\s*temsilci\s*\}/gi,representative||firm)
    .replace(/\{\s*telefon\s*\}/gi,phone);
  const header=['Firma: '+firm,representative?'Temsilci: '+representative:''].filter(Boolean).join('\n');
  return header+'\n\n'+body;
 }
 function openChat(companyId,contactId=''){
  const c=directory().companies.find(x=>x.id===companyId),
    p=directory().contacts.find(x=>x.id===contactId);
  if(!c)return;
  const phone=p?.phone||c.phone;
  if(!phone){notice('Mesaj göndermek için telefon numarası ekleyin.',true);return;}
  messageRecipient={company:c,person:p,phone};
  const presets=[...defaultMessages,...directory().templates];
  el('dirMessagePreset').innerHTML=presets.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.title)+'</option>').join('');
  el('dirMessageRecipient').textContent=c.name+' · '+(p?.full_name||'Firma hattı')+' · '+phone;
  el('dirMessageBody').value=templateFill(presets[0],c,p);
  el('dirMessageDialog').showModal();
 }
 function launchWhatsapp(business=false){
  if(!messageRecipient)return;
  const message=el('dirMessageBody').value.trim();
  if(message.length>1000){notice('Mesaj çok uzun.',true);return;}
  const tel=waNumber(messageRecipient.phone);
  const encoded=encodeURIComponent(message);
  if(business){
    // Best effort only: custom URL schemes are not guaranteed across platforms.
    const link='whatsapp-business://send?phone='+tel+'&text='+encoded;
    window.location.href=link;
    el('dirMessageRecipient').textContent='Business açılmıyorsa WhatsApp düğmesiyle normal bağlantıyı kullanın.';
  }else{
    window.open('https://wa.me/'+tel+'?text='+encoded,'_blank','noopener,noreferrer');
  }
 }
 function downloadTemplate(){
  const rows=[['Firma Adı','Temsilci Adı Soyadı','Telefon (+90)','Ziyaret Günü','Firma Notu','Temsilci Notu'],
    ['ABC Gıda','Ahmet Yılmaz','+90 532 123 45 67','Salı','Örnek firma',''],
    ['ABC Gıda','Mehmet Demir','+90 535 456 78 90','Perşembe','','Sipariş sorumlusu'],
    ['XYZ Market','','+90 533 222 33 44','Cuma','','']];
  if(typeof makeXlsx!=='function')throw Error('Excel dışa aktarma aracı yüklenemedi.');
  downloadExport(makeXlsx([{name:'Firma Rehberi',rows}]),'HesapTakip-Firma-Rehberi-Ornek.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 function parseCsv(text){
  const comma=(text.split(/\r?\n/,1)[0].match(/,/g)||[]).length,semi=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length;
  const sep=semi>comma?';':',';let quoted=false,cell='',row=[],out=[];
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===sep&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(x=>x.trim()))out.push(row);row=[];cell='';
    }else cell+=ch;
  }
  if(quoted)throw Error('CSV tırnakları eksik.');
  row.push(cell);if(row.some(x=>x.trim()))out.push(row);
  return out.map(r=>r.map(x=>x.trim()));
 }
 async function parseXlsx(file){
  if(typeof DecompressionStream==='undefined')throw Error('Bu tarayıcı Excel sıkıştırmasını desteklemiyor. CSV dosyası deneyin.');
  const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);
  const u16=i=>v.getUint16(i,true),u32=i=>v.getUint32(i,true);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(i)===0x06054b50){end=i;break;}}
  if(end<0)throw Error('Geçerli bir .xlsx ZIP dosyası değil.');
  const count=u16(end+10),center=u32(end+16),decode=new TextDecoder('utf-8'),files=new Map();
  if(count>1500)throw Error('Excel dosyasında çok fazla içerik var.');
  let off=center;
  for(let i=0;i<count;i++){
    if(off+46>bytes.length||u32(off)!==0x02014b50)throw Error('Excel arşiv dizini bozuk.');
    const type=u16(off+10),length=u32(off+20),size=u32(off+24),
      nameSize=u16(off+28),extra=u16(off+30),comment=u16(off+32),local=u32(off+42);
    if(length>5_000_000||size>12_000_000)throw Error('Excel sayfası çok büyük.');
    const name=decode.decode(bytes.subarray(off+46,off+46+nameSize));
    if(!name.includes('..') && (name.endsWith('.xml')||name.endsWith('.rels')))files.set(name,{type,length,local});
    off+=46+nameSize+extra+comment;
  }
  async function xmlText(name){
    const info=files.get(name);if(!info)return '';
    const loc=info.local;
    if(u32(loc)!==0x04034b50)throw Error('Excel arşiv kaydı bozuk.');
    const start=loc+30+u16(loc+26)+u16(loc+28);
    const data=bytes.slice(start,start+info.length);
    if(data.length!==info.length)throw Error('Excel içeriği eksik.');
    let body;
    if(info.type===0)body=data;
    else if(info.type===8){
      body=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }else throw Error('Excel sıkıştırması desteklenmiyor.');
    if(body.length>12_000_000)throw Error('Excel açılmış veri boyutu çok büyük.');
    return decode.decode(body);
  }
  const parser=new DOMParser();
  const parse=text=>{
    const doc=parser.parseFromString(text,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('Excel XML dosyası okunamadı.');
    return doc;
  };
  const strings=files.has('xl/sharedStrings.xml')?[
    ...parse(await xmlText('xl/sharedStrings.xml')).getElementsByTagName('si')
  ].map(si=>[...si.getElementsByTagName('t')].map(x=>x.textContent).join('')):[];
  const sheets=[...files.keys()].filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort((a,b)=>
    Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]));
  if(!sheets.length)throw Error('Excel sayfası bulunamadı.');
  const doc=parse(await xmlText(sheets[0]));
  const rows=[];
  for(const row of doc.getElementsByTagName('row')){
    if(rows.length>200)break;
    const values=[];
    for(const c of row.getElementsByTagName('c')){
      const ref=c.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0]||'';
      let col=0;for(const letter of letters)col=col*26+letter.charCodeAt(0)-64;
      if(col>30)continue;
      const v=c.getElementsByTagName('v')[0]?.textContent||'';
      const type=c.getAttribute('t');
      values[col?col-1:values.length]=type==='s'?strings[Number(v)]||'':
        type==='inlineStr'?[...c.getElementsByTagName('t')].map(x=>x.textContent).join(''):v;
    }
    if(values.some(x=>String(x||'').trim()))rows.push(values);
  }
  return rows;
 }
 function convertRows(matrix){
  if(!matrix.length)throw Error('Excel dosyası boş.');
  const headers=matrix.shift().map(v=>norm(v).replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c'));
  const index=(aliases)=>headers.findIndex(h=>aliases.includes(h));
  const map={
    name:index(['firma adi','firma ismi','firma','sirket','company','name','isyeri','isim']),
    full_name:index(['temsilci adi soyadi','temsilci','firma temsilcisi','yetkili','yetkili adi','representative']),
    phone:index(['telefon (+90)','telefon','telefon numarasi','firma telefonu','tel','gsm','phone','cep telefonu']),
    visit_day:index(['ziyaret gunu','ziyaret','gun','visit day']),
    company_note:index(['firma notu','aciklama','firma aciklama','note']),
    contact_note:index(['temsilci notu','yetkili notu'])
  };
  if(map.name<0)throw Error('Excel başlığına Firma Adı sütununu ekleyin.');
  const rows=matrix.filter(r=>r.some(x=>String(x||'').trim())).map((r,i)=>{
    const x={};for(const [key,pos] of Object.entries(map))x[key]=pos<0?'':String(r[pos]??'').trim();
    x.excel_row=i+2;return x;
  });
  if(rows.length>100)throw Error('Bir seferde en fazla 100 satır yükleyin. Excel dosyasını parçalara ayırabilirsiniz.');
  return rows;
 }
 function validatePreview(rows){
  const existing=new Set(directory().companies.map(x=>norm(x.name)));
  const names=new Set(),valid=[],invalid=[];
  for(const row of rows){
    let problem='';
    if(!row.name||row.name.length>120)problem='Firma adı eksik / çok uzun';
    if(!problem&&row.phone){try{row.phone=formatPhone(row.phone);}catch(e){problem=e.message;}}
    if(!problem&&row.contact_note&&!row.full_name)problem='Temsilci notu için kişi adı gerekli';
    if(!problem&&row.visit_day&&!days.includes(row.visit_day))problem='Ziyaret günü geçersiz';
    if(!problem&&row.full_name.length>120)problem='Temsilci adı çok uzun';
    if(problem)invalid.push({...row,problem});
    else{row.status=existing.has(norm(row.name))?'Kayıtlı firma':'Yeni firma';valid.push(row);names.add(norm(row.name));}
  }
  return {valid,invalid,companyCount:names.size};
 }
 function showPreview(){
  const r=validatePreview(previewRows);
  previewErrors=r.invalid;
  const shown=[...r.valid,...r.invalid].sort((a,b)=>a.excel_row-b.excel_row);
  el('dirImportRows').innerHTML=shown.map(x=>
    '<tr><td>'+x.excel_row+'</td><td>'+safe(x.name)+'</td><td>'+safe(x.full_name||'—')+
    '</td><td>'+safe(x.phone||'—')+'</td><td>'+safe(x.visit_day||'—')+'</td><td>'+
    '<span class="'+(x.problem?'dir-error':'')+'">'+safe(x.problem||x.status)+'</span></td></tr>').join('');
  el('dirImportSummary').textContent=r.valid.length+' geçerli satır · '+r.invalid.length+
    ' hatalı satır · '+r.companyCount+' firma. Hatalar düzeltilmeden aktarım yapılmaz.';
  el('dirImportSave').disabled=!!r.invalid.length||!r.valid.length||!editing();
  el('dirImportPreview').hidden=false;
 }
 async function fileSelected(file){
  if(!file)return;
  if(file.size>3_000_000)throw Error('Dosya en fazla 3 MB olabilir.');
  const matrix=/\.csv$/i.test(file.name)?parseCsv(await file.text()):
    /\.xlsx$/i.test(file.name)?await parseXlsx(file):null;
  if(!matrix)throw Error('Lütfen .xlsx veya .csv dosyası seçin.');
  previewRows=convertRows(matrix);
  showPreview();
 }
 function render(){if(el('directoryView'))renderDirectory();renderQuickRepresentatives();}
 init();
 document.addEventListener('input',e=>{
  if(e.target.id==='dirSearch')renderDirectory();
  if(e.target.id==='dirQuickSearch')renderQuickRepresentatives();
 });
 document.addEventListener('change',async e=>{
  if(e.target.id==='dirDayFilter'){renderDirectory();return;}
  if(e.target.id==='dirMessagePreset'&&messageRecipient){
    const found=[...defaultMessages,...directory().templates].find(x=>x.id===e.target.value);
    if(found)el('dirMessageBody').value=templateFill(found,messageRecipient.company,messageRecipient.person);
  }
  if(e.target.id==='dirExcelInput'){
    try{await fileSelected(e.target.files?.[0]);}catch(error){notice(error.message,true);el('dirImportPreview').hidden=true;}
    finally{e.target.value='';}
  }
 });
 document.addEventListener('click',async event=>{
  const e=event.target.closest('button, a');
  if(!e)return;
  if(e.id==='dirTemplateDownload'){try{downloadTemplate();}catch(err){notice(err.message,true);}return;}
  if(e.hasAttribute('data-dir-new-company'))return companyForm();
  if(e.dataset.dirEditCompany)return companyForm(e.dataset.dirEditCompany);
  if(e.dataset.dirNewContact)return contactForm(e.dataset.dirNewContact);
  if(e.dataset.dirContactStart){
    if(!editing())return;
    const choice=e.dataset.dirContactStart;
    if(!choice.startsWith('finance:')){contactForm(choice);return;}
    const id=choice.slice('finance:'.length);
    const financial=(state.firms||[]).find(f=>f.id===id);
    if(!financial)return;
    e.disabled=true;
    try{
      const created=await api('directory','POST',{
        name:financial.name,phone:financial.phone||'',visit_day:'',
        linked_firm_id:financial.id,note:''
      });
      await load();
      contactForm(created.id);
      notice('Firma rehbere bağlandı. Şimdi iş temsilcisi adını gir.');
    }catch(error){notice(error.message,true);}
    finally{e.disabled=false;}
    return;
  }
  if(e.dataset.dirEditContact){
    const p=directory().contacts.find(x=>x.id===e.dataset.dirEditContact);
    if(p)contactForm(p.company_id,p.id);return;
  }
  if(e.dataset.dirLogo){tab('settings');el('htLogoPanel').open=true;el('htLogoCategory').value='directory';el('htLogoSearch').value=directory().companies.find(x=>x.id===e.dataset.dirLogo)?.name||'';window.renderUniversalLogos?.();return;}
  if(e.dataset.dirChat){openChat(e.dataset.dirChat,e.dataset.dirChatContact);return;}
  if(e.id==='dirMessageClose'){el('dirMessageDialog').close();return;}
  if(e.id==='dirSendWhatsapp'){launchWhatsapp();return;}
  if(e.id==='dirSendBusiness'){launchWhatsapp(true);return;}
  if(e.id==='dirImportCancel'){el('dirImportPreview').hidden=true;previewRows=[];return;}
  if(e.id==='dirImportSave'){
    if(!editing())return;
    const r=validatePreview(previewRows);
    if(!r.valid.length||r.invalid.length){notice('Önizlemedeki hataları düzeltin.',true);return;}
    e.disabled=true;
    try{
      const response=await api('directory/import','POST',{rows:r.valid,existing_mode:el('dirImportMode').value});
      el('dirImportPreview').hidden=true;previewRows=[];await load();
      notice(response.added_companies+' firma, '+response.added_contacts+' temsilci eklendi; '+response.skipped+' satır atlandı.');
    }catch(error){notice(error.message,true);}finally{e.disabled=false;}
    return;
  }
  if(e.dataset.dirDeleteContact){
    const p=directory().contacts.find(x=>x.id===e.dataset.dirDeleteContact);
    if(!p||!confirm(p.full_name+' temsilcisini rehberden silmek istiyor musun?'))return;
    try{await api('directory/contacts/'+p.id,'DELETE');await load();notice('Temsilci silindi.');}
    catch(error){notice(error.message,true);}return;
  }
  if(e.dataset.dirDeleteCompany){
    const c=directory().companies.find(x=>x.id===e.dataset.dirDeleteCompany);
    if(!c||!confirm(c.name+' rehberden silinsin mi? Temsilcileri silinir, finans kayıtları korunur.'))return;
    try{await api('directory/companies/'+c.id,'DELETE');await load();notice('Rehberden silindi; cari kayıtlar korunuyor.');}
    catch(error){notice(error.message,true);}return;
  }
  if(e.id==='dirTemplateNew')return templateForm();
  if(e.dataset.dirTemplateEdit)return templateForm(e.dataset.dirTemplateEdit);
 });
 window.renderDirectory=render;
 window.HTDirectory={render,renderQuickRepresentatives,openChat,templateFill,
  companyForm,templateForm,defaultMessages,formatPhone,convertRows,parseCsv};
})();
