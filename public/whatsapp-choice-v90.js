'use strict';
// HesapTakip Rehber V2.1. This file does not read/write the directory API,
// upload contacts or send messages. Each deep link is a user-initiated tap.
(function(){
 function normalizePhone(raw){
  const input=String(raw||'').trim();
  if(!input||/[^+0-9 ().-]/.test(input))return '';
  let digits=input.replace(/\D/g,'');
  if(input.startsWith('+')){
   if(input.indexOf('+',1)!==-1)return '';
  }else if(digits.startsWith('00')){
   digits=digits.slice(2);
  }else if(/^0\d{10}$/.test(digits)){
   // Local Turkish phone number, including a WhatsApp Business landline.
   digits='90'+digits.slice(1);
  }else if(/^\d{10}$/.test(digits)){
   // Turkish 10-digit national number without the leading 0.
   digits='90'+digits;
  }else if(digits.startsWith('0')){
   return ''; // Unknown national format: do not guess a wrong recipient.
  }
  return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
 }
 function linksForPhone(raw){
  const phone=normalizePhone(raw);
  if(!phone)return null;
  return {
   normal:'whatsapp://send?phone='+phone,
   business:'whatsapp-business://send?phone='+phone,
   fallback:'https://wa.me/'+phone
  };
 }
 window.HTWhatsAppV90={normalizePhone,linksForPhone};
 const dialog=document.getElementById('v90WhatsAppDialog');
 if(!dialog)return;
 const get=id=>document.getElementById(id);
 const person=get('v90WhatsAppPerson');
 const normal=get('v90WhatsAppRegular');
 const business=get('v90WhatsAppBusiness');
 const fallback=get('v90WhatsAppFallback');
 const status=get('v87ContactsNotice');
 function closeDialog(){
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else dialog.removeAttribute('open');
 }
 function openFor(button){
  if(window.HTIdentity?.role!=='admin')return;
  const links=linksForPhone(button.dataset.v90Phone);
  if(!links){
   if(status)status.textContent='Bu kişi için WhatsApp bağlantısı oluşturulamıyor. Numarayı ülke koduyla (+90 gibi) kaydet.';
   return;
  }
  person.textContent=String(button.dataset.v90Name||'Kişi');
  normal.href=links.normal;
  business.href=links.business;
  fallback.href=links.fallback;
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('[data-v90-whatsapp]');
  if(!trigger)return;
  event.preventDefault();
  openFor(trigger);
 });
 get('v90WhatsAppClose').addEventListener('click',closeDialog);
 get('v90WhatsAppCancel').addEventListener('click',closeDialog);
 dialog.addEventListener('click',event=>{
  if(event.target===dialog)closeDialog();
 });
 document.addEventListener('ht:logout',closeDialog);
})();
