'use strict';
// V24 presentation-only duplicate audit. Historical institution identifiers and links remain intact.
(function(){
 const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('tr-TR')
  .trim().replace(/\s+/g,' ');
 const usedIds=()=>{
  const all=state||{};
  return new Set([
   ...(all.accounts||[]).map(x=>x.institution_id),
   ...(all.cards||[]).map(x=>x.institution_id),
   ...(all.firms||[]).map(x=>x.payout_institution_id)
  ].filter(Boolean));
 };
 function uniqueInstitutions(items){
  const records=items||[];
  const used=usedIds();
  const best=new Map();
  const score=x=>(!x.is_custom?10:0)+(x.is_active?4:0)+(used.has(x.id)?2:0);
  records.forEach((inst,index)=>{
   const key=normalize(inst.name);
   const prev=best.get(key);
   if(!prev||score(inst)>score(prev.inst))best.set(key,{inst,index});
  });
  const visible=new Set([...best.values()].map(x=>x.inst.id));
  return records.filter(x=>visible.has(x.id));
 }
 function duplicates(items){
  const seen=new Map(),result=[];
  (items||[]).forEach(inst=>{
   const key=normalize(inst.name);
   if(seen.has(key))result.push({first:seen.get(key),second:inst});
   else seen.set(key,inst);
  });
  return result;
 }
 function showDuplicates(){
  const panel=el('v21CatalogManager');
  if(!panel)return;
  const copy=duplicates(state.institutions||[]);
  let host=el('v24DuplicateWarning');
  if(!host){
   host=document.createElement('p');
   host.id='v24DuplicateWarning';
   host.className='v24-duplicates-hint';
   panel.querySelector('.ht-settings-heading')?.insertAdjacentElement('afterend',host);
  }
  if(host){
   host.hidden=!copy.length;
   host.textContent=copy.length?
    'Tekrarlanan kuruluş adı tespit edildi: '+
      [...new Set(copy.map(({second})=>second.name))].slice(0,8).join(', ')+
      '. Yeni seçim listelerinde tek isim gösteriliyor; kayıtlı banka/kart bağlantıları korunuyor.':'';
  }
 }
 const previousSettings=window.renderSettings;
 window.renderSettings=function(){
  if(typeof previousSettings==='function')previousSettings();
  showDuplicates();
 };
 window.HTInstitution24={normalize,uniqueInstitutions,duplicates,showDuplicates};
})();