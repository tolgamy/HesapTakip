'use strict';
// Kart kataloğu ve modern kart yönetimi; eski kartları/ekstreleri silmez.
const vectorBrandMap={"akbank":"akbank","aktifbank":"aktifbank","albaraka":"albaraka","alternatifbank":"alternatifbank","anadolubank":"anadolubank","burgan":"burgan","citibank":"citibank","denizbank":"denizbank","dunya-katilim":"dunyakatilim","emlak-katilim":"emlakkatilim","enpara":"enpara","fibabanka":"fibabanka","freedom-bank":"freedombank","garanti":"garanti","halkbank":"halkbank","hayat-finans":"hayatfinans","hsbc":"hsbc","icbc":"icbc","ing":"ing","isbank":"isbank","kuveytturk":"kuveytturk","odea":"odeabank","papara":"papara","qnb":"qnb","sekerbank":"sekerbank","teb":"teb","terabank":"terabank","turkiye-finans":"turkiyefinans","vakifbank":"vakifbank","vakif-katilim":"vakifkatilim","yapikredi":"yapikredi","ziraat":"ziraat","ziraat-katilim":"ziraatkatilim","iyzico":"iyzico","akode":"tosla","nkolay-ep":"nkolay"};
const mealBrandIds=['setcard','multinet','edenred','metropolcard','tokenflex','pluxee'];
let mealPrefillId='';
let chosenInstitutionId='';
let institutionSearch='', institutionEditingId='',institutionDefaultType='bank';
let institutionOnlyHidden=false, institutionOnlyBanks=true;
const institutionSelection=new Set();
let bankShowAll=false;
const currencyCard=(n,ccy='TRY')=> n===null||n===undefined?'—':
 new Intl.NumberFormat('tr-TR',{style:'currency',currency:ccy||'TRY'}).format(Number(n)/100);
