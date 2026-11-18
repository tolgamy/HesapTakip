'use strict';
// V20: every new money input uses a bank-style Turkish two-kurus display.
// This layer never modifies stored amounts or historical financial records.
(function(){
 const moneyNames=new Set(['amount','opening','credit_limit','available_limit','cash_advance_limit','monthly','total']);
 function isMoneyInput(input){
  return input instanceof HTMLInputElement&&moneyNames.has(input.name)&&
   !input.disabled&&!input.readOnly&&['text','number','search'].includes(input.type);
 }
 function formatDigits(raw){
  let digits=String(raw??'').replace(/\D/g,'');
  if(!digits)return '';
  digits=digits.replace(/^0+(?=\d)/,'').padStart(3,'0');
  const major=digits.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return major+','+digits.slice(-2);
 }
 function fromExisting(raw){
  const value=String(raw??'').trim();
  if(!value)return '';
  const clean=value.replace(/[₺\s\u00a0]/g,'');
  // Before a field is focused, all old forms store major units as 1500.00.
  const major=/^\d+(?:\.\d{1,2})?$/.exec(clean);
  if(major){
   const [whole,minor='']=clean.split('.');
   return formatDigits(whole+minor.padEnd(2,'0'));
  }
  if(/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(clean)||/^\d+,\d{2}$/.test(clean))
   return formatDigits(clean);
  return formatDigits(clean);
 }
 function prepare(input){
  if(!isMoneyInput(input)||input.dataset.v20Money==='yes')return;
  const formatted=fromExisting(input.value);
  input.type='text';input.inputMode='decimal';
  input.autocomplete='off';input.classList.add('v20-money-input');
  input.dataset.v20Money='yes';input.value=formatted;
  input.setAttribute('aria-description','Son iki rakam kuruştur. 1000 yazarsan 10,00 TL olur.');
  if(input.parentElement&&!input.parentElement.querySelector('.v20-money-hint')){
   const hint=document.createElement('small');
   hint.className='v20-money-hint';
   hint.textContent='Son iki rakam kuruş: 1000 → 10,00 ₺';
   input.insertAdjacentElement('afterend',hint);
  }
 }
 document.addEventListener('focusin',event=>{
  const input=event.target;
  if(!isMoneyInput(input))return;
  prepare(input);
  // Do not select the entire value: existing amounts must be editable one digit
  // at a time, e.g. 1.050,00 -> 2.050,00 by replacing the first digit.
  // The browser retains the caret/selection the user positioned themselves.
 },true);
 document.addEventListener('input',event=>{
  const input=event.target;
  if(!isMoneyInput(input)||input.dataset.v20Money!=='yes')return;
  const entered=input.value;
  const cursor=typeof input.selectionStart==='number'?input.selectionStart:entered.length;
  const digitsBefore=(entered.slice(0,cursor).match(/\d/g)||[]).length;
  const formatted=formatDigits(entered);
  input.value=formatted;
  // Preserve caret relative to digits, even when a thousand separator is added/removed.
  let newCursor=0,seen=0;
  if(digitsBefore===0)newCursor=0;
  else{
   newCursor=formatted.length;
   for(let i=0;i<formatted.length;i++){
    if(/\d/.test(formatted[i]))seen++;
    if(seen===digitsBefore){newCursor=i+1;break;}
   }
  }
  if(typeof input.setSelectionRange==='function')
   input.setSelectionRange(newCursor,newCursor);
 },true);
 window.HTCurrency20={formatDigits,fromExisting};
})();