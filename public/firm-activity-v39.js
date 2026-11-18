'use strict';
// V39: unified firm movement history. Reads the existing D1-backed state;
// editing and deleting reuse the already authorized, balance-safe routes.
(function(){
 const safe=x=>esc(String(x??''));
 const categories=[
  ['all','Tüm hareketler'],['payable','Firma Borçları'],
  ['meal','Yemek Kartları'],['platform','Platformlar'],['pos','POS'],
  ['person','Şahıslar'],['veresiye','Veresiye'],['general','Diğer alacaklar']
 ];
 const view=el('firmactivityView');
 if(!view)return;
 const list=el('v39ActivityList');
 const count=el('v39ActivityCount');
 const desc=el('v39ActivityHint');
 function isAllowedFirm(firm){
  const identity=window.HTIdentity||{};
  if(identity.role!=='user')return true;
  return (identity.permissions||[]).includes('payables')&&firm.category==='payable';
 }
 function group(firm){
  return firm.category==='payable'?'payable':(firm.receivable_group||'general');
 }
 function rows(){
  const firms=new Map((state.firms||[]).filter(isAllowedFirm).map(f=>[f.id,f]));
  const find=String(el('v39ActivitySearch')?.value||'').trim().toLocaleLowerCase('tr-TR');
  const groupFilter=el('v39ActivityGroup')?.value||'all';
  const kind=el('v39ActivityKind')?.value||'all';
  const from=el('v39ActivityFrom')?.value||'',to=el('v39ActivityTo')?.value||'';
  return (state.firmMovements||[])
    .filter(m=>{
      const f=firms.get(m.firm_id);
      return !!f&&(groupFilter==='all'||group(f)===groupFilter)&&
        (kind==='all'||m.kind===kind)&&(!from||m.on_date>=from)&&(!to||m.on_date<=to)&&
        (!find||(f.name+' '+(m.note||'')).toLocaleLowerCase('tr-TR').includes(find));
    })
    .sort((a,b)=>b.on_date.localeCompare(a.on_date)||
      (b.created_at||'').localeCompare(a.created_at||'')||b.id.localeCompare(a.id))
    .map(m=>({movement:m,firm:firms.get(m.firm_id)}));
 }
 function render(){
  if(!list)return;
  const data=rows(),total=data.reduce((n,x)=>n+(x.movement.kind==='charge'?x.movement.amount_kurus:-x.movement.amount_kurus),0);
  count.textContent=data.length+' hareket';
  desc.textContent=data.length?'Filtrelenen işlemler neti: '+money(total)+
    ' · Silinen bir işlem, ilgili firmada kalan borç veya alacağı değiştirir.':
    'Seçilen koşullarda hareket bulunamadı.';
  list.innerHTML=data.length?data.slice(0,300).map(({movement:m,firm:f})=>{
   const kind=m.kind==='charge'?(f.category==='payable'?'Borç girişi':'Alacak girişi'):(f.category==='payable'?'Ödeme':'Tahsilat');
   const note=m.note?'<small>'+safe(m.note)+'</small>':'';
   return '<article class="v39-activity-row"><div class="v39-activity-details">'+
    '<strong>'+safe(f.name)+'</strong><small>'+safe(showDate(m.on_date))+
    ' · '+safe(kind)+' · '+safe(categories.find(x=>x[0]===group(f))?.[1]||'Diğer')+'</small>'+note+
    '</div><strong class="v39-activity-amount">'+(m.kind==='charge'?'+':'−')+money(m.amount_kurus)+'</strong>'+
    (currentRole==='viewer'?'':'<div class="v39-activity-actions">'+
     '<button type="button" class="mini-btn" data-firm-movement-edit="'+safe(m.id)+'">Düzenle</button>'+
     '<button type="button" class="mini-btn delete" data-firm-movement-delete="'+safe(m.id)+'">Sil</button>'+
     '</div>')+'</article>';
  }).join('')+(data.length>300?'<p class="muted">İlk 300 hareket gösteriliyor. Filtreyi daralt.</p>':''):
  '<p class="muted">Bu filtrede hareket yok.</p>';
 }
 view.addEventListener('input',event=>{
  if(event.target.matches('#v39ActivitySearch,#v39ActivityFrom,#v39ActivityTo'))render();
 });
 view.addEventListener('change',event=>{
  if(event.target.matches('#v39ActivityGroup,#v39ActivityKind,#v39ActivityFrom,#v39ActivityTo'))render();
 });
 window.renderFirmActivity=render;
 window.HTFirmActivity39={render,rows};
})();