const instById=id=>(state.institutions||[]).find(x=>x.id===id);
const cleanStr=s=>String(s??'');
function institutionForCard(card){
 return instById(card.institution_id)||
  (state.institutions||[]).find(x=>x.name.toLocaleLowerCase('tr-TR')===cleanStr(card.bank).toLocaleLowerCase('tr-TR'))||null;
}
function institutionIcon(inst,label,size=''){
 const title=window.HTBrand?.label(inst?.short_name||label||'Kurum')||(inst?.short_name||label||'Kurum');
 const letters=window.HTBrand?.initials(title)||(title.match(/\p{L}/gu)||[]).slice(0,2).join('').toLocaleUpperCase('tr-TR');
 const domain=inst?.domain&&/^[a-z0-9.-]+$/.test(inst.domain)?inst.domain:'';
 const vector=inst?.id&&vectorBrandMap[inst.id];
 const favicon=domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':'';
 const src=inst?.logo_data||(vector?
  'https://cdn.jsdelivr.net/gh/murattahtaci/turkish-bank-logos-svg@main/svg/'+vector+'.svg':favicon);
 return '<span class="inst-brand '+size+' '+(window.HTBrand?.tone(title)||'')+'" title="'+esc(title)+'">'+
   '<span class="inst-initial">'+esc(letters||'₺')+'</span>'+
   (src?'<img class="institution-logo-img" src="'+esc(src)+'" data-favicon="'+esc(favicon)+'" loading="lazy" referrerpolicy="no-referrer" alt="'+esc(title)+' logosu">':'')+
   '</span>';
}
document.addEventListener('error',event=>{
 const el=event.target;
 if(el instanceof HTMLImageElement&&el.classList.contains('institution-logo-img')){
   if(el.dataset.favicon&&el.src!==el.dataset.favicon&&el.dataset.retry!=='1'){
      el.dataset.retry='1';el.src=el.dataset.favicon;
   }else el.remove();
 }
},true);
function cardDueValue(c){return c.display_next_due_date||c.current_due_date||c.estimated_due_date||null;}
function renderMealBrandShortcuts(){
 const brands=mealBrandIds.map(instById).filter(Boolean);
 el('mealBrandShortcuts').innerHTML=brands.map(inst=>'<button class="meal-brand-item" data-meal-brand="'+esc(inst.id)+'" type="button" title="'+esc(inst.name)+'">'+
   institutionIcon(inst,inst.name,'meal-brand-logo')+'<span>'+esc(window.HTBrand?.label(inst.short_name||inst.name)||inst.short_name||inst.name)+'</span></button>').join('');
 if(currentRole==='viewer')document.querySelectorAll('[data-meal-brand]').forEach(b=>b.hidden=true);
}
function proCardList() {
 renderMealBrandShortcuts();
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
 const currencies=new Map();
 for(const c of cardsWithLimit){
  const currency=c.currency||'TRY';
  const totals=currencies.get(currency)||{limit:0,available:0,availableCount:0};
  totals.limit+=c.credit_limit_kurus;
  if(c.available_limit_kurus!==null&&c.available_limit_kurus!==undefined){
    totals.available+=c.available_limit_kurus;totals.availableCount++;
  }
  currencies.set(currency,totals);
 }
 const totalsText=[...currencies].map(([ccy,sum])=>ccy+': toplam limit '+currencyCard(sum.limit,ccy)+
   (sum.availableCount?' · girilen kullanılabilir '+currencyCard(sum.available,ccy):'')).join(' | ');
 el('cardsSummary').textContent=all.length+' kart · '+institutions.length+' kuruluş · '+cardsWithLimit.length+
  ' kart için limit bilgisi'+(totalsText?' · '+totalsText:'');
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
    ['Son hesap kesim',showDate(c.current_statement_date)||'—'],
    ['Son ödeme tarihi',showDate(c.current_due_date)||'—'],
    ['Bir sonraki kesim',showDate(nextStatement)||'—'],
    ['Bir sonraki ödeme',showDate(due)||'—'],
    ['Tahmini sonraki kesim',showDate(c.following_statement_date)||'—'],
    ['Tahmini sonraki ödeme',showDate(c.following_due_date)||'—'],
];
  const tag=st!=='active'?'<span class="badge warn">'+(st==='cancelled'?'İptal':'Pasif')+'</span>':
    days!==null&&days<=7?(days<0?'<span class="badge danger">Vade geçti</span>':'<span class="badge warn">'+days+' gün kaldı</span>'):'';
  const open=summary().filter(s=>s.card_id===c.id).reduce((n,x)=>n+x.left,0);
  return '<article class="card-item pro-card">'+
   '<div class="credit-visual pro-credit-visual" style="--card-accent:'+esc(c.color||'#0a2c38')+'">'+
    '<div class="card-institution">'+institutionIcon(inst,c.bank,'card-logo')+
      '<div><small>'+(inst?.type==='payment'?'ÖDEME / YEMEK KARTI / POS':'BANKA')+'</small><strong>'+esc(c.bank)+'</strong></div></div>'+
    '<div class="pro-card-brand"><div><strong>'+esc(c.nickname)+'</strong><small>'+esc(c.owner)+
     (c.is_additional?' · Ek kart':'')+' · '+(c.usage_type==='business'?'Ticari':'Bireysel')+'</small></div>'+
      '<strong>•••• '+esc(c.last4||'••••')+'</strong></div></div>'+
   '<div class="pro-card-highlights"><div><small>Toplam limit</small><strong>'+currencyCard(limit,cc)+'</strong></div>'+
     '<div><small>Kullanılabilir</small><strong>'+currencyCard(available,cc)+'</strong></div></div>'+
   (limit!==null&&limit>0&&available!==null?
     '<div class="card-limit-bar"><span style="width:'+Math.min(100,Math.round((used||0)*100/limit))+'%"></span></div>':'')+
   '<div class="pro-card-dates"><span><small>Sonraki kesim</small><strong>'+esc(showDate(nextStatement)||'—')+'</strong></span>'+
     '<span><small>Sonraki ödeme</small><strong>'+esc(showDate(due)||'—')+'</strong></span></div>'+
   '<div class="pro-card-balance">Açık ekstre borcu: <strong>'+currencyCard(open,cc)+'</strong>'+tag+'</div>'+
   '<details class="pro-card-extra"><summary>Tüm kart bilgileri</summary>'+
    '<dl>'+details.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+

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
function proInstitutionSelect(selected,originalBank=''){
 const candidates=(state.institutions||[]).filter(x=>x.type==='bank'&&(x.is_active||x.id===selected));
 const usedIds=new Set((state.cards||[]).map(x=>x.institution_id).filter(Boolean));
 const all=bankShowAll||!usedIds.size?candidates:candidates.filter(x=>usedIds.has(x.id)||x.id===selected);
 const selectedBank=all.find(x=>x.id===selected)||
  all.find(x=>[x.name,x.short_name].some(name=>name.toLocaleLowerCase('tr-TR')===String(originalBank).toLocaleLowerCase('tr-TR')));
 const id=selectedBank?.id||'';
 const legacy=originalBank&&!id;
 const html=all.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===id?' selected':'')+'>'+esc(x.name)+'</option>').join('');
 return '<div class="pro-field full"><label for="cp-instSearch">Banka seç</label>'+
  '<input id="cp-instSearch" type="search" placeholder="Banka ara... Akbank, Kuveyt Türk, QNB..." autocomplete="off">'+
  '<button class="mini-btn" type="button" id="cardBankShowAll">'+
   (bankShowAll?'Yalnızca kullandığım bankalar':'Tüm bankaları göster')+'</button>'+
  '<select id="cp-institution_id" name="institution_id" required>'+
   '<option value="">Banka seçiniz</option>'+
   (legacy?'<option value="__legacy__" selected>Önceki kayıt: '+esc(originalBank)+'</option>':'')+
   html+'</select>'+
  '<div class="card-logo-preview" id="cardLogoPreview"></div></div>';
}
function proCardModal(id=''){
 if(currentRole==='viewer'){notice('Salt okunur kullanıcı kayıt ekleyemez.',true);return;}
 const c=(state.cards||[]).find(x=>x.id===id);
 el('modalTitle').textContent=c?'Kredi kartını düzenle':'Yeni kredi kartı';
 const sections=[
  '<div class="card-form-heading">Banka ve kart</div>',
  proInstitutionSelect(c?.institution_id||'',c?.bank||''),
  proCardField('Kartın son 4 hanesi','last4','text',c?.last4||'','maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="1234"'),
  proSelect('Kart türü','card_type',[['credit','Kredi kartı'],['debit','Banka kartı'],['virtual','Sanal kart'],['pos','POS / ticari kart']],c?.card_type||'credit'),
  proSelect('Kullanım','usage_type',[['personal','Bireysel'],['business','Ticari']],c?.usage_type||'personal'),
  proSelect('Ek kart var mı?','is_additional',[['0','Hayır'],['1','Evet']],c?.is_additional?'1':'0'),
  proSelect('Para birimi','currency',[['TRY','Türk lirası'],['USD','Amerikan doları'],['EUR','Euro'],['GBP','Sterlin']],c?.currency||'TRY'),
  '<div class="card-form-heading">Limitler</div>',
  moneyInput('credit_limit','Toplam kart limiti',c?.credit_limit_kurus),
  moneyInput('available_limit','Kullanılabilir limit',c?.available_limit_kurus),
  '<p class="hint full">Kullanılan limit = toplam limit − kullanılabilir limit. Bankadan otomatik veri alınmaz.</p>',
  '<div class="card-form-heading">Hesap kesim ve ödeme</div>',
  proCardField('Hesap kesim günü (1-31)','statement_day','number',c?.statement_day??'','min="1" max="31" step="1"'),
  proCardField('Ödeme günü (1-31)','due_day','number',c?.due_day??'','min="1" max="31" step="1"'),
  cardDateField('current_statement_date','Hesap kesim tarihi',c?.current_statement_date),
  cardDateField('current_due_date','Son ödeme tarihi',c?.current_due_date),
  cardDateField('next_statement_date','Bir sonraki hesap kesim tarihi',c?.next_statement_date),
  cardDateField('next_due_date','Bir sonraki ödeme tarihi',c?.next_due_date),
  '<div id="cardEstimatePreview" class="card-estimate-preview full">Hesap kesim ve ödeme gününü girersen tahmini tarihler görünür.</div>',
  '<p class="hint full">Tarihleri takvimden seçebilirsin. Tarihler görüntülenirken GG.AA.YYYY biçiminde gösterilir.</p>'
 ];
 el('modalContents').innerHTML='<form id="proCardForm" class="modal-form card-form" data-card-id="'+esc(id)+'">'+
  sections.join('')+'<div class="form-actions full"><button class="btn subtle" type="button" id="cancelProCard">Vazgeç</button>'+
  '<button class="btn primary" type="submit">Kaydet</button></div></form>';
 el('cancelProCard').onclick=()=>el('modal').close();
 const form=el('proCardForm'),selector=form.elements.institution_id,logo=el('cardLogoPreview');
 const options=(state.institutions||[]).filter(x=>x.type==='bank'&&(x.is_active||x.id===c?.institution_id));
 const usedIds=new Set((state.cards||[]).map(x=>x.institution_id).filter(Boolean));
 const bankOptions=(query,current)=>'<option value="">Banka seçiniz</option>'+
   (c?.bank&&!options.some(x=>x.id===c.institution_id||
      x.name===c.bank||x.short_name===c.bank)?
     '<option value="__legacy__">Önceki kayıt: '+esc(c.bank)+'</option>':'')+
   options.filter(x=>(bankShowAll||!usedIds.size||query||usedIds.has(x.id)||x.id===current)&&(x.id===current||
     [x.name,x.short_name,x.search_keywords].join(' ').toLocaleLowerCase('tr-TR').includes(query)))
    .map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 const updateBrand=()=>{
  const selected=instById(selector.value);
  logo.innerHTML=selected?institutionIcon(selected,selected.name,'card-logo'):
    selector.value==='__legacy__'?esc(c?.bank||''):''; 
 };
 selector.addEventListener('change',updateBrand);
 form.querySelector('#cp-instSearch').addEventListener('input',event=>{
  const query=event.target.value.trim().toLocaleLowerCase('tr-TR'),current=selector.value;
  selector.innerHTML=bankOptions(query,current);
  if([...selector.options].some(opt=>opt.value===current))selector.value=current;
  else if(selector.options.length===2&&selector.options[1].value!=='__legacy__')selector.value=selector.options[1].value;
  updateBrand();
 });
 form.querySelector('#cardBankShowAll').addEventListener('click',()=>{
  bankShowAll=!bankShowAll;
  form.querySelector('#cardBankShowAll').textContent=
   bankShowAll?'Yalnızca kullandığım bankalar':'Tüm bankaları göster';
  form.querySelector('#cp-instSearch').dispatchEvent(new Event('input'));
 });
  const updatePreview=()=>{
  const day=Number(form.elements.statement_day.value),due=Number(form.elements.due_day.value);
  if(!day||!due||day>31||due>31){el('cardEstimatePreview').textContent='Günleri girerek bir sonraki tarihleri hesaplayabilirsin.';return;}
  const estimate=estimateLocalDates(day,due,trDate());
  el('cardEstimatePreview').textContent='Tahmini sonraki kesim: '+showDate(estimate[0])+
   ' · Tahmini ödeme: '+showDate(estimate[1])+' · Takip eden kesim: '+showDate(estimate[2])+
   ' · Takip eden ödeme: '+showDate(estimate[3])+' (resmî banka tarihi değildir)';
 };
 for(const key of ['statement_day','due_day'])form.elements[key].addEventListener('input',updatePreview);
 updatePreview();updateBrand();
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form));
   const bank=instById(d.institution_id);
   if(!bank&&!(d.institution_id==='__legacy__'&&c?.bank))
    throw new Error('Önce banka listesinden banka seçin.');
   const bankName=bank?(bank.short_name||bank.name):c.bank;
   const limit=v=>v===''?null:amountValue(v);
   const payload={
    owner:c?.owner||'Kart Sahibi',bank:bankName,
    nickname:c?.nickname||(bankName+' '+(d.last4||'Kart')),
    last4:d.last4||null,
    institution_id:bank?.id||c?.institution_id||null,
    card_type:d.card_type,usage_type:d.usage_type,
    is_additional:d.is_additional==='1',
    currency:d.currency,
    credit_limit_kurus:limit(d.credit_limit),
    available_limit_kurus:limit(d.available_limit),
    statement_day:d.statement_day===''?null:Number(d.statement_day),
    due_day:d.due_day===''?null:Number(d.due_day),
    current_statement_date:d.current_statement_date||null,
    current_due_date:d.current_due_date||null,
    next_statement_date:d.next_statement_date||null,
    next_due_date:d.next_due_date||null,
    // Older hidden data is retained when the user edits a card; removing a field
    // from this form must never erase what was saved previously.
    cash_advance_limit_kurus:c?.cash_advance_limit_kurus??null,
    min_payment_percent:c?.min_payment_percent??null,
    status:c?.status||'active',reminder_enabled:c?.reminder_enabled!==0,
    linked_iban:c?.linked_iban||'',interest_note:c?.interest_note||'',
    commission_note:c?.commission_note||'',note:c?.note||'',color:c?.color||'#0a2c38'
   };
   await api('cards'+(id?'/'+id:''),id?'PATCH':'POST',payload);
   el('modal').close();await load();notice(id?'Kart güncellendi.':'Kredi kartı eklendi.');
  }catch(error){notice(error.message,true);}finally{button.disabled=false;}
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
 const matched=all.filter(x=>(!institutionOnlyBanks||x.type==='bank')&&
  (!institutionOnlyHidden||!x.is_active)&&
  [x.name,x.short_name,x.search_keywords].join(' ').toLocaleLowerCase('tr-TR')
  .includes(institutionSearch.toLocaleLowerCase('tr-TR')));
 const shown=matched.slice(0,120);
 const form='<form id="institutionEditor" class="institution-editor">'+
  '<h3>'+(edit?'Kuruluş düzenle':institutionDefaultType==='payment'?'Yeni ödeme kuruluşu ekle':'Yeni banka ekle')+'</h3>'+
  proCardField('Kurum adı','name','text',edit?(window.HTBrand?.label(edit.name)||edit.name):'','required maxlength="120"')+
  proCardField('Kısa ad','short_name','text',edit?(window.HTBrand?.label(edit.short_name)||edit.short_name):'','maxlength="90"')+
  proSelect('Tür','type',[['bank','Banka'],['payment','Ödeme / e-para']],edit?.type||institutionDefaultType)+
  proCardField('Resmî web alan adı','domain','text',edit?.domain||'','placeholder="ornek.com.tr" maxlength="160"')+
  proCardField('Arama kelimeleri','search_keywords','text',edit?.search_keywords||'','maxlength="220"')+
  proSelect('Durum','is_active',[['1','Aktif'],['0','Pasif']],edit?.is_active===0?'0':'1')+
  '<div class="pro-field full"><label for="institutionLogoFile">Logo (PNG / JPG / WebP, isteğe bağlı)</label>'+
    '<input id="institutionLogoFile" type="file" accept="image/png,image/jpeg,image/webp">'+
    '<p class="hint">Küçük logo güvenli resim biçiminde saklanır; SVG kabul edilmez.</p></div>'+
  '<div class="full">'+(edit?institutionIcon(edit,edit.name):'')+'</div>'+
  '<div class="form-actions full"><button class="btn subtle" type="button" id="institutionClear">Yeni</button>'+
   '<button class="btn primary" type="submit">'+(edit?'Güncelle':'Ekle')+'</button></div></form>';
 const list='<div class="institution-list"><h3>Bankalar ve kuruluşlar ('+matched.length+' sonuç)</h3>'+
  '<div class="v11-catalog-tools">'+
   '<label class="v11-filter-check"><input id="v11BanksOnly" type="checkbox"'+
    (institutionOnlyBanks?' checked':'')+'> Yalnızca bankalar</label>'+
   '<label class="v11-filter-check"><input id="v11HiddenOnly" type="checkbox"'+
    (institutionOnlyHidden?' checked':'')+'> Yalnızca gizlenenler</label></div>'+
  '<div class="v11-bulk-bar"><button type="button" class="mini-btn" data-v11-select="shown">Görünenleri işaretle</button>'+
   '<button type="button" class="mini-btn" data-v11-select="none">Seçimi temizle</button>'+
   '<button type="button" class="mini-btn" data-v11-bulk="hide">Seçilenleri gizle</button>'+
   '<button type="button" class="mini-btn" data-v11-bulk="show">Seçilenleri göster</button>'+
   '<button type="button" class="mini-btn delete" data-v11-bulk="delete">Seçilenleri sil</button>'+
   '<span class="v11-selected-count">'+institutionSelection.size+' seçili</span></div>'+
  '<input id="institutionSearch" type="search" value="'+esc(institutionSearch)+'" placeholder="Kuruluş ara">'+
  '<div id="institutionListItems">'+shown.map(x=>'<div class="institution-row">'+
   '<label class="v11-select-label"><input type="checkbox" data-v11-select-id="'+esc(x.id)+'"'+
    (institutionSelection.has(x.id)?' checked':'')+' aria-label="'+esc(x.name)+' seç"></label>'+
   institutionIcon(x,x.name)+
   '<span class="institution-row-name"><strong>'+esc(window.HTBrand?.label(x.name)||x.name)+'</strong><small>'+
      (x.type==='bank'?'Banka':'Ödeme/e-para')+(x.is_active?'':' · Pasif')+'</small></span>'+
   '<button class="mini-btn" type="button" data-inst-edit="'+esc(x.id)+'">Düzenle</button>'+
   '<button class="mini-btn" type="button" data-inst-toggle="'+esc(x.id)+'">'+
    (x.is_active?'Gizle':'Göster')+'</button>'+
   '<button class="mini-btn delete" type="button" data-inst-remove="'+esc(x.id)+'">Sil</button>'+
   '</div>').join('')+'</div></div>';
 el('institutionManagement').innerHTML='<div class="institution-manager-layout">'+form+list+'</div>'+
  '<section class="institution-import"><h3>Toplu kurum içe aktar</h3><p class="muted">CSV başlıkları: name,type,domain,short_name,search_keywords. Türler bank/payment.</p>'+
  '<input id="institutionCsvFile" type="file" accept=".csv,text/csv"><button id="institutionCsvButton" type="button" class="btn secondary">CSV dosyasını içe aktar</button></section>';
 const editor=el('institutionEditor');
 el('institutionClear').onclick=()=>{institutionEditingId='';institutionManagerForm();};
 el('v11HiddenOnly').onchange=e=>{institutionOnlyHidden=e.target.checked;institutionManagerForm();};
 el('v11BanksOnly').onchange=e=>{institutionOnlyBanks=e.target.checked;institutionManagerForm();};
 el('institutionSearch').oninput=e=>{
  const search=e.target,position=search.selectionStart;
  institutionSearch=search.value;institutionManagerForm();
  const next=el('institutionSearch');next.focus();next.setSelectionRange(position,position);
 };
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
   institutionEditingId='';institutionManagerForm();proCardList();notice('Banka/kuruluş ve logosu kaydedildi.');
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
 const meal=e.target.closest('[data-meal-brand]');
 if(meal){
  const names={setcard:'Setcard',multinet:'Multinet',edenred:'Edenred',
   metropolcard:'Metropolcard',tokenflex:'Tokenflex',pluxee:'Pluxee'};
  tab('meal');
  const selector=el('v9MealInline')?.querySelector('select[name="name"]');
  if(selector&&names[meal.dataset.mealBrand]){
   selector.value=names[meal.dataset.mealBrand];
   selector.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return;
 }
 const newStatement=e.target.closest('[data-card-statement]');
 if(newStatement){modal('statement',newStatement.dataset.cardStatement);return;}
 const checked=e.target.closest('[data-v11-select-id]');
 if(checked){
  if(checked.checked)institutionSelection.add(checked.dataset.v11SelectId);
  else institutionSelection.delete(checked.dataset.v11SelectId);
  const count=document.querySelector('.v11-selected-count');if(count)count.textContent=institutionSelection.size+' seçili';
  return;
 }
 const select=e.target.closest('[data-v11-select]');
 if(select){
  const shown=(state.institutions||[]).filter(x=>
   (!institutionOnlyBanks||x.type==='bank')&&(!institutionOnlyHidden||!x.is_active)&&
   [x.name,x.short_name,x.search_keywords].join(' ').toLocaleLowerCase('tr-TR')
    .includes(institutionSearch.toLocaleLowerCase('tr-TR'))).slice(0,120);
  if(select.dataset.v11Select==='none')institutionSelection.clear();
  else shown.forEach(x=>institutionSelection.add(x.id));
  institutionManagerForm();return;
 }
 const bulk=e.target.closest('[data-v11-bulk]');
 if(bulk){
  if(currentRole!=='admin'){notice('Yalnızca yönetici toplu işlem yapabilir.',true);return;}
  const ids=[...institutionSelection],action=bulk.dataset.v11Bulk;
  if(!ids.length){notice('Önce bankaların yanındaki kutuları işaretle.',true);return;}
  const label=action==='delete'?'kalıcı olarak SİLMEK':action==='hide'?'GİZLEMEK':'GÖSTERMEK';
  if(!confirm(ids.length+' kurumu '+label+' istiyor musun? '+
   (action==='delete'?'Silme geri alınamaz. Kayıtlı kart veya cari hesaplara bağlı kurumlar silinmez.':'')))return;
  bulk.disabled=true;
  api('institutions/bulk','POST',{action,ids}).then(async response=>{
   state.institutions=(await api('institutions')).institutions;
   institutionSelection.clear();institutionManagerForm();proCardList();
   notice(response.updated+' kurum '+(action==='delete'?'silindi':action==='hide'?'gizlendi':'gösterildi')+'.');
  }).catch(error=>notice(error.message,true)).finally(()=>{bulk.disabled=false;});
  return;
 }
  const edit=e.target.closest('[data-inst-edit]');
 if(edit){institutionEditingId=edit.dataset.instEdit;institutionManagerForm();return;}
 const toggle=e.target.closest('[data-inst-toggle]');
 if(toggle){
  if(currentRole!=='admin')return;
  const inst=instById(toggle.dataset.instToggle);
  if(!inst)return;
  if(!confirm(inst.is_active?
   inst.name+' listeden gizlensin mi? Mevcut kart kayıtları korunur.':
   inst.name+' yeniden listede gösterilsin mi?'))return;
  const payload={name:inst.name,short_name:inst.short_name,type:inst.type,domain:inst.domain,
   search_keywords:inst.search_keywords,is_active:!inst.is_active,logo_data:inst.logo_data||''};
  api('institutions/'+inst.id,'PATCH',payload).then(async()=>{
   state.institutions=(await api('institutions')).institutions;
   institutionManagerForm();proCardList();notice(inst.is_active?'Kurum gizlendi.':'Kurum gösterildi.');
  }).catch(err=>notice(err.message,true));
  return;
 }
 const del=e.target.closest('[data-inst-remove]');
 if(del){
  if(!confirm('Bu bankayı/kuruluşu KALICI olarak silmek istiyor musun? Mevcut kartlara veya cari hesaplara bağlıysa işlem engellenir.'))return;
  api('institutions/'+del.dataset.instRemove,'DELETE').then(async()=>{
   state.institutions=(await api('institutions')).institutions;
   institutionSelection.delete(del.dataset.instRemove);
   institutionEditingId='';institutionManagerForm();proCardList();notice('Kurum silindi.');
  }).catch(e=>notice(e.message,true));
 }
});
for(const id of ['cardSearch','cardFilterType','cardFilterBank','cardDueWindow','cardFilterStatus','cardSort'])
 el(id).addEventListener('input',proCardList);
function openInstitutionManager(options={}){
 if(currentRole!=='admin'){notice('Yalnızca yönetici kurumu düzenleyebilir.',true);return;}
 institutionEditingId=options.editId||'';
 institutionSearch='';institutionOnlyHidden=false;
 institutionDefaultType=options.type==='payment'?'payment':'bank';
 institutionOnlyBanks=institutionDefaultType==='bank';
 institutionSelection.clear();institutionManagerForm();
 if(options.name&&!institutionEditingId){
  const form=el('institutionEditor');
  form.elements.name.value=options.name;
  form.elements.short_name.value=options.name;
 }
 el('institutionDialog').showModal();
}
window.openInstitutionManager=openInstitutionManager;
el('manageInstitutions').addEventListener('click',()=>openInstitutionManager());
el('closeInstitutionDialog').onclick=()=>el('institutionDialog').close();
window.renderProCards=proCardList;
window.openProCardForm=proCardModal;
