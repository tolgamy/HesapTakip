'use strict';
// Kart kataloğu ve modern kart yönetimi; eski kartları/ekstreleri silmez.
const vectorBrandMap={"akbank":"akbank","aktifbank":"aktifbank","albaraka":"albaraka","alternatifbank":"alternatifbank","anadolubank":"anadolubank","burgan":"burgan","citibank":"citibank","denizbank":"denizbank","dunya-katilim":"dunyakatilim","emlak-katilim":"emlakkatilim","enpara":"enpara","fibabanka":"fibabanka","freedom-bank":"freedombank","garanti":"garanti","halkbank":"halkbank","hayat-finans":"hayatfinans","hsbc":"hsbc","icbc":"icbc","ing":"ing","isbank":"isbank","kuveytturk":"kuveytturk","odea":"odeabank","papara":"papara","qnb":"qnb","sekerbank":"sekerbank","teb":"teb","terabank":"terabank","turkiye-finans":"turkiyefinans","vakifbank":"vakifbank","vakif-katilim":"vakifkatilim","yapikredi":"yapikredi","ziraat":"ziraat","ziraat-katilim":"ziraatkatilim","iyzico":"iyzico","akode":"tosla","nkolay-ep":"nkolay"};
let chosenInstitutionId='';
let institutionSearch='', institutionEditingId='';
const currencyCard=(n,ccy='TRY')=> n===null||n===undefined?'—':
 new Intl.NumberFormat('tr-TR',{style:'currency',currency:ccy||'TRY'}).format(Number(n)/100);
