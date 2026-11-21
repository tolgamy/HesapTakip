'use strict';
// V61 unified receivables: view only; existing D1 platform/meal groups remain distinct.
(function(){
 const kinds=['platform','meal'];
 const safe=value=>esc(String(value??''));
 const group=f=>f.receivable_group||'general';
 const all=()=> (state.firms||[]).filter(f=>f.category==='receivable'&&kinds.includes(group(f)));
 const total=rows=>rows.reduce((sum,f)=>sum+(Number(firmBalance(f.id).remaining)||0),0);
 function icon(f){
  const name=window.HTBrand?.label?.(f.name)||f.name;
  const initials=window.HTBrand?.initials?.(name)||String(name||'?').slice(0,2).toLocaleUpperCase('tr-TR');
  const tone=window.HTBrand?.tone?.(name)||'';
  const uploaded=f.logo_data||window.HTEntityLogo?.('firm',f.id)||'';
  const image=window.HTBrand?.logoSource?.(name,uploaded)||uploaded;
  const img=/^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(image)?'<img class="v66-brand-image" src="'+safe(image)+'" alt="" loading="lazy">':'';
  return '<span class="v61-logo '+safe(tone)+'" aria-hidden="true">'+safe(initials)+img+'</span>';
 }
 function render(){
  const host=el('v61UnifiedRows');if(!host)return;
  const list=window.HTBrand?.sortPlatformFirms?.(all())||all().sort((a,b)=>(a.name||'').localeCompare(b.name||'','tr'));
  host.innerHTML=list.length?list.map(f=>{
   const amount=Number(firmBalance(f.id).remaining)||0;
   return '<button type="button" class="v61-row" data-v61-open="'+safe(f.id)+'" aria-label="'+safe(f.name+' hesabını aç')+'">'+
    icon(f)+'<span class="v61-name"><strong>'+safe(f.name)+
    '</strong><small>'+'Platform'+'</small></span>'+
    '<strong class="v61-amount">'+safe(money(amount))+'</strong><span class="v61-arrow" aria-hidden="true">›</span></button>';
  }).join(''):'<p class="v61-empty">Bu bölümde henüz alacak yok. Aşağıdan yeni kayıt ekleyebilirsin.</p>';
  el('v61TotalLabel').textContent='Toplam platform alacağı';
  el('v61TotalValue').textContent=money(total(list));
 }
 function setFilter(){render();} // Kept for existing links; no visible filters.
 const oldRender=window.renderCoreMoney;
 window.renderCoreMoney=function(){if(typeof oldRender==='function')oldRender();render();};
 document.addEventListener('click',event=>{
  const create=event.target.closest('[data-v61-create]');
  if(create){
   if(currentRole==='viewer'){notice('Bu işlem için düzenleme yetkisi gerekli.',true);return;}
   if(kinds.includes(create.dataset.v61Create))window.openFirmForm('new','receivable',create.dataset.v61Create);
   return;
  }
  const row=event.target.closest('[data-v61-open]');if(!row)return;
  const firm=all().find(f=>String(f.id)===row.dataset.v61Open);if(!firm)return;
  const panel=el(group(firm)==='meal'?'v61MealManage':'v61PlatformManage');
  panel.hidden=false;panel.open=true;
  const history=[...panel.querySelectorAll('[data-core-history]')].find(x=>x.dataset.coreHistory===String(firm.id));
  if(history)history.click();
  panel.scrollIntoView?.({behavior:'smooth',block:'start'});
 });
 document.addEventListener('error',event=>{
  const image=event.target;
  if(typeof HTMLImageElement!=='undefined'&&image instanceof HTMLImageElement&&
   image.classList.contains('v66-brand-image'))image.remove();
 },true);
 window.HTV61={setFilter,render,all,total};
})();