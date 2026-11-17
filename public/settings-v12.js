'use strict';
// Unified safe Settings: a name is never saved before the user chooses a destination
// and confirms the category-specific form. All saved data uses existing D1 APIs.
(function(){
 const destinations=[
  ['bank','▤','Banka','Banka listesine ve logolarına ekle'],
  ['payment','▣','Ödeme kuruluşu / POS','PayTR, iyzico benzeri kuruluş'],
  ['card','▧','Kredi kartı','Bankayı seçip yeni kredi kartı ekle'],
  ['bankAccount','▤','Banka hesabı','Paranın bulunduğu banka hesabı'],
  ['cash','₺','Nakit kasa','Kasadaki nakit parayı takip et'],
  ['meal','♜','Yemek kartı alacağı','Setcard, Multinet gibi kurum'],
  ['platform','▱','Platform alacağı','Getir, Trendyol, USMAR gibi platform'],
  ['pos','▣','POS günlük cirosu','Günlük POS satış ve tahsilat'],
  ['receivable','↙','Şahıstan alacak','Bir kişiden alacağın para'],
  ['payable','↗','Firmaya borç','Tedarikçi veya firmaya borç']
 ];
 const mealPresets=[
  ['Setcard','setcard.com.tr'],['Multinet','multinet.com.tr'],
  ['Edenred','edenred.com.tr'],['Metropolcard','metropolcard.com'],
  ['Tokenflex','tokenflex.com.tr'],['Pluxee','pluxee.com.tr']
 ];
 let chosen='';
 const e=x=>esc(String(x??''));
 const roleCanEdit=()=>currentRole==='admin';
 const normalized=s=>String(s||'').toLocaleLowerCase('tr-TR').trim();
 function logo(name,domain='',custom=''){
  const pretty=window.HTBrand?.label(name)||name;
  const mark=window.HTBrand?.mark(pretty)||'<span>'+e(pretty.slice(0,2))+'</span>';
  const src=custom||(domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':'');
  return '<span class="ht-settings-logo">'+mark+
   (src?'<img class="ht-settings-logo-image" loading="lazy" alt="" src="'+e(src)+'">':'')+'</span>';
 }
 function fillCategories(){
  el('htSettingsCategories').innerHTML=destinations.map(([id,icon,title,desc])=>
   '<button type="button" class="ht-settings-category'+(chosen===id?' active':'')+
   '" data-ht-settings-choose="'+id+'" aria-pressed="'+(chosen===id)+'">'+
   '<span class="ht-settings-category-icon">'+icon+'</span><strong>'+e(title)+'</strong>'+
   '<small>'+e(desc)+'</small></button>').join('');
  const target=destinations.find(x=>x[0]===chosen);
  el('htSettingsChoiceNote').textContent=target?
   'Seçim: '+target[2]+' · Devam ettiğinde ilgili kayıt formu açılır.':'';
  el('htSettingsContinue').disabled=!chosen||!roleCanEdit();
 }
 function updatePrompt(){
  const name=el('htSettingsName').value.trim();
  el('htSettingsDestination').hidden=!name;
  if(!name)chosen='';
  fillCategories();
 }
 function renderLinks(){
  const links=[
   ['banks','▤','Bankalar ve logolar','Listeyi düzenle, gizle veya toplu sil'],
   ['payments','▣','Ödeme kuruluşları','Banka/POS kuruluşlarını ve logolarını yönet'],
   ['meal','♜','Yemek kartları','Altı marka ve kayıtlı alacakların'],
   ['platforms','▱','Platformlar','Platformları düzenle, logosunu yükle'],
   ['payables','↗','Firmalar','Firmalara olan borç hesapları'],
   ['people','♙','Şahıslar','Kişilerden alacakların'],
   ['pos','▣','POS hesapları','Satış ve tahsilat kayıtların']
  ];
  el('htSettingsLinks').innerHTML=links.map(([id,icon,title,desc])=>
   '<button type="button" class="ht-settings-link" data-ht-settings-manage="'+id+'">'+
   '<span class="ht-settings-link-icon">'+icon+'</span>'+
   '<span class="ht-settings-link-info"><strong>'+e(title)+'</strong>'+
   '<small>'+e(desc)+'</small></span><span class="ht-settings-chevron">›</span></button>').join('');
 }
 function renderMeal(){
  const firms=(state.firms||[]).filter(f=>f.category==='receivable'&&
   f.receivable_group==='meal');
  el('htSettingsMealLogos').innerHTML=mealPresets.map(([name,domain])=>{
   const existing=firms.find(f=>normalized(window.HTBrand?.label(f.name)||f.name)===normalized(name));
   const amount=existing?firmBalance(existing.id).remaining:0;
   return '<button type="button" data-ht-settings-brand="'+e(name)+
    '" class="ht-settings-meal-card">'+logo(name,domain,existing?.logo_data||'')+
    '<strong>'+e(name)+'</strong><small>'+(existing?money(amount)+' açık alacak':'Kayıt aç')+
    '</small></button>';
  }).join('');
 }
 function renderRegistered(){
  const firms=(state.firms||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  if(!firms.length){
   el('htSettingsRegistered').innerHTML='<p class="muted">Henüz kayıtlı firma veya kuruluş yok.</p>';
   return;
  }
  const names={meal:'Yemek kartı',platform:'Platform',pos:'POS',
   person:'Şahıs',general:'Diğer alacak'};
  const platDomains=new Map([
   ['getir','getir.com'],['getir çarşı','getir.com'],['trendyol','trendyol.com'],
   ['yemeksepeti','yemeksepeti.com'],['yemeksepeti mahalle','yemeksepeti.com'],
   ['uber eats','ubereats.com'],['usmar.com','usmarmarket.com'],
   ['usmar.com.tr','usmarmarket.com.tr']
  ]);
  el('htSettingsRegistered').innerHTML=firms.map(f=>{
   const group=f.category==='payable'?'Firmaya borç':names[f.receivable_group||'general']||'Alacak';
   const display=window.HTBrand?.label(f.name)||f.name;
   const domain=(mealPresets.find(([n])=>normalized(n)===normalized(display))||[])[1]||
       platDomains.get(normalized(f.name))||'';
   return '<div class="ht-settings-record">'+logo(display,domain,f.logo_data||'')+
     '<span class="ht-settings-record-name"><strong>'+e(display)+'</strong><small>'+
      e(group)+' · '+money(firmBalance(f.id).remaining)+'</small></span>'+
     '<button type="button" class="mini-btn" data-ht-settings-edit="'+e(f.id)+
     '"'+(!roleCanEdit()?' disabled':'')+'>Düzenle / Logo</button></div>';
  }).join('');
 }
 function render(){
  if(!el('htSettingsName'))return;
  renderLinks();renderMeal();renderRegistered();updatePrompt();
  el('htSettingsContinue').disabled=!chosen||!roleCanEdit();
 }
 function routeNamedEntry(name,destination){
  switch(destination){
   case 'bank':
    window.openInstitutionManager({type:'bank',name});break;
   case 'payment':
    window.openInstitutionManager({type:'payment',name});break;
   case 'card':{
    tab('cards');window.openProCardForm();
    const form=el('proCardForm'),search=form?.querySelector('#cp-instSearch');
    const found=(state.institutions||[]).find(x=>x.type==='bank'&&
      [x.name,x.short_name].some(s=>normalized(s)===normalized(name)));
    if(found&&form){
     form.elements.institution_id.value=found.id;
     form.elements.institution_id.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(search){
     search.value=name;search.dispatchEvent(new Event('input',{bubbles:true}));
     notice('Kredi kartı eklemek için listeden bir banka seç ve kart bilgilerini tamamla.');
    }
    break;
   }
   case 'bankAccount':
   case 'cash':{
    tab('banking');window.openSuiteForm('account');
    const form=el('suiteForm');
    if(form){
     form.elements.name.value=name;
     form.elements.type.value=destination==='cash'?'cash':'bank';
    }
    break;
   }
   case 'meal':tab('meal');window.openFirmForm('new','receivable','meal',name);break;
   case 'platform':tab('platforms');window.openFirmForm('new','receivable','platform',name);break;
   case 'pos':tab('banking');window.openFirmForm('new','receivable','pos',name);break;
   case 'receivable':tab('people');window.openFirmForm('new','receivable','person',name);break;
   case 'payable':tab('payables');window.openFirmForm('new','payable','general',name);break;
  }
 }
 document.addEventListener('input',event=>{
  if(event.target.id==='htSettingsName')updatePrompt();
 });
 document.addEventListener('click',event=>{
  const choice=event.target.closest('[data-ht-settings-choose]');
  if(choice){chosen=choice.dataset.htSettingsChoose;fillCategories();return;}
  const go=event.target.closest('#htSettingsContinue');
  if(go){
   if(!roleCanEdit()){notice('Ayarları yalnızca yönetici değiştirebilir.',true);return;}
   const name=el('htSettingsName').value.trim();
   if(!name||!chosen){notice('Önce isim yaz ve kategori seç.',true);return;}
   routeNamedEntry(name,chosen);return;
  }
  const manage=event.target.closest('[data-ht-settings-manage]');
  if(manage){
   const where=manage.dataset.htSettingsManage;
   if(where==='banks'||where==='payments'){
    window.openInstitutionManager({type:where==='banks'?'bank':'payment'});
   }else{
    tab(where==='pos'?'banking':where);
   }
   return;
  }
  const meal=event.target.closest('[data-ht-settings-brand]');
  if(meal){
   tab('meal');
   const input=el('v9MealInline')?.querySelector('[name="name"]');
   if(input){input.value=meal.dataset.htSettingsBrand;input.dispatchEvent(new Event('change',{bubbles:true}));}
   return;
  }
  const edit=event.target.closest('[data-ht-settings-edit]');
  if(edit&&roleCanEdit())window.openFirmForm('edit',edit.dataset.htSettingsEdit);
 });
 document.addEventListener('error',event=>{
  const img=event.target;
  if(img instanceof HTMLImageElement&&img.classList.contains('ht-settings-logo-image'))img.remove();
 },true);
 window.renderSettings=render;
 window.HTSettingsDestinations=destinations;
 window.HTSettingsMealBrands=mealPresets;
})();
