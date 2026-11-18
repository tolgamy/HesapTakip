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
   const key=(inst.type||'')+'|'+normalize(inst.name);
   const prev=best.get(key);
   if(!prev||score(inst)>score(prev.inst))best.set(key,{inst,index});
  });
  const visible=new Set([...best.values()].map(x=>x.inst.id));
  return records.filter(x=>visible.has(x.id));
 }
 function duplicates(items){
  const seen=new Map(),result=[];
  (items||[]).forEach(inst=>{
   const key=(inst.type||'')+'|'+normalize(inst.name);
   if(seen.has(key))result.push({first:seen.get(key),second:inst});
   else seen.set(key,inst);
  });
  return result;
 }
 function showDuplicates(){
  // Duplicate-name checks and one-name catalog presentation stay intact.
  // The technical yellow warning should not clutter the Settings screen.
  el('v24DuplicateWarning')?.remove();
 }
 const previousSettings=window.renderSettings;
 window.renderSettings=function(){
  if(typeof previousSettings==='function')previousSettings();
  showDuplicates();
 };
 window.HTInstitution24={normalize,uniqueInstitutions,duplicates,showDuplicates};
})();