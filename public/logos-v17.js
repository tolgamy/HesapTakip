'use strict';
// Central logo manager. Financial rows are not modified except existing logo fields.
(function(){
 const safe=x=>esc(String(x??''));
 let selected=null;
 const editAllowed=()=>currentRole==='admin';
 function logoFor(type,id,fallback=''){
   const from=(state.logoEntries||[]).find(x=>x.target_type===type&&x.target_id===id);
   return from ? from.logo_data : fallback||'';
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
 function render(){
   const listEl=el('htUniversalLogoList');if(!listEl)return;
   const category=el('htLogoCategory')?.value||'all',
     term=(el('htLogoSearch')?.value||'').trim().toLocaleLowerCase('tr-TR');
   const items=catalog().filter(x=>(category==='all'||x.type===category)&&
     (x.name+' '+x.description).toLocaleLowerCase('tr-TR').includes(term));
   listEl.innerHTML=items.length?items.map(x=>{
     const image=logoFor(x.type,x.id,x.logo_data);
     const mark=image?'<img src="'+safe(image)+'" alt="" class="ht-v17-logo-img">':
       '<span class="ht-v17-initial">'+safe((x.name||'?').trim().slice(0,2).toLocaleUpperCase('tr-TR'))+'</span>';
     return '<div class="ht-v17-logo-item"><span class="ht-v17-logo">'+mark+'</span>'+
       '<span class="ht-v17-logo-title"><strong>'+safe(x.name)+'</strong><small>'+safe(x.description)+'</small></span>'+
       (editAllowed()?'<span class="ht-v17-logo-actions">'+
         '<button type="button" class="mini-btn" data-v17-logo-pick="'+safe(x.type)+'" data-v17-logo-id="'+safe(x.id)+'">'+
           (image?'Değiştir':'Logo ekle')+'</button>'+
         (image?'<button type="button" class="mini-btn delete" data-v17-logo-remove="'+safe(x.type)+'" data-v17-logo-id="'+safe(x.id)+'">Kaldır</button>':'')+
       '</span>':'')+'</div>';
   }).join(''):'<p class="muted">Bu kategoriye uygun kayıt yok.</p>';
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-v17-logo-pick],[data-v17-logo-remove]');
  if(!button||!editAllowed())return;
  const type=button.dataset.v17LogoPick||button.dataset.v17LogoRemove;
  const id=button.dataset.v17LogoId;
  if(button.dataset.v17LogoRemove){
    if(!confirm('Bu logoyu kaldırmak istediğine emin misin?'))return;
    try{await api('logos','POST',{target_type:type,target_id:id,logo_data:''});await load();
      notice('Logo kaldırıldı; kayıt ve finans geçmişi korundu.');}
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
 document.addEventListener('error',e=>{
  if(e.target instanceof HTMLImageElement&&e.target.classList.contains('ht-v17-logo-img'))e.target.remove();
 },true);
 window.HTEntityLogo=logoFor;
 window.renderUniversalLogos=render;
})();
