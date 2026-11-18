'use strict';
// V42: amounts are typed as LIRA (1000 => 1.000,00), not shifted as cents.
// Reformat only when necessary and maintain the user's caret and selection.
(function(){
 const moneyNames=new Set(['amount','opening','credit_limit','available_limit','cash_advance_limit','monthly','total']);
 function isMoneyInput(input){
  return input instanceof HTMLInputElement&&moneyNames.has(input.name)&&
   !input.disabled&&!input.readOnly&&['text','number','search'].includes(input.type);
 }
 function group(major){
  const text=String(major||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'')||'0';
  return text.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 }
 function formatDigits(raw){
  const clean=String(raw??'').replace(/[₺\s\u00a0]/g,'');
  if(!clean)return '';
  const comma=clean.indexOf(',');
  if(comma>=0){
   const whole=clean.slice(0,comma).replace(/\D/g,'');
   const fraction=clean.slice(comma+1).replace(/\D/g,'').slice(0,2).padEnd(2,'0');
   return group(whole)+','+fraction;
  }
  // Pasting an English-style decimal is supported. The multiple-dot form
  // "1.000.000" is always grouping rather than fractional punctuation.
  if(/^\d+\.\d{1,2}$/.test(clean)){
   const [whole,fraction]=clean.split('.');
   return group(whole)+','+fraction.padEnd(2,'0');
  }
  return group(clean)+',00';
 }
 function fromExisting(raw){
  const value=String(raw??'').trim();
  if(!value)return '';
  return formatDigits(value);
 }
 function prepare(input){
  if(!isMoneyInput(input)||input.dataset.v20Money==='yes')return;
  const formatted=fromExisting(input.value);
  input.type='text';input.inputMode='decimal';
  input.autocomplete='off';input.classList.add('v20-money-input');
  input.dataset.v20Money='yes';input.value=formatted;
  input.setAttribute('aria-description','Tutarı lira olarak yaz; 1000 = 1.000,00 TL. Rakamları tek tek düzeltebilirsin.');
  if(input.parentElement&&!input.parentElement.querySelector('.v20-money-hint')){
   const hint=document.createElement('small');
   hint.className='v20-money-hint';
   hint.textContent='Lira olarak yaz: 1000 → 1.000,00 ₺';
   input.insertAdjacentElement('afterend',hint);
  }
 }
 function caretFor(raw,cursor,formatted){
  if(!formatted)return 0;
  const comma=raw.indexOf(',');
  if(comma>=0&&cursor>comma){
   // Keep the cursor in the cents portion if the user is editing cents.
   const cents=(raw.slice(comma+1,cursor).match(/\d/g)||[]).length;
   return formatted.indexOf(',')+1+Math.min(cents,2);
  }
  const before=(raw.slice(0,cursor).match(/\d/g)||[]).length;
  if(before===0)return 0;
  let seen=0;
  const end=formatted.indexOf(',');
  for(let i=0;i<(end<0?formatted.length:end);i++){
   if(/\d/.test(formatted[i]))seen++;
   if(seen===before)return i+1;
  }
  return end>=0?end:formatted.length;
 }
 document.addEventListener('focusin',event=>{
  const input=event.target;
  if(!isMoneyInput(input))return;
  prepare(input);
  // No select-all or forced cursor reset: allow editing 1.050,00 in place.
 },true);
 document.addEventListener('input',event=>{
  const input=event.target;
  if(!isMoneyInput(input)||input.dataset.v20Money!=='yes'||event.isComposing)return;
  const entered=input.value;
  const cursor=typeof input.selectionStart==='number'?input.selectionStart:entered.length;
  const formatted=formatDigits(entered);
  if(entered===formatted)return; // Never disturb the native selection on an unchanged value.
  const next=caretFor(entered,cursor,formatted);
  input.value=formatted;
  if(typeof input.setSelectionRange==='function'){
   try{input.setSelectionRange(next,next);}catch{}
  }
 },true);
 window.HTCurrency20={formatDigits,fromExisting,caretFor};
})();
