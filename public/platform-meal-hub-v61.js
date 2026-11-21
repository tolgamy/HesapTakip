'use strict';
// V61 unified receivables: view only; existing D1 platform/meal groups remain distinct.
(function(){
 let currentFilter='all';
 const kinds=['platform','meal'];
 const safe=value=>esc(String(value??''));
 const group=f=>f.receivable_group||'general';
 const all=()=> (state.firms||[]).filter(f=>f.category==='receivable'&&kinds.includes(group(f)));
 const total=rows=>rows.reduce((sum,f)=>sum+(Number(firmBalance(f.id).remaining)||0),0);
 function icon(f){
  const name=window.HTBrand?.label?.(f.name)||f.name;
  const initials=window.HTBrand?.initials?.(name)||String(name||'?').slice(0,2).toLocaleUpperCase('tr-TR');
  const tone=window.HTBrand?.tone?.(name)||'';
  const image=window.HTEntityLogo?.('firm',f.id,f.logo_data)||f.logo_data||'';
  const img=/^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(image)?'<img src="'+safe(image)+'" alt="" loading="lazy">':'';
  return '<span class="v61-logo '+safe(tone)+'" aria-hidden="true">'+safe(initials)+img+'</span>';
 }
 function render(){
  const host=el('v61UnifiedRows');if(!host)return;
  const list=(currentFilter==='all'?all():all().filter(f=>group(f)===currentFilter))
   .sort((a,b)=>(a.name||'').localeCompare(b.name||'','tr'));
  host.innerHTML=list.length?list.map(f=>{
   const amount=Number(firmBalance(f.id).remaining)||0;
   return '<button type="button" class="v61-row" data-v61-open="'+safe(f.id)+'" aria-label="'+safe(f.name+' hesabını aç')+'">'+
    icon(f)+'<span class="v61-name"><strong>'+safe(window.HTBrand?.label?.(f.name)||f.name)+
    '</strong><small>'+(group(f)==='meal'?'Yemek Kartı':'Platform')+'</small></span>'+
    '<strong class="v61-amount">'+safe(money(amount))+'</strong><span class="v61-arrow" aria-hidden="true">›</span></button>';
  }).join(''):'<p class="v61-empty">Bu bölümde henüz alacak yok. Aşağıdan yeni kayıt ekleyebilirsin.</p>';
  const labels={all:'Toplam platform + yemek kartı alacağı',platform:'Toplam platform alacağı',meal:'Toplam yemek kartı alacağı'};
  el('v61TotalLabel').textContent=labels[currentFilter];
  el('v61TotalValue').textContent=money(total(list));
  document.querySelectorAll('[data-v61-filter]').forEach(btn=>{
   const selected=btn.dataset.v61Filter===currentFilter;
   btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));
  });
  el('v61PlatformManage').hidden=currentFilter==='meal';
  el('v61MealManage').hidden=currentFilter==='platform';
 }
 function setFilter(value){currentFilter=kinds.includes(value)?value:'all';render();}
 const oldRender=window.renderCoreMoney;
 window.renderCoreMoney=function(){if(typeof oldRender==='function')oldRender();render();};
 document.addEventListener('click',event=>{
  const filter=event.target.closest('[data-v61-filter]');
  if(filter){setFilter(filter.dataset.v61Filter);return;}
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
 window.HTV61={setFilter,render,all,total};
})();