'use strict';
// Central logo manager. Financial rows are not modified except existing logo fields.
(function(){
 const safe=x=>esc(String(x??''));
 let selected=null;
 const editAllowed=()=>currentRole==='admin';
 function logoFor(type,id,fallback=''){
   const from=(state.logoEntries||[]).find(x=>x.target_type===type&&x.target_id===id);
   return fallback||from?.logo_data||'';
 }
 function catalog(){
   return [
    ...(state.directory?.companies||[]).map(x=>({type:'directory',id:x.id,name:x.name,description:'Firma Rehberi',logo_data:x.logo_data})),
    ...(state.firms||[]).map(x=>({type:'firm',id:x.id,name:x.name,description:x.category==='payable'?'Firmaya borç':
      ({meal:'Yemek kartı',platform:'Platform',person:'Şahıs',pos:'POS',general:'Alacak'}[x.receivable_group]||'Alacak'),
      logo_data:x.logo_data})),
    ...(state.institutions||[]).map(x=>({type:'institution',id:x.id,name:x.name,description:x.type==='bank'?'Banka':'Ödeme kuruluşu',
      logo_data:x.logo_data})),
    ...(state.cards||[]).map(x=>({type:'card',id:x.id,name:x.bank+' · '+x.nickname,
      description:'Kredi kartı',logo_data:''})),
    ...(state.accounts||[]).map(x=>({type:'account',id:x.id,name:x.name,
      description:x.type==='bank'?'Banka hesabı':'Nakit kasa',logo_data:''}))
   ];
 }
 function renderPresetGrid(){
  const host=el('v67BrandGrid');if(!host)return;
  const names=window.HTBrand?.presets||[];
  const normalize=name=>window.HTBrand?.key?.(name)||String(name||'').toLocaleLowerCase('tr-TR');
  host.innerHTML=names.map(name=>{
   const firm=(state.firms||[]).find(f=>f.category==='receivable'&&
    ['platform','meal'].includes(f.receivable_group)&&normalize(f.name)===normalize(name));
   const uploaded=firm?logoFor('firm',firm.id,firm.logo_data||''):'';
   const image=window.HTBrand?.logoSource?.(name,uploaded)||uploaded;
   const visual=image?'<img src="'+safe(image)+'" class="v67-preset-image" loading="lazy" alt="">':
    '<span>'+safe(window.HTBrand?.initials?.(name)||'?')+'</span>';
   return '<article class="v67-brand-card"><span class="v67-brand-emblem" aria-hidden="true">'+visual+'</span>'+
    '<strong>'+safe(name)+'</strong><small>'+(firm?'Kayıtlı kurum':'Hazır logo · kayıt yok')+'</small>'+
    (firm&&editAllowed()?'<div class="v67-brand-actions">'+
      '<button type="button" class="mini-btn" data-v17-logo-pick="firm" data-v17-logo-id="'+safe(firm.id)+'">'+(uploaded?'Değiştir':'Logo yükle')+'</button>'+
      (uploaded?'<button type="button" class="mini-btn delete" data-v17-logo-remove="firm" data-v17-logo-id="'+safe(firm.id)+'">Özeli sil</button>':'')+
     '</div>':'')+'</article>';
  }).join('');
 }
 function render(){
   renderPresetGrid();
   const listEl=el('htUniversalLogoList');if(!listEl)return;
   const category=el('htLogoCategory')?.value||'all',
     term=(el('htLogoSearch')?.value||'').trim().toLocaleLowerCase('tr-TR');
   if(!term){listEl.innerHTML='<p class="muted">Düzenlemek istediğin kaydın adını yaz. Uzun liste otomatik açılmaz.</p>';return;}
   const items=catalog().filter(x=>(category==='all'||x.type===category)&&
     (x.name+' '+x.description).toLocaleLowerCase('tr-TR').includes(term));
   listEl.innerHTML=items.length?items.slice(0,30).map(x=>{
     const uploaded=logoFor(x.type,x.id,x.logo_data);
     const image=window.HTBrand?.logoSource?.(x.name,uploaded)||uploaded;
     const mark=image?'<img src="'+safe(image)+'" alt="" class="ht-v17-logo-img">':
       '<span class="ht-v17-initial">'+safe((x.name||'?').trim().slice(0,2).toLocaleUpperCase('tr-TR'))+'</span>';
     return '<div class="ht-v17-logo-item"><span class="ht-v17-logo">'+mark+'</span>'+
       '<span class="ht-v17-logo-title"><strong>'+safe(x.name)+'</strong><small>'+safe(x.description)+'</small></span>'+
       (editAllowed()?'<span class="ht-v17-logo-actions">'+
         '<button type="button" class="mini-btn" '+(x.type==='account'?
           'data-v10-account-edit="'+safe(x.id)+'"':
           'data-v19-rename="'+safe(x.type)+'" data-v19-rename-id="'+safe(x.id)+'"')+
           '>İsim düzenle</button>'+
         '<button type="button" class="mini-btn" data-v17-logo-pick="'+safe(x.type)+'" data-v17-logo-id="'+safe(x.id)+'">'+
           (uploaded?'Değiştir':'Özel logo yükle')+'</button>'+
         (uploaded?'<button type="button" class="mini-btn delete" data-v17-logo-remove="'+safe(x.type)+'" data-v17-logo-id="'+safe(x.id)+'">Özel logoyu sil</button>':'')+
       '</span>':'')+'</div>';
   }).join('')+(items.length>30?'<p class="muted">30 sonuç gösteriliyor. Aramayı daraltarak devam et.</p>':''):
   '<p class="muted">Eşleşen kayıt yok.</p>';
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-v17-logo-pick],[data-v17-logo-remove],[data-v19-rename]');
  if(!button||!editAllowed())return;
  if(button.dataset.v19Rename){
    const id=button.dataset.v19RenameId,type=button.dataset.v19Rename;
    if(type==='firm')window.openFirmForm('edit',id);
    else if(type==='directory')window.HTDirectory?.companyForm(id);
    else if(type==='institution'){
      const inst=(state.institutions||[]).find(x=>x.id===id);
      window.openInstitutionManager({editId:id,type:inst?.type||'bank'});
    }else if(type==='card')window.openProCardForm(id);
    return;
  }
  const type=button.dataset.v17LogoPick||button.dataset.v17LogoRemove;
  const id=button.dataset.v17LogoId;
  if(button.dataset.v17LogoRemove){
    if(!confirm('Özel logoyu silmek istiyor musun? Varsa ön tanımlı logo tekrar görünecek.'))return;
    try{await api('logos','POST',{target_type:type,target_id:id,logo_data:''});await load();
      notice('Özel logo kaldırıldı; ön tanımlı logo geri geldi. Finansal kayıtlar korundu.');}
    catch(err){notice(err.message,true);}
  }else {
    selected={type,id};
    const file=el('htUniversalLogoFile');file.value='';file.click();
  }
 });
 document.addEventListener('change',async event=>{
  if(event.target.id==='htLogoCategory')render();
  if(event.target.id!=='htUniversalLogoFile'||!selected)return;
  const target=selected;selected=null;
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  try {
    const src=await reduceLogo(file);
    await api('logos','POST',{target_type:target.type,target_id:target.id,logo_data:src});
    await load();notice('Logo kaydedildi.');
  }catch(err){notice(err.message,true);}
 });
 document.addEventListener('input',e=>{if(e.target.id==='htLogoSearch')render();});
 document.addEventListener('toggle',e=>{if(e.target?.id==='htLogoPanel'&&e.target.open)render();},true);
 document.addEventListener('error',e=>{
  if(e.target instanceof HTMLImageElement&&(e.target.classList.contains('ht-v17-logo-img')||e.target.classList.contains('v67-preset-image')))e.target.remove();
 },true);
 window.HTEntityLogo=logoFor;
 window.renderUniversalLogos=render;
})();
