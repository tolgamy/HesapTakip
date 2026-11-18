'use strict';
// V18: a single, predictable navigation and create-action layer over existing
// D1-backed forms. This file deliberately does not write financial data.
(function(){
 const sections={
  overview:['overview'],
  cardbank:['banking','cards','meal'],
  accounts:['collections','platforms','people'],
  firms:['payables','directory','representatives'],
  settings:['settings']
 };
 const primary={overview:'overview',cardbank:'banking',accounts:'collections',firms:'payables',settings:'settings'};
 const labels={
  banking:'Bankalarım',cards:'Kartlarım',meal:'Yemek Kartları',
  collections:'Platform ve şahıs alacaklarım',
  platforms:'Platform Alacaklarım',people:'Şahıs Alacaklarım',
  payables:'Firma Borçlarım',directory:'Firma Temsilcileri',representatives:'Temsilci İletişimi'
 };
 const headings={overview:'Genel Bakış',cardbank:'Finans',accounts:'Hesaplar',firms:'Firmalar',settings:'Ayarlar'};
 const groupFor=name=>Object.keys(sections).find(section=>sections[section].includes(name))||'overview';
 const hubMarkup=(section)=>'<nav class="v18-subnav" aria-label="'+
   headings[section]+' alt menüsü">'+
   sections[section].filter(name=>name!=='collections'&&name!=='representatives').map(name=>
     '<button type="button" data-v18-sub="'+name+'" aria-pressed="false">'+labels[name]+'</button>').join('')+'</nav>';
 for(const [name,section] of [
  ['banking','cardbank'],['cards','cardbank'],['meal','cardbank'],
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
  el('pageTitle').textContent=headings[section];
  if(labels[name])el('pageSubtitle').textContent=labels[name];
  if(name==='overview')el('pageSubtitle').textContent='Finansal durumum ve hızlı erişim';
  if(section!=='settings'&&currentRole!=='viewer'){
   const add=el('addAction');
   add.textContent='+ Yeni İşlem';
   add.hidden=false;
  }
 }
 window.tab=function(name){
  oldTab(name);
  updateNavigation(name);
  if(name==='representatives')window.HTDirectory?.renderQuickRepresentatives?.();
 };
 const openSection=section=>{
  if(!primary[section])return;
  if(section==='firms'&&window.HTIdentity?.role==='user'){
   const target=['payables','directory'].find(p=>window.HTIdentity.permissions?.includes(p));
   if(!target)return;
   window.tab(target);
  }else window.tab(primary[section]);
  if(section==='accounts'){
   const preferred=window.HTV26?.preferredAccountTab?.()||'vault';
   const tabButton=document.querySelector('[data-v8-accounts="'+preferred+'"]');
   if(tabButton)tabButton.click();
  }
  window.scrollTo({top:0,behavior:'auto'});
 };
 document.addEventListener('click',event=>{
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
