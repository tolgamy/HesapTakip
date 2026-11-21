'use strict';
// V18: a single, predictable navigation and create-action layer over existing
// D1-backed forms. This file deliberately does not write financial data.
(function(){
 const sections={
  overview:['overview'],
  cardbank:['banking','cards'],
  accounts:['collections','platforms','meal','people'],
  firms:['payables','directory'],
  settings:['settings','vault','useraccounts','bills']
 };
 const primary={overview:'overview',cardbank:'banking',accounts:'collections',firms:'payables',settings:'settings'};
 const labels={
  banking:'Bankalarım',cards:'Kartlarım',meal:'Yemek Kartları',
  collections:'Platform ve şahıs alacaklarım',
  platforms:'Platform Alacaklarım',people:'Şahıs Alacaklarım',
  payables:'Firma Borçlarım',directory:'Firma Temsilcileri ve İletişimi',firmactivity:'Firma Hareketleri',bills:'Faturalar',representatives:'Temsilci İletişimi',useraccounts:'Kullanıcı Hesapları'
 };
 const headings={overview:'Genel Bakış',cardbank:'Finans',accounts:'Hesaplar',firms:'Firmalar',settings:'Ayarlar'};
 const groupFor=name=>Object.keys(sections).find(section=>sections[section].includes(name))||'overview';
 const financeIcon=name=>name==='banking'?
  '<svg class="v64-finance-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9 12 3l10 6H2zM4 10v9m5-9v9m6-9v9m5-9v9M2 21h20"/></svg>':
  name==='cards'?
  '<svg class="v64-finance-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></svg>':'';
 const firmIcon=name=>name==='payables'?
  '<svg class="v68-firm-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M3 11h18M7 4h10M16 16h2"/></svg>':
  '<svg class="v68-firm-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 6h5v6h-3l-2 2v-2"/></svg>';
 const hubMarkup=(section)=>'<nav class="v18-subnav" aria-label="'+
   headings[section]+' alt menüsü">'+
   sections[section].filter(name=>name!=='collections'&&name!=='meal').map(name=>
     '<button type="button" data-v18-sub="'+name+'" aria-pressed="false">'+(section==='cardbank'?financeIcon(name):section==='firms'?firmIcon(name):'')+'<span>'+labels[name]+'</span>'+'</button>').join('')+'</nav>';
 for(const [name,section] of [
  ['banking','cardbank'],['cards','cardbank'],
  ['platforms','accounts'],['people','accounts'],
  ['payables','firms'],['directory','firms']
 ]){
  const view=el(name+'View');
  if(view)view.insertAdjacentHTML('afterbegin',hubMarkup(section));
 }
 const oldTab=window.tab;
 if(typeof oldTab!=='function')throw Error('HesapTakip navigation not loaded');
 function updateNavigation(name){
  const section=groupFor(name);
  document.querySelectorAll('[data-v18-section]').forEach(button=>{
   const active=button.dataset.v18Section===section;
   button.classList.toggle('active',active);
   if(active)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-v18-sub]').forEach(button=>{
   const active=button.dataset.v18Sub===name;
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
  });
  el('pageTitle').textContent=({vault:'Güvenli Giriş Bilgilerim',useraccounts:'Kullanıcı Hesapları',bills:'Faturalar'}[name]||headings[section]);
  if(labels[name])el('pageSubtitle').textContent=labels[name];
  if(name==='vault')el('pageSubtitle').textContent='Banka ve platform giriş bilgileri';
  if(name==='useraccounts')el('pageSubtitle').textContent='Kullanıcı onayları ve ekran yetkileri';
  if(name==='overview')el('pageSubtitle').textContent='Finansal durumum ve hızlı erişim';
  if(section!=='settings'&&currentRole!=='viewer'){
   const add=el('addAction');
   add.textContent='+ Yeni İşlem';
   add.hidden=false;
  }
 }
 window.tab=function(name){
  if(name==='useraccounts'&&window.HTIdentity?.role!=='admin')return;
  if(name==='representatives')name='directory';
  if(name==='meal'){
   window.HTV61?.setFilter?.('meal');
   name='platforms';
  }
  oldTab(name);
  updateNavigation(name);
  if(name==='vault')window.HTV26?.renderVault?.();
  if(name==='directory'){const contact=el('representativesView');if(contact)contact.hidden=false;window.HTDirectory?.renderQuickRepresentatives?.();}
  if(name==='collections'){
   const preferred=window.HTV26?.preferredAccountTab?.()||'platforms';
   document.querySelector('[data-v8-accounts="'+preferred+'"]')?.click();
  }
 };
 const openSection=section=>{
  if(!primary[section])return;
  if(section==='firms'&&window.HTIdentity?.role==='user'){
   const target=['payables','directory'].find(p=>window.HTIdentity.permissions?.includes(p));
   if(!target)return;
   window.tab(target);
  }else window.tab(primary[section]);
  window.scrollTo({top:0,behavior:'auto'});
 };
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-v68-open-users]')){if(window.HTIdentity?.role==='admin'){window.tab('useraccounts');window.scrollTo({top:0,behavior:'auto'});}return;}
  if(event.target.closest('[data-v68-open-bills]')){if(window.HTIdentity?.role==='admin'||window.HTV26?.can?.('payables')){window.tab('bills');window.scrollTo({top:0,behavior:'auto'});}return;}
  if(event.target.closest('[data-v68-settings-back]')){window.tab('settings');window.scrollTo({top:0,behavior:'auto'});return;}
  if(event.target.closest('[data-v67-vault-open]')){
   if(window.HTV26?.can?.('vault')){window.tab('vault');window.scrollTo({top:0,behavior:'auto'});}return;
  }
  if(event.target.closest('[data-v67-settings-back]')){window.tab('settings');window.scrollTo({top:0,behavior:'auto'});return;}
  const nav=event.target.closest('[data-v18-section]');
  if(nav){openSection(nav.dataset.v18Section);return;}
  const sub=event.target.closest('[data-v18-sub]');
  if(sub){window.tab(sub.dataset.v18Sub);window.scrollTo({top:0,behavior:'auto'});return;}
  const shortcut=event.target.closest('[data-v18-link]');
  if(shortcut){window.tab(shortcut.dataset.v18Link);window.scrollTo({top:0,behavior:'auto'});return;}
  const quick=event.target.closest('[data-v18-quick]');
  if(quick){handleQuick(quick.dataset.v18Quick);}
 });
 function eligible(group,unpaid){
  return (state.firms||[]).filter(f=>
   (group==='payable'?f.category==='payable':
    f.category==='receivable'&&(f.receivable_group||'general')===group) &&
   (!unpaid||firmBalance(f.id).remaining>0));
 }
 function selectFirm(group,kind){
  const payment=kind==='payment';
  const firms=eligible(group,payment);
  const typeName={payable:'Firma',platform:'Platform',meal:'Yemek kartı',veresiye:'Veresiye'}[group];
  if(payment&&!firms.length){
   notice(typeName+' için tahsil edilecek veya ödenecek açık bakiye yok. Önce satış/borç gir.',true);
   return;
  }
  if(!payment&&!firms.length){
   window.tab(group==='meal'?'meal':group==='platform'||group==='veresiye'?'platforms':'payables');
   window.openFirmForm('new',group==='payable'?'payable':'receivable',group);
   return;
  }
  el('modalTitle').textContent=typeName+' '+(payment?'Ödeme / Tahsilat':'Satış Kaydı');
  const options=(!payment?'<option value="new">+ Yeni '+typeName.toLocaleLowerCase('tr-TR')+' hesabı aç</option>':'')+
   firms.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+' · Kalan: '+esc(money(firmBalance(f.id).remaining))+'</option>').join('');
  el('modalContents').innerHTML=
   '<form id="v18FirmPick" class="modal-form">'+
   '<div><label for="v18FirmId">'+typeName+' seç</label>'+
   '<select name="firm" id="v18FirmId" required>'+options+'</select></div>'+
   '<p class="hint">'+(payment?
     'Gerçek ödeme kaydı açılacak. Banka hareketi ancak seçilen hesaba işlenir.':
     'Mevcut hesaba yeni satış/borç girebilir veya yeni hesap açabilirsin.')+'</p>'+
   '<div class="form-actions"><button type="button" class="btn subtle" id="v18PickCancel">Vazgeç</button>'+
   '<button type="submit" class="btn primary">Devam et</button></div></form>';
  el('modal').showModal();
  el('v18PickCancel').addEventListener('click',()=>el('modal').close());
  el('v18FirmPick').addEventListener('submit',event=>{
   event.preventDefault();
   const id=el('v18FirmId').value;
   el('modal').close();
   window.tab(group==='meal'?'meal':group==='platform'||group==='veresiye'?'platforms':'payables');
   if(id==='new')window.openFirmForm('new',group==='payable'?'payable':'receivable',group);
   else if(payment)window.openSettlementForm(id,group==='platform'||group==='meal');
   else window.openFirmForm('charge',id);
  });
 }
 function handleQuick(action){
  if(currentRole==='viewer'){notice('Bu işlem için düzenleme yetkisi gerekli.',true);return;}
  if(el('quickDialog').open)el('quickDialog').close();
  const billCategories={
   'bill-electricity':'electricity','bill-gas':'gas','bill-water':'water',
   'bill-phone':'phone','bill-internet':'internet','bill-other':'other'
  };
  if(Object.prototype.hasOwnProperty.call(billCategories,action)){
   window.tab('bills');
   if(typeof window.HTBillsV50?.openCreate==='function')
    window.HTBillsV50.openCreate(billCategories[action]);
   else notice('Fatura formu açılamadı. Sayfayı yenileyip tekrar dene.',true);
   return;
  }
  switch(action){
   case 'firm-create':
    window.tab('directory');
    window.HTDirectory?.companyForm?.();
    break;
   case 'firm-charge':
    window.tab('payables');window.openSupplierPurchaseForm();break;
   case 'firm-payment':selectFirm('payable','payment');break;
   case 'platform-sale':selectFirm('platform','sale');break;
   case 'platform-payment':selectFirm('platform','payment');break;
   case 'card-create':window.tab('cards');modal('card');break;
   case 'card-payment':window.tab('cards');modal('payment');break;
   case 'meal-sale':
    window.tab('meal');
    if(el('v61MealManage'))el('v61MealManage').open=true;
    el('v9MealInline')?.querySelector('select[name="name"]')?.focus();
    break;
   case 'meal-payment':selectFirm('meal','payment');break;
   case 'bank-create':
    window.tab('banking');window.openSuiteForm('account');
    const field=el('suite-type');if(field)field.value='bank';
    break;
   case 'pos-account-create':
    window.tab('banking');window.openSuiteForm('account');
    if(el('suite-is-pos')){
      el('suite-is-pos').value='1';
      el('suite-is-pos').dispatchEvent(new Event('change',{bubbles:true}));
    }
    break;
   case 'pos-sale':
    window.tab('banking');window.openFirmForm('new','receivable','pos');break;
   case 'plan-create':
    window.tab('banking');window.HTV22?.planEditor?.();break;
   case 'person-create':window.tab('people');window.openFirmForm('new','receivable','person');break;
   case 'veresiye-create':selectFirm('veresiye','sale');window.HTV19?.setPlatformPanel('veresiye');break;
   case 'veresiye-payment':selectFirm('veresiye','payment');window.HTV19?.setPlatformPanel('veresiye');break;
  }
 }
 window.HTV18={groupFor,openSection,handleQuick};
 updateNavigation('overview');
})();
