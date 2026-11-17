'use strict';
// Original, clearly non-official pictograms shown when a legitimate brand image
// is absent. No trademarks or third-party logos are generated or impersonated.
(function(){
 const labels=new Map([
  ['setcard','Setcard'],['multinet','Multinet'],['multinet up','Multinet'],
  ['edenred','Edenred'],['edenred / ticket restaurant','Edenred'],
  ['metropolcard','Metropolcard'],['tokenflex','Tokenflex'],
  ['pluxee','Pluxee'],['edenredpos','Edenredpos']
 ]);
 const icons=new Map([
  ['setcard','SC'],['multinet','MN'],['edenred','ED'],
  ['metropolcard','MC'],['tokenflex','TF'],['pluxee','PX'],
  ['edenredpos','EP'],['getir','GE'],['getir çarşı','GÇ'],
  ['trendyol','TY'],['yemeksepeti','YS'],['paytr','PT'],
  ['iyzico','İY']
 ]);
 const normal=s=>String(s??'').trim().toLocaleLowerCase('tr-TR');
 function key(name){
  const n=normal(name);
  if(n.includes('ticket restaurant'))return 'edenred';
  if(n.startsWith('multinet'))return 'multinet';
  return n;
 }
 function label(name){
  return labels.get(key(name))||String(name??'');
 }
 function initials(name){
  const n=key(name);
  if(icons.has(n))return icons.get(n);
  const words=String(name||'').match(/[\p{L}\p{N}]+/gu)||[];
  return (words.length>1?words.slice(0,2).map(w=>w[0]).join(''):
   (words[0]||'₺').slice(0,2)).toLocaleUpperCase('tr-TR');
 }
 function tone(name){
  let hash=0;
  for(const c of key(name))hash=(hash*31+c.codePointAt(0))>>>0;
  return 'ht-tone-'+(hash%9);
 }
 function mark(name,cls=''){
  const escape=window.esc||((text)=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;'));
  return '<span class="ht-original-mark '+tone(name)+' '+cls+
   '" aria-hidden="true"><span>'+escape(initials(name))+'</span></span>';
 }
 window.HTBrand={label,initials,tone,mark,key};
})();
