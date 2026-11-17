'use strict';
// Same-page receivables: preset logos are suggestions, never fake balances.
// Uploaded logos are downscaled to 64x64 and stored in the existing D1 firm record.
(function(){
 const presets={
  meal:[
   ['SETCARD','setcard.com.tr'],['MultiNet','multinet.com.tr'],
   ['Edenred','edenred.com.tr'],['MetropolCard','metropolcard.com'],
   ['TokenFlex','tokenflex.com.tr'],['Pluxee','pluxee.com.tr']
  ],
  platform:[
   ['Getir','getir.com'],['Getir Çarşı','getir.com'],
   ['Trendyol','trendyol.com'],['Uber Eats','ubereats.com'],
   ['Yemeksepeti','yemeksepeti.com'],['Yemeksepeti Mahalle','yemeksepeti.com'],
   ['USMAR.com','usmarmarket.com'],['Usmar.com.tr','usmarmarket.com.tr']
  ]
 };
 const institutionShortcuts=[
  ['paytr','PayTR'],['iyzico','iyzico'],
  ['kuveytturk','Kuveyt Türk'],['garanti-odeme','Tami POS']
 ];
 const escV=s=>esc(String(s??''));
 const groups=['meal','platform'];
 const matching=(group,name,payout)=> (state.firms||[]).find(f=>f.category==='receivable'&&
  (f.receivable_group||'general')===group&&
  f.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR')&&
  (f.payout_institution_id||'')===(payout||''));
 const allowedInstitution=id=>(state.institutions||[]).find(i=>i.id===id&&i.is_active);
 const domainFor=(group,name)=>presets[group]?.find(([label])=>label.toLocaleLowerCase('tr-TR')===
   String(name||'').toLocaleLowerCase('tr-TR'))?.[1]||'';
 const logoImage=(src,name,domain)=>{
  const fallback=(String(name||'₺').match(/\p{L}/gu)||[]).slice(0,2).join('').toLocaleUpperCase('tr-TR')||'₺';
  const url=src||(domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':'');
  return '<span class="v9-logo"><span>'+escV(fallback)+'</span>'+
   (url?'<img class="v9-company-logo" loading="lazy" alt="" src="'+escV(url)+'">':'')+'</span>';
 };
 function institutionSelect(){
  const active=(state.institutions||[]).filter(i=>i.is_active);
  const options=(kind)=>active.filter(x=>x.type===kind).map(x=>
   '<option value="'+escV(x.id)+'">'+escV(x.id==='garanti-odeme'?'Tami POS / Garanti Ödeme':x.name)+'</option>').join('');
  return '<select name="payout_institution_id" class="v9-payout-select" aria-label="Ödeme kuruluşu veya banka">'+
   '<option value="">Ödeme kuruluşu veya banka seç (isteğe bağlı)</option>'+
   '<optgroup label="Bankalar">'+options('bank')+'</optgroup>'+
   '<optgroup label="Ödeme kuruluşları / POS">'+options('payment')+'</optgroup></select>';
 }
 function presetButton(group,name,domain){
  const record=(state.firms||[]).find(f=>f.category==='receivable'&&
   (f.receivable_group||'general')===group&&f.name===name);
  return '<button type="button" class="v9-brand" data-v9-preset="'+escV(name)+'" data-v9-group="'+group+'">'+
   logoImage(record?.logo_data,name,domain)+'<span>'+escV(name)+'</span></button>';
 }
 function logoManager(group){
  if(currentRole!=='admin')return '';
  const firms=(state.firms||[]).filter(f=>f.category==='receivable'&&
   (f.receivable_group||'general')===group);
  return '<section class="v9-logo-manager v9-pc-only"><div class="v9-block-title"><h3>Kuruluş logolarını yönet</h3>'+
   '<small>Yalnızca PC’de PNG, JPG veya WebP yükleyebilirsin.</small></div>'+
   (firms.length?'<div class="v9-logo-rows">'+firms.map(f=>
    '<div class="v9-logo-row">'+logoImage(f.logo_data,f.name,domainFor(group,f.name))+
    '<span>'+escV(f.name)+'</span><button type="button" data-v9-logo-id="'+escV(f.id)+
    '">Logo yükle</button></div>').join('')+'</div>':'<p class="hint">Önce bir alacak kaydı ekle; ardından logosunu yükleyebilirsin.</p>')+
   '</section>';
 }
 function form(group,host){
  const items=presets[group];
  const heading=group==='meal'?'Yemek kartı alacağı ekle':'Platform alacağı ekle';
  const names=items.map(([name])=>'<option value="'+escV(name)+'">'+escV(name)+'</option>').join('');
  return '<section class="v9-receivable-box" data-v9-section="'+group+'">'+
   '<div class="v9-block-title"><h3>'+(group==='meal'?'Yemek kartı firmaları':'Platformlar')+
    '</h3><small>Logo seç, tutarı aynı ekranda kaydet.</small></div>'+
   '<div class="v9-brand-grid">'+items.map(([name,domain])=>presetButton(group,name,domain)).join('')+'</div>'+
   '<form class="v9-receivable-form" data-v9-form="'+group+'">'+
    '<div class="v9-block-title"><h3>'+heading+'</h3><small>Kayıtlar Genel Bakış’a otomatik yansır.</small></div>'+
    '<div class="v9-form-grid"><div><label for="'+host+'-name">Firma / platform</label>'+
      '<select id="'+host+'-name" name="name" required><option value="">Seçiniz</option>'+
      names+'<option value="__custom__">Listede yok, başka isim yaz</option></select></div>'+
    '<div class="v9-custom-name" hidden><label for="'+host+'-custom">Kurum adı</label>'+
      '<input id="'+host+'-custom" name="custom_name" maxlength="120" placeholder="Firma / platform adı"></div>'+
    '<div><label for="'+host+'-amount">Alacağım tutar (₺)</label>'+
      '<input id="'+host+'-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0,00"></div>'+
    '<div><label for="'+host+'-date">İşlem tarihi</label><input id="'+host+'-date" name="on_date" type="date" value="'+trDate()+'" required></div>'+
    '<div><label for="'+host+'-due">Beklenen ödeme tarihi</label>'+
      '<input id="'+host+'-due" name="due_date" type="date"></div>'+
    '<div class="v9-payout-group"><label>Ödemenin geleceği banka / POS / ödeme kuruluşu</label>'+
      institutionSelect()+
      (group==='platform'?'<div class="v9-institution-chips">'+institutionShortcuts.map(([id,name])=>
       '<button type="button" class="v9-bank-chip" data-v9-payout="'+id+'">'+
        logoImage('',name,allowedInstitution(id)?.domain||'')+escV(name)+'</button>').join('')+'</div>':'')+
      '<p class="hint">Örnek: Getir Çarşı → PayTR veya USMAR.com → Tami POS. Bu alan banka bakiyesini değiştirmez.</p></div>'+
    '<div class="v9-pc-only"><label for="'+host+'-logo">Özel logo yükle (PC, isteğe bağlı)</label>'+
     '<input id="'+host+'-logo" type="file" accept="image/png,image/jpeg,image/webp">'+
     '<p class="hint">Logo eksikse küçük PNG/JPG/WebP görseli ekleyebilirsin.</p></div>'+
    '</div><div class="v9-form-actions"><button class="btn primary" type="submit">+ Alacağı kaydet</button></div>'+
   '</form>'+logoManager(group)+'</section>';
 }
 function renderV9(){
  const targets=[
   ['v9MealInline','meal'],['v9PlatformInline','platform'],['v9CardMealInline','meal']
  ];
  for(const [id,group] of targets){
   const target=el(id);
   if(!target)continue;
   target.innerHTML=form(group,id);
  }
 }
 const oldRender=window.renderCoreMoney;
 window.renderCoreMoney=function(){
  if(typeof oldRender==='function')oldRender();
  renderV9();
 };
 const resolveGroupForm=button=>button.closest('form[data-v9-form]');
 document.addEventListener('click',e=>{
  const preset=e.target.closest('[data-v9-preset]');
  if(preset){
   const section=preset.closest('.v9-receivable-box'),form=section?.querySelector('form[data-v9-form]');
   if(!form)return;
   form.elements.name.value=preset.dataset.v9Preset;
   form.elements.name.dispatchEvent(new Event('change',{bubbles:true}));
   section.querySelectorAll('[data-v9-preset]').forEach(btn=>btn.classList.toggle('selected',btn===preset));
   form.elements.amount.focus();return;
  }
  const bank=e.target.closest('[data-v9-payout]');
  if(bank){
   const form=resolveGroupForm(bank);
   if(!form)return;
   form.elements.payout_institution_id.value=bank.dataset.v9Payout;
   form.querySelectorAll('[data-v9-payout]').forEach(btn=>btn.classList.toggle('selected',btn===bank));
   return;
  }
  const upload=e.target.closest('[data-v9-logo-id]');
  if(upload){
   if(currentRole!=='admin'){notice('Logo düzenlemek için yönetici yetkisi gerekiyor.',true);return;}
   const firm=(state.firms||[]).find(f=>f.id===upload.dataset.v9LogoId);
   if(!firm)return;
   const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
   input.addEventListener('change',async()=>{
    if(!input.files?.[0])return;
    upload.disabled=true;
    try{
     const logo_data=await reduceLogo(input.files[0]);
     await api('firms/'+firm.id,'PATCH',{
      name:firm.name,category:firm.category,receivable_group:firm.receivable_group||'general',
      phone:firm.phone||'',note:firm.note||'',
      payout_institution_id:firm.payout_institution_id||null,logo_data
     });
     await load();notice('Kurum logosu kaydedildi.');
    }catch(error){notice(error.message,true);}
    finally{upload.disabled=false;}
   },{once:true});
   input.click();
  }
 });
 document.addEventListener('change',e=>{
  const select=e.target.closest('form[data-v9-form] select[name="name"]');
  if(!select)return;
  const form=select.form,other=form.querySelector('.v9-custom-name');
  const custom=select.value==='__custom__';
  other.hidden=!custom;
  other.querySelector('input').required=custom;
 });
 document.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-v9-form]');
  if(!form)return;
  e.preventDefault();
  if(currentRole==='viewer'){notice('Salt-okunur kullanıcının kayıt yetkisi yok.',true);return;}
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form));
   const group=form.dataset.v9Form;
   const name=d.name==='__custom__'?d.custom_name?.trim():d.name;
   if(!name||!name.trim())throw new Error('Önce bir kuruluş seç veya adını yaz.');
   const institution=d.payout_institution_id||null;
   if(institution&&!allowedInstitution(institution))throw new Error('Seçilen banka/ödeme kuruluşu bulunamadı.');
   const amount_kurus=amountValue(d.amount);
   const on_date=d.on_date||trDate(),due_date=d.due_date||null;
   const file=form.querySelector('input[type="file"]')?.files?.[0];
   const logo_data=file?await reduceLogo(file):'';
   const prior=matching(group,name,institution);
   if(prior){
    if(logo_data){
     await api('firms/'+prior.id,'PATCH',{
      name:prior.name,category:'receivable',receivable_group:group,
      payout_institution_id:institution,logo_data,phone:prior.phone||'',note:prior.note||''
     });
    }
    await api('firm-movements','POST',{
     firm_id:prior.id,kind:'charge',amount_kurus,on_date,due_date,note:''
    });
   }else{
    await api('firms/with-charge','POST',{
     name,category:'receivable',receivable_group:group,
     payout_institution_id:institution,logo_data,amount_kurus,on_date,due_date,
     phone:'',note:'',movement_note:''
    });
   }
   await load();
   notice(name+' için alacak kaydedildi.');
  }catch(error){notice(error.message,true);}
  finally{button.disabled=false;}
 });
 document.addEventListener('error',e=>{
  const image=e.target;
  if(image instanceof HTMLImageElement&&image.classList.contains('v9-company-logo'))image.remove();
 },true);
 window.v9ReceivablePresets=presets;
 window.renderV9Receivables=renderV9;
})();
