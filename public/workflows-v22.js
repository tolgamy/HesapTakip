'use strict';
// V22: UI over existing D1 data; no automatic WhatsApp send or balance duplication.
(function(){
 const safe=x=>esc(String(x??''));
 const normalize=x=>String(x||'').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
 const phoneDigits=p=>{
  let x=String(p||'').replace(/\D/g,'');
  if(x.length===11&&x.startsWith('0'))x=x.slice(1);
  if(x.length===10)x='90'+x;
  return /^90\d{10}$/.test(x)?x:'';
 };
 const todayPhone=()=>new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
 const visitReminder=[
  'Merhaba,',
  '',
  'Yarın ziyaret gününüz olduğunu görüyorum. Ziyaretinizle ilgili aşağıdaki hususlara dikkat etmenizi rica ederiz.',
  '',
  '1. Ziyaret Öncesi Bilgilendirme: İşletmemize gelmeden en az 30 dakika önce WhatsApp üzerinden geleceğinizi bildiriniz.',
  '2. Raf ve Stand Düzeni: İşletmemize geldiğinizde size ait raf, dolap veya standın düzenini ve temizliğini kontrol ediniz. Gerekli düzenlemeleri yapınız.',
  '3. Son Kullanma Tarihi Kontrolü: Ürünlerinizin son kullanma tarihlerini kontrol ederek tarihi geçmiş ürünleri raflardan kaldırınız.',
  '4. Fiyat Güncellemeleri: Güncellenmiş fiyat listeniz varsa tarafımıza bilgi veriniz.',
  '5. Kampanyalı Ürünler: Siparişlerimizde öncelikli olarak kampanyalı ve avantajlı fiyatlı ürünleri tercih ediyoruz. Mevcut kampanyalarınız hakkında bilgi vermenizi rica ederiz.',
  '6. Acil Siparişler: Çok acil durumlar dışında plansız sipariş vermiyoruz. Acil durumlarda ise yalnızca günü kurtaracak kadar ürün alımı yapabiliriz.',
  '',
  'Ziyaretlerin daha düzenli ve verimli geçmesi için bu hususlara özen göstermenizi rica eder, iş birliğiniz için teşekkür ederiz.',
  '',
  'İyi çalışmalar dileriz.'
 ].join('\n');

 const supplier=(stateRef=state)=>(stateRef.firms||[]).filter(f=>f.category==='payable')
  .slice().sort((a,b)=>a.name.localeCompare(b.name,'tr'));
 const profileOf=id=>(state.firmProfiles||[]).find(p=>p.firm_id===id)||{
  firm_id:id,description:'',products:'',conditions:'',urgent_notes:''
 };
 const contactsFor=f=>{
  const companies=(state.directory?.companies||[]).filter(c=>
   c.linked_firm_id===f.id||normalize(c.name)===normalize(f.name));
  const ids=new Set(companies.map(c=>c.id));
  return (state.directory?.contacts||[]).filter(c=>ids.has(c.company_id)&&phoneDigits(c.phone));
 };
 function init(){
  const payables=el('payablesView'),head=payables?.querySelector('.section-head');
  if(head&&!el('v22SupplierProfiles')){
   head.insertAdjacentHTML('beforeend','<button type="button" class="btn secondary" data-v22-supplier-add>+ Çalıştığım Firma Ekle</button>');
   head.insertAdjacentHTML('afterend','<section id="v22SupplierProfiles" class="v22-supplier-profiles">'+
    '<div class="v22-panel-title"><h3>Firma Hakkında ve Satın Alma Notları</h3>'+
    '<p class="muted">Firmadan alınan ürünleri, kampanya koşullarını ve acil alım notlarını sakla; dilediğinde güncelle veya temsilciye gönder.</p></div>'+
    '<div id="v22SupplierList" class="v22-supplier-list"></div></section>');
  }
  const bank=el('bankingView');
  if(bank&&!el('v22BankTotal')){
   bank.querySelector('.section-head')?.insertAdjacentHTML('afterend',
    '<section id="v22BankTotal" class="v22-bank-total" aria-label="Banka ve POS toplam param">'+
    '<div class="v22-bank-total-heading"><h3>Bankalarım + POS Hesaplarım</h3>'+
    '<span>Banka bakiyesi, POS hesabındaki bakiye ve henüz tahsil edilmemiş POS alacağı ayrı gösterilir.</span></div>'+
    '<div id="v22BankTotalValues" class="v22-bank-total-values"></div></section>');
  }
  const settings=el('settingsView');
  if(settings&&!el('v22ArchivedPlatforms')){
   settings.insertAdjacentHTML('beforeend','<details id="v22ArchivedPlatforms" class="ht-settings-panel">'+
    '<summary>Listeden kaldırılan platformlar (işlem geçmişi korunur)</summary>'+
    '<div id="v22ArchiveList"></div></details>');
  }
  if(settings&&!el('v23ArchivedSuppliers')){
   settings.insertAdjacentHTML('beforeend','<details id="v23ArchivedSuppliers" class="ht-settings-panel">'+
    '<summary>Listeden kaldırılan firmalar (Eminevim ve diğerleri)</summary>'+
    '<p class="hint">Borç ve ödeme hareketleri korunur. Yanlışlıkla kaldırdığın firmayı buradan geri getirebilirsin.</p>'+
    '<div id="v23SupplierArchiveList"></div></details>');
  }
 }
 function renderBankTotal(){
  const box=el('v22BankTotalValues');if(!box)return;
  const all=(state.accounts||[]).filter(a=>a.type==='bank');
  const posIds=new Set((window.HTPOS21?.readPos?.(state)?.posAccounts||[]).map(a=>a.id));
  const pos=all.filter(a=>posIds.has(a.id));
  const bank=all.filter(a=>!posIds.has(a.id));
  const sum=xs=>xs.reduce((n,a)=>n+currentBalance(a.id),0);
  const b=sum(bank),posAccounts=sum(pos);
  const awaiting=Math.max(0,Number(window.HTPOS21?.readPos?.(state)?.pending||0));
  // Outstanding POS/merchant receivables have not been transferred to the bank.
  // After settlement awaiting decreases and the bank balance increases,
  // so the same transfer is not counted again.
  const posTotal=posAccounts+awaiting;
  box.innerHTML='<div class="v22-total-card v22-grand-total"><span>GENEL TOPLAM — BANKA + POS + BEKLEYEN</span><strong>'+money(b+posTotal)+'</strong>'+
    '<small>Bankadaki para + POS hesap bakiyesi + henüz tahsil edilmemiş POS alacağı. Bu toplamın tamamı kullanılabilir nakit değildir.</small></div>'+
   '<div class="v22-total-card v23-bank-second"><span>Bankadaki kullanılabilir para</span><strong>'+
    money(b)+'</strong><small>'+bank.length+' normal banka hesabı</small></div>'+
   '<div class="v22-total-card v46-pos-balance"><span>POS hesabındaki para</span><strong>'+money(posAccounts)+
    '</strong><small>POS / ödeme kuruluşu hesaplarında kayıtlı bakiye</small></div>'+
   '<div class="v22-total-card v23-pos-first"><span>Bekleyen POS tahsilatları</span><strong>'+money(awaiting)+
    '</strong><small>Bekleyen: '+money(awaiting)+' · Henüz bankaya geçmedi</small></div>';
 }
 function renderSuppliers(){
  const host=el('v22SupplierList');if(!host)return;
  const firms=supplier();
  host.innerHTML=firms.length?firms.map(f=>{
   const p=profileOf(f.id);
   const label=p.description||p.products||p.conditions||p.urgent_notes;
   return '<article class="v22-supplier-card"><div><strong>'+safe(f.name)+'</strong>'+
    '<small>'+safe(label?label.slice(0,120):'Firma hakkında henüz bilgi girilmedi.')+'</small></div>'+
    '<button class="mini-btn" type="button" data-v22-supplier="'+safe(f.id)+'">Firma Hakkında</button></article>';
  }).join(''):'<div class="v22-empty">Henüz çalışan firma tanımlanmadı. + Çalıştığım Firma Ekle ile açabilirsin.</div>';
 }
 const profileFields=[
  ['description','Genel tanım / firma hangi konuda çalışır?'],
  ['products','Bu firmadan alınan ürünler'],
  ['conditions','Kampanya ve satın alma şartları'],
  ['urgent_notes','Ürün bittiğinde / acil durumda uygulanacak kurallar']
 ];
 function modalForm(title,fields,submit){
  el('modalTitle').textContent=title;
  el('modalContents').innerHTML='<form id="v22Form" class="modal-form">'+fields+
   '<div class="form-actions"><button type="button" class="btn subtle" id="v22Cancel">Vazgeç</button>'+
   '<button type="submit" class="btn primary">Kaydet</button></div></form>';
  el('v22Cancel').onclick=()=>el('modal').close();
  el('v22Form').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');button.disabled=true;
   try{await submit(Object.fromEntries(new FormData(e.currentTarget)));el('modal').close();await load();}
   catch(error){notice(error.message,true);}
   finally{button.disabled=false;}
  };
  el('modal').showModal();
 }
 function detailProfile(id){
  const f=supplier().find(x=>x.id===id);if(!f)return;
  const p=profileOf(id);
  el('modalTitle').textContent=f.name+' · Firma Hakkında';
  el('modalContents').innerHTML='<div class="v22-profile-detail">'+
   profileFields.map(([key,label])=>'<section><strong>'+safe(label)+'</strong>'+
    '<p>'+safe(p[key]||'Henüz yazılmadı.')+'</p></section>').join('')+'</div>'+
   '<div class="form-actions">'+
   (currentRole!=='viewer'?'<button class="btn secondary" type="button" data-v22-profile-edit="'+safe(id)+'">Bilgileri Düzenle</button>':'')+
   '<button class="btn primary" type="button" data-v22-profile-share="'+safe(id)+'">Temsilciye WhatsApp</button>'+
   (contactsFor(f).some(c=>window.HTDirectory?.visitTomorrow?.(
     (state.directory?.companies||[]).find(x=>x.id===c.company_id),c))?
    '<button class="btn secondary" type="button" data-v47-visit-share="'+safe(id)+'">Yarınki ziyaret için hızlı mesaj</button>':'')+
   '<button class="btn subtle" type="button" data-v22-close>Kapat</button></div>';
  el('modal').showModal();
 }
 function editProfile(id){
  const f=supplier().find(x=>x.id===id);if(!f||currentRole==='viewer')return;
  const p=profileOf(id);
  modalForm(f.name+' · Firma Bilgilerini Düzenle',
   profileFields.map(([key,label])=>'<div><label for="v22-'+key+'">'+safe(label)+'</label>'+
    '<textarea id="v22-'+key+'" name="'+key+'" rows="4" maxlength="4000">'+safe(p[key]||'')+'</textarea></div>').join(''),
   async d=>{await api('firm-profiles/'+id,'PATCH',d);notice('Firma hakkında bilgiler güncellendi.');});
 }
 function shareProfile(id,visitPreset=false){
  const f=supplier().find(x=>x.id===id);if(!f)return;
  const allContacts=contactsFor(f);
  const contacts=visitPreset?allContacts.filter(c=>window.HTDirectory?.visitTomorrow?.(
    (state.directory?.companies||[]).find(x=>x.id===c.company_id),c)):allContacts;
  if(!contacts.length){
   notice('Bu firmaya bağlı telefonlu temsilci bulunamadı. Firmalar → Firma Temsilcileri bölümünden ekleyin.',true);
   return;
  }
  const p=profileOf(id);
  const contactOptions=contacts.map(c=>'<option value="'+safe(c.id)+'">'+
   safe(c.full_name)+' · '+safe(c.phone)+'</option>').join('');
  const switches=[
   ['visit','Yarınki ziyaret bilgilendirme mesajı',visitPreset],
    ['greeting','Temsilciye hitap ekle',false],
   ['firm','Firma adını ekle',false],
   ['date','Bugünün tarihini ekle',false],
   ...profileFields.filter(([key])=>!!p[key]).map(([key,label])=>[key,label,true])
  ];
  const checks=switches.map(([key,label,checked])=>
   '<label class="v24-share-check"><input type="checkbox" data-v24-share-option="'+safe(key)+'"'+
   (checked?' checked':'')+'><span>'+safe(label)+'</span></label>').join('');
  const buildMessage=()=>{
   const select=el('v22-profile-contact');
   const selected=contacts.find(c=>c.id===select?.value)||contacts[0];
   const enabled=option=>!!el('v22Form')?.querySelector('[data-v24-share-option="'+option+'"]')?.checked;
   if(enabled('visit')){
    const template=window.HTDirectory?.getTemplate?.('visit');
    return template?window.HTDirectory.templateFill(template,{name:f.name},
      {full_name:selected.full_name,phone:selected.phone}):visitReminder;
   }
   const parts=[];
   if(enabled('greeting'))parts.push('Sayın '+selected.full_name+',');
   if(enabled('firm'))parts.push('Firma: '+f.name);
   if(enabled('date'))parts.push('Tarih: '+todayPhone());
   for(const [key,label] of profileFields)if(enabled(key)&&p[key])parts.push(label+':\n'+p[key]);
   return parts.join('\n\n');
  };
  modalForm(f.name+' · WhatsApp ile Bilgi Gönder',
   '<div><label for="v22-profile-contact">Firma temsilcisi</label>'+
     '<select name="contact_id" id="v22-profile-contact">'+contactOptions+'</select></div>'+
   '<details class="v24-message-settings"><summary>⚙ Mesaj ayarları — hangi bilgiler gönderilsin?</summary>'+
     '<div class="v24-share-switches">'+checks+'</div>'+
     '<p class="hint">Seçtiklerin mesaj alanına aktarılır. Ayar değişince önizleme yeniden hazırlanır.</p></details>'+
   '<div><label for="v22-profile-text">WhatsApp’a gönderilecek TEK mesaj (düzenlenebilir)</label>'+
     '<textarea name="message" id="v22-profile-text" rows="10" maxlength="16000" required></textarea></div>'+
   '<p class="hint">WhatsApp’a yalnızca aşağıdaki mesaj kutusunun içeriği aktarılır. Ek açıklama veya tekrar eklenmez.</p>',
   async d=>{
    const selected=contacts.find(c=>c.id===d.contact_id);
    if(!selected||!phoneDigits(selected.phone))throw new Error('Temsilcinin telefonunu kontrol et.');
    const message=d.message.trim();
    if(!message)throw new Error('Mesaj boş olamaz. Mesaj ayarlarından bir bilgi seçebilirsin.');
    window.open('https://wa.me/'+phoneDigits(selected.phone)+'?text='+encodeURIComponent(message),
      '_blank','noopener,noreferrer');
    notice('WhatsApp mesaj taslağı açıldı; göndermeyi sen onaylayacaksın.');
   });
  const textarea=el('v22-profile-text');
  const sync=()=>{textarea.value=buildMessage();};
  el('v22Form').querySelector('[type="submit"]').textContent='WhatsApp ile Aç';
  el('v22-profile-contact').addEventListener('change',sync);
  el('v22Form').querySelectorAll('[data-v24-share-option]').forEach(input=>
   input.addEventListener('change',sync));
  sync();
 }
 function personWhatsapp(id){
  const f=(state.firms||[]).find(x=>x.id===id&&x.category==='receivable'&&x.receivable_group==='person');
  if(!f)return;
  const tel=phoneDigits(f.phone);
  if(!tel){notice('Bu kişinin telefon numarası kayıtlı değil. Şahıs kaydından telefon ekle.',true);return;}
  const amount=Math.max(0,firmBalance(f.id).remaining);
  const message='Sayın: '+f.name+'\n\n'+todayPhone()+
   ' tarihi itibarıyla toplam borç bakiyeniz '+money(amount)+' tutarındadır.\n\nBilginize sunarız.';
  modalForm(f.name+' · Borç Bakiyesi WhatsApp',
   '<div><label>Alıcı</label><p><strong>'+safe(f.name)+'</strong> · '+safe(f.phone)+'</p></div>'+
   '<div><label for="v22-person-message">Mesaj taslağı (düzenlenebilir)</label>'+
   '<textarea id="v22-person-message" name="message" rows="7" maxlength="3000" required>'+
    safe(message)+'</textarea></div>'+
    '<p class="hint">Tarih cihazından, tutar güncel kalan alacaktan alınır. Mesaj otomatik gönderilmez.</p>',
   async d=>{
    if(!d.message.trim())throw new Error('Mesaj boş olamaz.');
    window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(d.message.trim()),
      '_blank','noopener,noreferrer');
    notice('WhatsApp taslağı açıldı.');
   });
  el('v22Form').querySelector('[type="submit"]').textContent='WhatsApp ile Aç';
 }
 function planDues(id){return (state.planDues||[]).filter(d=>d.plan_id===id).slice()
  .sort((a,b)=>a.installment_index-b.installment_index);}
 function renderPlans(){
  const stats=el('v22InstallmentStats'),host=el('v22InstallmentList');
  if(!stats||!host)return;
  const plans=state.paymentPlans||[];
  const all=(state.planDues||[]);
  const outstanding=all.filter(d=>!d.paid_on).reduce((n,d)=>n+Number(d.amount_kurus),0);
  const paid=all.filter(d=>!!d.paid_on).reduce((n,d)=>n+Number(d.amount_kurus),0);
  stats.innerHTML='<div><span>Toplam kalan taksit</span><strong>'+money(outstanding)+'</strong></div>'+
   '<div><span>Ödenen taksitler</span><strong>'+money(paid)+'</strong></div>'+
   '<div><span>Ödeme planı</span><strong>'+plans.length+'</strong></div>';
  host.innerHTML=plans.length?plans.map(p=>{
   const dues=planDues(p.id),done=dues.filter(d=>!!d.paid_on).length;
   const remaining=dues.filter(d=>!d.paid_on).reduce((n,d)=>n+Number(d.amount_kurus),0);
   return '<article class="v22-plan-card"><div class="v22-plan-head"><div><h3>'+safe(p.name)+'</h3>'+
    '<small>'+safe(p.purpose)+' · '+done+' / '+dues.length+' taksit ödendi</small>'+
    '<small>Toplam: '+money(p.total_kurus)+' · Kalan: <strong>'+money(remaining)+'</strong></small></div>'+
    (currentRole!=='viewer'?'<button class="mini-btn" type="button" data-v22-plan-edit="'+safe(p.id)+'">Plan adını düzenle</button>':'')+
    '</div><div class="v22-dues">'+dues.map(d=>
      '<div class="v22-due"><div><strong>'+d.installment_index+'. taksit · '+money(d.amount_kurus)+'</strong>'+
       '<small>Vade: '+safe(showDate(d.due_date))+
        (d.paid_on?' · Ödendi: '+safe(showDate(d.paid_on)):' · Bekliyor')+'</small></div>'+
       (currentRole==='viewer'?'':d.paid_on?
        '<button class="mini-btn" type="button" data-v22-due-undo="'+safe(d.id)+'">Geri al</button>':
        '<button class="mini-btn" type="button" data-v22-due-pay="'+safe(d.id)+'">Ödendi</button>')+
      '</div>').join('')+'</div></article>';
  }).join(''):'<div class="v22-empty">Henüz ödeme planı yok. Eminevim veya başka bir taksitli ödemen varsa yeni plan ekle.</div>';
  el('v22InstallmentPlans').querySelector('[data-v22-plan-add]').hidden=currentRole==='viewer';
 }
 function planEditor(id=''){
  if(currentRole==='viewer')return;
  const original=(state.paymentPlans||[]).find(p=>p.id===id),edit=!!original;
  const input=(label,name,value='',type='text',attrs='required')=>
   '<div><label for="v22-input-'+name+'">'+label+'</label>'+
    '<input id="v22-input-'+name+'" name="'+name+'" type="'+type+'" value="'+safe(value)+'" '+attrs+'></div>';
  modalForm(edit?'Ödeme Planını Düzenle':'Yeni Araç / Taksit Ödeme Planı',
   input('Ödeme yapılan kuruluş','name',original?.name||'','text','required maxlength="120" placeholder="Örn. Eminevim"')+
   input('Ödeme amacı','purpose',original?.purpose||'Araç','text','required maxlength="120"')+
   (edit?'<p class="hint">Ödenmiş taksitleri korumak için toplam, tarih ve taksit sayısı değiştirilemez.</p>':
    input('Toplam ödeme tutarı (₺, boşsa aylık × adet)','total','','text','inputmode="decimal" placeholder="0,00"')+
    input('Aylık taksit (₺)','monthly','','text','required inputmode="decimal" placeholder="0,00"')+
    input('Taksit sayısı','installment_count','12','number','required min="1" max="120" step="1"')+
    input('İlk taksit tarihi','first_due',trDate(),'date','required'))+
   '<div><label for="v22-plan-note">Not</label><textarea id="v22-plan-note" name="note" maxlength="1000" rows="3">'+
    safe(original?.note||'')+'</textarea></div>',
   async d=>{
    if(edit)await api('payment-plans/'+id,'PATCH',{name:d.name,purpose:d.purpose,note:d.note||''});
    else await api('payment-plans','POST',{
     name:d.name,purpose:d.purpose,installment_count:Number(d.installment_count),
     monthly_kurus:amountValue(d.monthly),total_kurus:d.total?amountValue(d.total):null,
     first_due:d.first_due,note:d.note||''
    });
    notice(edit?'Ödeme planı güncellendi.':'Ödeme planı ve taksitleri oluşturuldu.');
   });
 }
 function payDue(id){
  const due=(state.planDues||[]).find(d=>d.id===id);if(!due||due.paid_on)return;
  const plan=(state.paymentPlans||[]).find(p=>p.id===due.plan_id);
  modalForm((plan?.name||'Taksit')+' · '+due.installment_index+'. Taksiti Öde',
   '<p class="v22-pay-amount">Ödenecek: <strong>'+money(due.amount_kurus)+'</strong></p>'+
   '<div><label for="v22-paid-date">Ödeme tarihi</label>'+
    '<input id="v22-paid-date" name="paid_on" type="date" value="'+trDate()+'" required></div>'+
   '<div><label for="v22-paid-account">Ödeme yapılan banka / kasa</label>'+
    '<select id="v22-paid-account" name="account_id"><option value="">Sadece ödendi işaretle (banka bakiyesi değişmez)</option>'+
    (state.accounts||[]).map(a=>'<option value="'+safe(a.id)+'">'+
      safe(a.name)+' · '+money(currentBalance(a.id))+'</option>').join('')+'</select></div>'+
   '<p class="hint">Banka/kasa seçersen tutar o hesaptan yalnız bir kez düşülür. Ödemeyi önceden banka hareketine girdiysen tekrar banka seçme.</p>'+
   '<div><label>Açıklama</label><textarea name="note" rows="2" maxlength="280"></textarea></div>',
   async d=>{await api('payment-plan-dues/'+id+'/pay','POST',d);notice('Taksit ödendi olarak kaydedildi.');});
 }
 async function undoDue(id){
  if(!confirm('Bu taksidin Ödendi kaydını geri almak istiyor musun? Bağlı banka hareketi varsa geri alınır.'))return;
  try{await api('payment-plan-dues/'+id+'/undo','POST',{});await load();notice('Taksit ödeme kaydı geri alındı.');}
  catch(e){notice(e.message,true);}
 }
 async function archiveSupplier(id){
  if(currentRole!=='admin'){notice('Firmayı kaldırmak için yönetici yetkisi gerekli.',true);return;}
  const f=(state.firms||[]).find(x=>x.id===id&&x.category==='payable');
  if(!f)return;
  const left=firmBalance(f.id).remaining;
  const message=f.name+' firmasını aktif firma listesinden kaldırmak istiyor musun?\n\n'+
   'Firma borçları, taksit geçmişi ve banka ödeme hareketleri arşivde korunacak.\n'+
   (left>0?'Kalan borç: '+money(left)+' — bu tutar aktif firma borçları toplamından çıkarılacak.\n':'')+
   'Gerekirse Ayarlar → Kaldırılan firmalar bölümünden geri getirebilirsin.';
  if(!confirm(message))return;
  try{
   await api('supplier-archive','POST',{firm_id:f.id,firm_name:f.name,confirmation:'KALDIR'});
   if(typeof selectedFirmId!=='undefined'&&selectedFirmId===f.id)selectedFirmId='';
   await load();
   notice(f.name+' aktif firma listesinden kaldırıldı; geçmişi korundu.');
  }catch(error){notice(error.message,true);}
 }
 async function archivePlatform(id){
  if(currentRole!=='admin'){notice('Platform silmek için yönetici yetkisi gerekli.',true);return;}
  const f=(state.firms||[]).find(f=>f.id===id&&f.receivable_group==='platform'&&f.category==='receivable');
  if(!f)return;
  if(!confirm(f.name+' platformunu aktif listeden kaldırmak istiyor musun?\n\n'+
   'Hareket geçmişi ve banka tahsilatları güvenlik için arşivde korunur. Kalan alacak aktif toplamdan çıkarılır.'))return;
  const answer=prompt('SON ONAY: İstanbul’un fethi kaç yılında gerçekleşti?\nYılı yaz:');
  if(answer===null)return;
  if(answer.trim()!=='1453'){notice('Son onay başarısız. Silmek için 1453 yazılmalı.',true);return;}
  try{await api('platform-archive','POST',{firm_id:id,firm_name:f.name,confirmation:'1453'});
   await load();notice(f.name+' aktif listeden kaldırıldı. Gerekirse Ayarlar → Platform Arşivi bölümünden geri getir.');}
  catch(error){notice(error.message,true);}
 }
 function renderArchive(){
  const supplierHost=el('v23SupplierArchiveList');
  if(supplierHost)supplierHost.innerHTML=currentRole==='admin'?
   '<button type="button" class="mini-btn" data-v23-archive-refresh>Arşivlenen firmaları göster</button>'+
   '<div id="v23SupplierArchiveRows"></div>':
   '<p class="muted">Firma arşivini yalnız yönetici görebilir.</p>';
  const host=el('v22ArchiveList');if(!host)return;
  host.innerHTML=currentRole==='admin'?
   '<p class="hint">Hareketleri olan platformlar güvenli şekilde gizlenir; banka geçmişi silinmez.</p>'+
    '<button class="mini-btn" type="button" data-v22-archive-refresh>Arşivi listele</button>'+
    '<div id="v22ArchiveRows"></div>':
   '<p class="muted">Arşivi yalnız yönetici görebilir.</p>';
 }
 async function listArchive(){
  const host=el('v22ArchiveRows');if(!host)return;
  try{
   const data=await api('platform-archive');
   host.innerHTML=(data.archivedPlatforms||[]).length?data.archivedPlatforms.map(f=>
    '<div class="v22-archive-row"><span>'+safe(f.firm_name)+' · '+safe(showDate(f.archived_at))+'</span>'+
    '<button class="mini-btn" type="button" data-v22-restore="'+safe(f.firm_id)+'">Geri getir</button></div>').join(''):
    '<p class="muted">Arşivde platform bulunmuyor.</p>';
  }catch(error){notice(error.message,true);}
 }
 async function listArchivedSuppliers(){
  const host=el('v23SupplierArchiveRows');if(!host)return;
  try{
   const data=await api('supplier-archive');
   host.innerHTML=(data.archivedSuppliers||[]).length?data.archivedSuppliers.map(f=>
    '<div class="v22-archive-row"><span>'+safe(f.firm_name)+' · '+safe(showDate(f.archived_at))+
    '</span><button type="button" class="mini-btn" data-v23-supplier-restore="'+safe(f.firm_id)+
    '">Geri getir</button></div>').join(''):
    '<p class="muted">Arşivde firma bulunmuyor.</p>';
  }catch(error){notice(error.message,true);}
 }
 function render(){
  init();renderBankTotal();renderSuppliers();renderPlans();
 }
 const originalFirm=window.renderFirms;
 window.renderFirms=function(){if(typeof originalFirm==='function')originalFirm();renderSuppliers();};
 const originalCore=window.renderCoreMoney;
 window.renderCoreMoney=function(){if(typeof originalCore==='function')originalCore();renderBankTotal();renderPlans();};
 const originalSettings=window.renderSettings;
 window.renderSettings=function(){if(typeof originalSettings==='function')originalSettings();renderArchive();};
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-firm-delete]');
  if(!b)return;
  const firm=(state.firms||[]).find(f=>f.id===b.dataset.firmDelete);
  if(firm?.category==='receivable'&&firm.receivable_group==='platform'){
   event.preventDefault();event.stopImmediatePropagation();archivePlatform(firm.id);
  }else if(firm?.category==='payable'){
   // Capture before the legacy delete handler that rejects firms with movements.
   event.preventDefault();event.stopImmediatePropagation();archiveSupplier(firm.id);
  }
 },true);
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-v22-supplier-add],[data-v22-supplier],'+
    '[data-v22-profile-edit],[data-v22-profile-share],[data-v47-visit-share],[data-v22-close],'+
    '[data-v22-person-whatsapp],[data-v22-plan-add],[data-v22-plan-edit],'+
    '[data-v22-due-pay],[data-v22-due-undo],[data-v22-archive-refresh],[data-v22-restore],'+
    '[data-v23-archive-refresh],[data-v23-supplier-restore]');
  if(!b)return;
  if(b.dataset.v22SupplierAdd!==undefined){if(currentRole!=='viewer')window.openFirmForm('new','payable');}
  else if(b.dataset.v22Supplier)detailProfile(b.dataset.v22Supplier);
  else if(b.dataset.v22ProfileEdit){el('modal').close();editProfile(b.dataset.v22ProfileEdit);}
  else if(b.dataset.v22ProfileShare){el('modal').close();shareProfile(b.dataset.v22ProfileShare);}
  else if(b.dataset.v47VisitShare){el('modal').close();shareProfile(b.dataset.v47VisitShare,true);}
  else if(b.dataset.v22Close!==undefined)el('modal').close();
  else if(b.dataset.v22PersonWhatsapp)personWhatsapp(b.dataset.v22PersonWhatsapp);
  else if(b.dataset.v22PlanAdd!==undefined)planEditor();
  else if(b.dataset.v22PlanEdit)planEditor(b.dataset.v22PlanEdit);
  else if(b.dataset.v22DuePay)payDue(b.dataset.v22DuePay);
  else if(b.dataset.v22DueUndo)undoDue(b.dataset.v22DueUndo);
  else if(b.dataset.v22ArchiveRefresh!==undefined)listArchive();
  else if(b.dataset.v23ArchiveRefresh!==undefined)listArchivedSuppliers();
  else if(b.dataset.v23SupplierRestore){
   if(currentRole!=='admin'||!confirm('Bu firmayı tekrar aktif listeye almak istiyor musun?'))return;
   api('supplier-archive/'+b.dataset.v23SupplierRestore+'/restore','POST',{})
    .then(()=>load()).then(()=>listArchivedSuppliers())
    .catch(error=>notice(error.message,true));
  }
  else if(b.dataset.v22Restore){
   if(currentRole!=='admin'||!confirm('Platformu aktif listeye geri getir?'))return;
   api('platform-archive/'+b.dataset.v22Restore+'/restore','POST',{})
    .then(()=>load()).then(()=>listArchive()).catch(error=>notice(error.message,true));
  }
 });
 window.HTV22={render,personWhatsapp,contactsFor,renderBankTotal,renderSuppliers,renderPlans,
  archiveSupplier,listArchivedSuppliers,planEditor};
 init();
})();