const instById=id=>(state.institutions||[]).find(x=>x.id===id);
const cleanStr=s=>String(s??'');
function institutionForCard(card){
 return instById(card.institution_id)||
  (state.institutions||[]).find(x=>x.name.toLocaleLowerCase('tr-TR')===cleanStr(card.bank).toLocaleLowerCase('tr-TR'))||null;
}
function institutionIcon(inst,label,size=''){
 const title=inst?.short_name||label||'Kurum';
 const letters=(title.match(/\p{L}/gu)||[]).slice(0,2).join('').toLocaleUpperCase('tr-TR');
 const domain=inst?.domain&&/^[a-z0-9.-]+$/.test(inst.domain)?inst.domain:'';
 const vector=inst?.id&&vectorBrandMap[inst.id];
 const src=inst?.logo_data||(vector?
  'https://cdn.jsdelivr.net/gh/murattahtaci/turkish-bank-logos-svg@main/svg/'+vector+'.svg':
  (domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':''));
 return '<span class="inst-brand '+size+'" title="'+esc(title)+'">'+
   '<span class="inst-initial">'+esc(letters||'₺')+'</span>'+
   (src?'<img class="institution-logo-img" src="'+esc(src)+'" loading="lazy" referrerpolicy="no-referrer" alt="'+esc(title)+' logosu">':'')+
   '</span>';
}
document.addEventListener('error',event=>{
 const el=event.target;
 if(el instanceof HTMLImageElement&&el.classList.contains('institution-logo-img'))el.remove();
},true);
function cardDueValue(c){return c.display_next_due_date||c.current_due_date||c.estimated_due_date||null;}
function proCardList() {
 const all=state.cards||[], institutions=state.institutions||[];
 const selector=el('cardFilterBank'),prior=selector.value;
 const matched=new Map();
 for(const c of all){
  const inst=institutionForCard(c),id=inst?.id||'legacy:'+c.bank;
  matched.set(id,inst?.name||c.bank);
 }
 selector.innerHTML='<option value="all">Tüm kurumlar</option>'+
  [...matched.entries()].sort((a,b)=>a[1].localeCompare(b[1],'tr')).map(([id,name])=>
    '<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 selector.value=matched.has(prior)||prior==='all'?prior:'all';
 const bankFilter=selector.value,dueWindow=el('cardDueWindow').value;
 const query=el('cardSearch').value.trim().toLocaleLowerCase('tr-TR');
 const type=el('cardFilterType').value,status=el('cardFilterStatus').value,sort=el('cardSort').value;
 const filtered=all.filter(c=>{
  const institution=institutionForCard(c);
  const label=[c.owner,c.bank,c.nickname,institution?.name,c.last4].join(' ').toLocaleLowerCase('tr-TR');
  const due=cardDueValue(c),days=due?dayDifference(due):null;
  const dueMatch=dueWindow==='all'||(days!==null&&
   (dueWindow==='overdue'?days<0:days>=0&&days<=Number(dueWindow)));
  return (!query||label.includes(query))&&
   (bankFilter==='all'||(institution?.id||'legacy:'+c.bank)===bankFilter)&&dueMatch&&
   (type==='all'||institution?.type===type)&&
   (status==='all'||(c.status||'active')===status);
 });
 filtered.sort((a,b)=>sort==='due'?
   (cardDueValue(a)||'9999').localeCompare(cardDueValue(b)||'9999'):
   sort==='limit'?(b.credit_limit_kurus||0)-(a.credit_limit_kurus||0):
   sort==='available'?(b.available_limit_kurus||0)-(a.available_limit_kurus||0):
   (a.bank||'').localeCompare(b.bank||'','tr'));
 const cardsWithLimit=all.filter(c=>c.credit_limit_kurus!==null&&c.credit_limit_kurus!==undefined);
 const sumLimit=cardsWithLimit.reduce((n,c)=>n+c.credit_limit_kurus,0);
 const sumAvailable=cardsWithLimit.reduce((n,c)=>n+(c.available_limit_kurus||0),0);
 el('cardsSummary').textContent=all.length+' kart · '+institutions.length+' kuruluş · '+cardsWithLimit.length+
  ' kart için girilmiş toplam limit '+currencyCard(sumLimit)+
  ' · Kullanılabilir limit (girilenler) '+currencyCard(sumAvailable);
 el('manageInstitutions').hidden=currentRole!=='admin';
 el('cardList').innerHTML=filtered.length?filtered.map(c=>{
  const inst=institutionForCard(c), cc=c.currency||'TRY', limit=c.credit_limit_kurus,
    available=c.available_limit_kurus,used=c.used_limit_kurus;
  const st=c.status||'active',due=cardDueValue(c);
  const days=due?dayDifference(due):null;
  const nextStatement=c.display_next_statement_date||c.estimated_statement_date;
  const details=[['Kart türü',({credit:'Kredi',debit:'Banka',virtual:'Sanal',pos:'POS/Ticari'}[c.card_type]||'Kredi')],
    ['Limit',currencyCard(limit,cc)],['Kullanılabilir',currencyCard(available,cc)],
    ['Kullanılan',currencyCard(used,cc)],
    ['Kesim günü',c.statement_day?('Her ay '+c.statement_day):'—'],
    ['Ödeme günü',c.due_day?('Her ay '+c.due_day):'—'],
    ['Son hesap kesim',c.current_statement_date||'—'],
    ['Son ödeme tarihi',c.current_due_date||'—'],
    ['Bir sonraki kesim',nextStatement||'—'],
    ['Bir sonraki ödeme',due||'—'],
    ['Tahmini sonraki kesim',c.following_statement_date||'—'],
    ['Tahmini sonraki ödeme',c.following_due_date||'—'],
    ['Asgari ödeme oranı',c.min_payment_percent!=null?c.min_payment_percent+'%':'—'],
    ['Nakit avans limiti',currencyCard(c.cash_advance_limit_kurus,cc)],
    ['Bağlı IBAN',c.linked_iban?'•••• '+c.linked_iban.slice(-4):'—']];
  const tag=st!=='active'?'<span class="badge warn">'+(st==='cancelled'?'İptal':'Pasif')+'</span>':
    days!==null&&days<=7?(days<0?'<span class="badge danger">Vade geçti</span>':'<span class="badge warn">'+days+' gün kaldı</span>'):'';
  const open=summary().filter(s=>s.card_id===c.id).reduce((n,x)=>n+x.left,0);
  return '<article class="card-item pro-card">'+
   '<div class="credit-visual pro-credit-visual" style="--card-accent:'+esc(c.color||'#0a2c38')+'">'+
    '<div class="card-institution">'+institutionIcon(inst,c.bank,'card-logo')+
      '<div><small>'+(inst?.type==='payment'?'ÖDEME KURULUŞU':'BANKA')+'</small><strong>'+esc(c.bank)+'</strong></div></div>'+
    '<div class="pro-card-brand"><div><strong>'+esc(c.nickname)+'</strong><small>'+esc(c.owner)+
     (c.is_additional?' · Ek kart':'')+' · '+(c.usage_type==='business'?'Ticari':'Bireysel')+'</small></div>'+
      '<strong>•••• '+esc(c.last4||'••••')+'</strong></div></div>'+
   '<div class="pro-card-highlights"><div><small>Toplam limit</small><strong>'+currencyCard(limit,cc)+'</strong></div>'+
     '<div><small>Kullanılabilir</small><strong>'+currencyCard(available,cc)+'</strong></div></div>'+
   (limit!==null&&limit>0&&available!==null?
     '<div class="card-limit-bar"><span style="width:'+Math.min(100,Math.round((used||0)*100/limit))+'%"></span></div>':'')+
   '<div class="pro-card-dates"><span><small>Sonraki kesim</small><strong>'+esc(nextStatement||'—')+'</strong></span>'+
     '<span><small>Sonraki ödeme</small><strong>'+esc(due||'—')+'</strong></span></div>'+
   '<div class="pro-card-balance">Açık ekstre borcu: <strong>'+money(open)+'</strong>'+tag+'</div>'+
   '<details class="pro-card-extra"><summary>Tüm kart bilgileri</summary>'+
    '<dl>'+details.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+
    (c.note?'<p>'+esc(c.note)+'</p>':'')+
    (c.interest_note?'<p><strong>Faiz:</strong> '+esc(c.interest_note)+'</p>':'')+
    (c.commission_note?'<p><strong>Komisyon:</strong> '+esc(c.commission_note)+'</p>':'')+
   '</details>'+
   '<div class="row-actions pro-card-actions">'+
    '<button class="mini-btn" data-card-statement="'+esc(c.id)+'">Ekstre ekle</button>'+
    '<button class="mini-btn" data-edit="card" data-id="'+esc(c.id)+'">Düzenle</button>'+
    '<button class="mini-btn delete" data-delete="card" data-id="'+esc(c.id)+'">Sil</button></div></article>';
 }).join(''):'<div class="empty-state"><strong>Kart bulunamadı</strong>Yeni kart ekleyebilir veya arama filtrelerini temizleyebilirsiniz.</div>';
 if(currentRole==='viewer')document.querySelectorAll('.pro-card-actions button').forEach(b=>b.hidden=true);
}
function proCardField(label,name,type='text',value='',extra=''){
 return '<div class="pro-field"><label for="cp-'+name+'">'+esc(label)+'</label>'+
  '<input id="cp-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></div>';
}
const proSelect=(label,name,options,value)=>'<div class="pro-field"><label for="cp-'+name+'">'+esc(label)+'</label>'+
 '<select id="cp-'+name+'" name="'+name+'">'+options.map(([key,title])=>
  '<option value="'+esc(key)+'" '+(String(key)===String(value)?'selected':'')+'>'+esc(title)+'</option>').join('')+'</select></div>';
const moneyInput=(name,label,value)=>proCardField(label,name,'number',value==null?'':Number((value/100).toFixed(2)),'min="0" step="0.01"');
const cardDateField=(name,label,value)=>proCardField(label,name,'date',value||'');
const cardTextArea=(name,label,value)=>'<div class="pro-field full"><label for="cp-'+name+'">'+esc(label)+'</label><textarea id="cp-'+name+'" name="'+name+'" maxlength="280">'+esc(value||'')+'</textarea></div>';
function proInstitutionSelect(selected){
 const options=(state.institutions||[]).filter(x=>x.is_active||x.id===selected);
 const bank=options.filter(x=>x.type==='bank'),payments=options.filter(x=>x.type==='payment');
 const group=(name,list)=>'<optgroup label="'+name+'">'+list.map(x=>'<option value="'+esc(x.id)+'"'+
  (x.id===selected?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</optgroup>';
 return '<div class="pro-field full"><label for="cp-instSearch">Kurum ara (banka / fintech)</label>'+
  '<input id="cp-instSearch" type="search" placeholder="Akbank, Papara, PayTR, iyzico, Tami..." autocomplete="off">'+
  '<select id="cp-institution_id" name="institution_id"><option value="">Listede yok / elle gir</option>'+
  group('Bankalar',bank)+group('Ödeme / elektronik para kuruluşları',payments)+'</select>'+
  '<p class="hint">Seçilen kurumun adı ve logosu otomatik doldurulur. Kurum bir kart düzenleyicisi olmayabilir.</p>'+
  '<div class="card-logo-preview" id="cardLogoPreview"></div></div>';
}
function proCardModal(id=''){
 if(currentRole==='viewer'){notice('Salt okunur kullanıcının kayıt yetkisi yok.',true);return;}
 const c=(state.cards||[]).find(x=>x.id===id);
 el('modalTitle').textContent=c?'Kartı düzenle':'Yeni kart / hesap';
 const sections=[
  '<div class="card-form-heading">Kurum ve kart</div>',
  proInstitutionSelect(c?.institution_id||''),
  proCardField('Kurum adı','bank','text',c?.bank||'','required maxlength="120"'),
  proCardField('Kart sahibi','owner','text',c?.owner||'','required maxlength="70"'),
  proCardField('Kart adı / takma ad','nickname','text',c?.nickname||'','required maxlength="70"'),
  proCardField('Son 4 hane (isteğe bağlı)','last4','text',c?.last4||'','maxlength="4" pattern="[0-9]{4}" inputmode="numeric"'),
  proSelect('Kart türü','card_type',[['credit','Kredi kartı'],['debit','Banka kartı'],['virtual','Sanal kart'],['pos','POS / ticari kart']],c?.card_type||'credit'),
  proSelect('Kullanım','usage_type',[['personal','Bireysel'],['business','Ticari']],c?.usage_type||'personal'),
  proSelect('Ek kart mı?','is_additional',[['0','Hayır'],['1','Evet']],c?.is_additional?'1':'0'),
  proSelect('Para birimi','currency',[['TRY','Türk lirası'],['USD','USD'],['EUR','EUR'],['GBP','GBP']],c?.currency||'TRY'),
  '<div class="card-form-heading">Limitler</div>',
  moneyInput('credit_limit','Toplam kart limiti',c?.credit_limit_kurus),
  moneyInput('available_limit','Kullanılabilir limit',c?.available_limit_kurus),
  moneyInput('cash_advance_limit','Nakit avans limiti',c?.cash_advance_limit_kurus),
  proCardField('Asgari ödeme oranı (%)','min_payment_percent','number',c?.min_payment_percent??'','min="0" max="100" step="0.1"'),
  '<p class="hint full">Kullanılan limit = kart limiti − kullanılabilir limit. Bankayla otomatik senkronizasyon yoktur.</p>',
  '<div class="card-form-heading">Hesap kesim / vade takvimi</div>',
  proCardField('Hesap kesim günü (1-31)','statement_day','number',c?.statement_day??'','min="1" max="31" step="1"'),
  proCardField('Ödeme günü (1-31)','due_day','number',c?.due_day??'','min="1" max="31" step="1"'),
  cardDateField('current_statement_date','Son gerçek hesap kesim tarihi',c?.current_statement_date),
  cardDateField('current_due_date','Gerçek son ödeme tarihi',c?.current_due_date),
  cardDateField('next_statement_date','Bir sonraki gerçek kesim (isteğe bağlı)',c?.next_statement_date),
  cardDateField('next_due_date','Bir sonraki gerçek ödeme (isteğe bağlı)',c?.next_due_date),
  '<div id="cardEstimatePreview" class="card-estimate-preview full">Kesim ve ödeme günü seçildiğinde yaklaşık tarihler gösterilir.</div>',
  '<div class="card-form-heading">Ayarlar ve notlar</div>',
  proSelect('Kart durumu','status',[['active','Aktif'],['passive','Pasif'],['cancelled','İptal']],c?.status||'active'),
  proSelect('Hatırlatmalar','reminder_enabled',[['1','Açık'],['0','Kapalı']],c?.reminder_enabled===0?'0':'1'),
  proCardField('Kart rengi','color','color',c?.color||'#0a2c38'),
  proCardField('Bağlı hesap IBAN (isteğe bağlı)','linked_iban','text',c?.linked_iban||'','maxlength="40" autocomplete="off"'),
  cardTextArea('interest_note','Faiz notu',c?.interest_note),
  cardTextArea('commission_note','Komisyon notu',c?.commission_note),
  cardTextArea('note','Diğer not',c?.note),
  '<p class="fine-print full">Tam kart numarası, CVV ve banka giriş şifresi kaydetmeyin. IBAN bilgisini yalnızca gerçekten gerekiyorsa girin. Tahminler resmi banka tarihleri değildir.</p>'
 ];
 el('modalContents').innerHTML='<form id="proCardForm" class="modal-form card-form" data-card-id="'+esc(id)+'">'+
  sections.join('')+'<div class="form-actions full"><button class="btn subtle" type="button" id="cancelProCard">Vazgeç</button>'+
  '<button class="btn primary" type="submit">Kaydet</button></div></form>';
 el('cancelProCard').onclick=()=>el('modal').close();
 const form=el('proCardForm');
 form.querySelector('#cp-institution_id').addEventListener('change',()=>{
  const inst=instById(form.elements.institution_id.value);
  if(inst)form.elements.bank.value=inst.short_name||inst.name;
  el('cardLogoPreview').innerHTML=inst?institutionIcon(inst,inst.name):'Serbest kuruluş adı';
 });
 form.querySelector('#cp-instSearch').addEventListener('input',e=>{
  const q=e.target.value.toLocaleLowerCase('tr-TR');
  for(const option of form.elements.institution_id.options){
   if(!option.value)continue;
   const item=instById(option.value),name=[item?.name,item?.short_name,item?.search_keywords].join(' ').toLocaleLowerCase('tr-TR');
   option.hidden=!name.includes(q);
  }
 });
 const updatePreview=()=>{
  const day=Number(form.elements.statement_day.value),due=Number(form.elements.due_day.value);
  if(!day||!due||day>31||due>31)return;
  const estimate=estimateLocalDates(day,due,trDate());
  el('cardEstimatePreview').textContent='Tahmini sonraki kesim: '+estimate[0]+
   ' · Tahmini ödeme: '+estimate[1]+' · Takip eden kesim: '+estimate[2]+
   ' · Takip eden ödeme: '+estimate[3]+' (resmî tarih değildir)';
 };
 for(const n of ['statement_day','due_day'])form.elements[n].addEventListener('input',updatePreview);
 updatePreview();
 form.elements.institution_id.dispatchEvent(new Event('change'));
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=form.querySelector('[type=submit]');button.disabled=true;
  const d=Object.fromEntries(new FormData(form));
  const optionalAmount=name=>d[name]===''?null:amountValue(d[name]);
  try{
   const payload={
    owner:d.owner,bank:d.bank,nickname:d.nickname,last4:d.last4||null,
    institution_id:d.institution_id||null,card_type:d.card_type,usage_type:d.usage_type,
    is_additional:d.is_additional==='1',
    credit_limit_kurus:optionalAmount('credit_limit'),
    available_limit_kurus:optionalAmount('available_limit'),
    cash_advance_limit_kurus:optionalAmount('cash_advance_limit'),
    min_payment_percent:d.min_payment_percent===''?null:Number(d.min_payment_percent),
    statement_day:d.statement_day===''?null:Number(d.statement_day),
    due_day:d.due_day===''?null:Number(d.due_day),
    current_statement_date:d.current_statement_date||null,current_due_date:d.current_due_date||null,
    next_statement_date:d.next_statement_date||null,next_due_date:d.next_due_date||null,
    currency:d.currency,status:d.status,reminder_enabled:d.reminder_enabled==='1',
    linked_iban:d.linked_iban||'',interest_note:d.interest_note||'',commission_note:d.commission_note||'',
    note:d.note||'',color:d.color
   };
   await api('cards'+(id?'/'+id:''),id?'PATCH':'POST',payload);
   el('modal').close();await load();notice(id?'Kart güncellendi.':'Kart oluşturuldu.');
  }catch(err){notice(err.message,true);}finally{button.disabled=false;}
 });
 el('modal').showModal();
}
function estimateLocalDates(day,due,today){
 const plusMonth=(date,n)=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+n,1));
 const dayStr=(dt,d)=>new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),
  Math.min(d,new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate()))).toISOString().slice(0,10);
 let d=new Date(today+'T12:00:00Z'),cut=dayStr(d,day);
 if(cut<=today)d=plusMonth(d,1);
 const t=due<=day?1:0,following=plusMonth(d,1);
 return [dayStr(d,day),dayStr(plusMonth(d,t),due),dayStr(following,day),dayStr(plusMonth(following,t),due)];
}
function institutionManagerForm(){
 const edit=instById(institutionEditingId),all=state.institutions||[];
 const shown=all.filter(x=>[x.name,x.short_name,x.search_keywords].join(' ').toLocaleLowerCase('tr-TR')
  .includes(institutionSearch.toLocaleLowerCase('tr-TR'))).slice(0,65);
 const form='<form id="institutionEditor" class="institution-editor">'+
  '<h3>'+(edit?'Kuruluş düzenle':'Yeni kuruluş ekle')+'</h3>'+
  proCardField('Kurum adı','name','text',edit?.name||'','required maxlength="120"')+
  proCardField('Kısa ad','short_name','text',edit?.short_name||'','maxlength="90"')+
  proSelect('Tür','type',[['bank','Banka'],['payment','Ödeme / e-para']],edit?.type||'payment')+
  proCardField('Resmî web alan adı','domain','text',edit?.domain||'','placeholder="ornek.com.tr" maxlength="160"')+
  proCardField('Arama kelimeleri','search_keywords','text',edit?.search_keywords||'','maxlength="220"')+
  proSelect('Durum','is_active',[['1','Aktif'],['0','Pasif']],edit?.is_active===0?'0':'1')+
  '<div class="pro-field full"><label for="institutionLogoFile">Logo (PNG / JPG / WebP, isteğe bağlı)</label>'+
    '<input id="institutionLogoFile" type="file" accept="image/png,image/jpeg,image/webp">'+
    '<p class="hint">Küçük logo güvenli resim biçiminde saklanır; SVG kabul edilmez.</p></div>'+
  '<div class="full">'+(edit?institutionIcon(edit,edit.name):'')+'</div>'+
  '<div class="form-actions full"><button class="btn subtle" type="button" id="institutionClear">Yeni</button>'+
   '<button class="btn primary" type="submit">'+(edit?'Güncelle':'Ekle')+'</button></div></form>';
 const list='<div class="institution-list"><h3>Kuruluşlar ('+all.length+' kayıt, ilk 65 sonuç)</h3>'+
  '<input id="institutionSearch" type="search" value="'+esc(institutionSearch)+'" placeholder="Kuruluş ara">'+
  '<div id="institutionListItems">'+shown.map(x=>'<div class="institution-row">'+
   institutionIcon(x,x.name)+
   '<span class="institution-row-name"><strong>'+esc(x.name)+'</strong><small>'+
      (x.type==='bank'?'Banka':'Ödeme/e-para')+(x.is_active?'':' · Pasif')+'</small></span>'+
   '<button class="mini-btn" type="button" data-inst-edit="'+esc(x.id)+'">Düzenle</button>'+
   (x.is_custom?'<button class="mini-btn delete" type="button" data-inst-remove="'+esc(x.id)+'">Sil</button>':'')+
   '</div>').join('')+'</div></div>';
 el('institutionManagement').innerHTML='<div class="institution-manager-layout">'+form+list+'</div>'+
  '<section class="institution-import"><h3>Toplu kurum içe aktar</h3><p class="muted">CSV başlıkları: name,type,domain,short_name,search_keywords. Türler bank/payment.</p>'+
  '<input id="institutionCsvFile" type="file" accept=".csv,text/csv"><button id="institutionCsvButton" type="button" class="btn secondary">CSV dosyasını içe aktar</button></section>';
 const editor=el('institutionEditor');
 el('institutionClear').onclick=()=>{institutionEditingId='';institutionManagerForm();};
 el('institutionSearch').oninput=e=>{institutionSearch=e.target.value;institutionManagerForm();el('institutionSearch').focus();};
 editor.onsubmit=async event=>{
  event.preventDefault();const submit=editor.querySelector('[type=submit]');submit.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(editor));
   const upload=el('institutionLogoFile').files?.[0];
   const logo_data=upload?await reduceLogo(upload):(edit?.logo_data||'');
   const payload={name:d.name,short_name:d.short_name,type:d.type,domain:d.domain,
     search_keywords:d.search_keywords,is_active:d.is_active==='1',logo_data};
   await api('institutions'+(institutionEditingId?'/'+institutionEditingId:''),institutionEditingId?'PATCH':'POST',payload);
   const response=await api('institutions');state.institutions=response.institutions;
   institutionEditingId='';institutionManagerForm();proCardList();notice('Kurum ve logosu kaydedildi.');
  }catch(e){notice(e.message,true);}finally{submit.disabled=false;}
 };
 el('institutionCsvButton').onclick=importInstitutionCsv;
}
async function reduceLogo(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG, JPG veya WebP seçin.');
 if(file.size>1000000)throw new Error('Logo en fazla 1 MB olabilir.');
 const original=await new Promise((res,rej)=>{
  const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{URL.revokeObjectURL(url);res(img);};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Görsel okunamadı.'));};img.src=url;
 });
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,64,64);
 const scale=Math.min(58/original.width,58/original.height);
 const w=original.width*scale,h=original.height*scale;
 ctx.drawImage(original,(64-w)/2,(64-h)/2,w,h);
 let output=canvas.toDataURL('image/webp',.45);
 if(output.length>9000)output=canvas.toDataURL('image/jpeg',.35);
 if(output.length>9500)throw new Error('Bu logo hâlâ çok büyük. Daha küçük bir görsel seçin.');
 return output;
}
function parseCsvTable(csv){
 const delimiter=csv.split(/\r?\n/,1)[0].includes(';')?';':',';
 const rows=[];let cell='',row=[],quoted=false;
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];if(ch==='"'){
   if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
  }else if(ch===delimiter&&!quoted){row.push(cell.trim());cell='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){
   if(ch==='\r'&&csv[i+1]==='\n')i++;
   row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];
  }else cell+=ch;
 }
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(quoted)throw new Error('CSV dosyasında kapanmamış tırnak var.');
 if(!rows.length)return [];
 const headers=rows.shift().map(x=>x.toLowerCase().replace(/^\uFEFF/,''));
 if(!headers.includes('name')||!headers.includes('type'))throw new Error('CSV başlığında name ve type olmalı.');
 return rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||''])));
}
async function importInstitutionCsv(){
 if(currentRole!=='admin')return;
 const file=el('institutionCsvFile').files?.[0];
 if(!file){notice('Önce CSV dosyasını seçin.',true);return;}
 if(file.size>300000){notice('CSV en fazla 300 KB olabilir.',true);return;}
 const button=el('institutionCsvButton');button.disabled=true;
 try{
  const items=parseCsvTable(await file.text());
  if(!items.length||items.length>500)throw new Error('CSV 1-500 kayıt içermeli.');
  for(const item of items){
   if(!item.name||!['bank','payment'].includes(item.type))throw new Error('CSV name veya type geçersiz.');
  }
  let count=0;
  for(let start=0;start<items.length;start+=20){
   const result=await api('institutions/import','POST',{items:items.slice(start,start+20)});
   count+=result.created||0;
  }
  state.institutions=(await api('institutions')).institutions;
  institutionManagerForm();proCardList();notice(count+' kurum içe aktarıldı.');
 }catch(error){notice(error.message,true);}finally{button.disabled=false;}
}
document.addEventListener('click',e=>{
 const newStatement=e.target.closest('[data-card-statement]');
 if(newStatement){modal('statement',newStatement.dataset.cardStatement);return;}
 const edit=e.target.closest('[data-inst-edit]');
 if(edit){institutionEditingId=edit.dataset.instEdit;institutionManagerForm();return;}
 const del=e.target.closest('[data-inst-remove]');
 if(del){
  if(!confirm('Bu özel kuruluşu silmek istiyor musunuz?'))return;
  api('institutions/'+del.dataset.instRemove,'DELETE').then(async()=>{
   state.institutions=(await api('institutions')).institutions;
   institutionEditingId='';institutionManagerForm();proCardList();notice('Kurum silindi.');
  }).catch(e=>notice(e.message,true));
 }
});
for(const id of ['cardSearch','cardFilterType','cardFilterBank','cardDueWindow','cardFilterStatus','cardSort'])
 el(id).addEventListener('input',proCardList);
el('manageInstitutions').addEventListener('click',()=>{
 if(currentRole!=='admin'){notice('Yalnızca yönetici kurumu düzenleyebilir.',true);return;}
 institutionEditingId='';institutionSearch='';institutionManagerForm();el('institutionDialog').showModal();
});
el('closeInstitutionDialog').onclick=()=>el('institutionDialog').close();
window.renderProCards=proCardList;
window.openProCardForm=proCardModal;
