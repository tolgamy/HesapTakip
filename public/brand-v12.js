'use strict';
// Original, clearly non-official pictograms shown when a legitimate brand image
// is absent. No trademarks or third-party logos are generated or impersonated.
(function(){
 const labels=new Map([
  ['setcard','Setcard'],['multinet','Multinet'],['multinet up','Multinet'],
  ['edenred','Edenred'],['edenred / ticket restaurant','Edenred'],
  ['metropolcard','Metropolcard'],['tokenflex','Tokenflex'],
  ['pluxee','Pluxee'],['edenredpos','EdenredPOS']
 ]);
 const icons=new Map([
  ['setcard','SC'],['multinet','MN'],['edenred','ED'],
  ['metropolcard','MC'],['tokenflex','TF'],['pluxee','PX'],
  ['edenredpos','EP'],['getir','GE'],['getir çarşı','GÇ'],
  ['trendyol','TY'],['yemeksepeti','YS'],['paytr','PT'],
  ['iyzico','İY']
 ]);
 // Built-in official-site favicons. They are defaults only; no finance record is written.
 // A user's uploaded logo always takes precedence over these sources.
 const defaultDomains=new Map([
  ['getir çarşı','getir.com'],['getirçarşı','getir.com'],
  ['uber eats','ubereats.com'],['yemeksepeti mahalle','yemeksepeti.com'],
  ['edenred','edenred.com.tr'],['multinet','multinet.com.tr'],
  ['pluxee','pluxee.com.tr'],['setcard','setcard.com.tr'],
  ['metropolcard','metropolcard.com'],['tokenflex','tokenflex.com.tr'],['usmar.com','usmarmarket.com']
 ]);
 const normal=s=>String(s??'').trim().toLocaleLowerCase('tr-TR');
 function key(name){
  const n=normal(name);
  if(n.includes('ticket restaurant'))return 'edenred';
  if(n.startsWith('multinet'))return 'multinet';
  if(['getir','getirçarşı','getir carsı','getir çarşı'].includes(n))return 'getir çarşı';
  if(n.startsWith('usmar'))return 'usmar.com';
  return n;
 }
 // Returns one image URL, not a second image layer.
 // On failed image load the surrounding component removes its img to expose initials.
 const presetNames=["Getir Çarşı","Uber Eats","Yemeksepeti Mahalle","Edenred","Multinet","Pluxee","Setcard","Metropolcard","Tokenflex","USMAR.com"];
 const defaultLogos=new Map([["getir çarşı","/brand-icons-v67/getir-carsi.svg"],["uber eats","/brand-icons-v67/uber-eats.svg"],["yemeksepeti mahalle","/brand-icons-v67/yemeksepeti-mahalle.svg"],["edenred","/brand-icons-v67/edenred.svg"],["multinet","/brand-icons-v67/multinet.svg"],["pluxee","/brand-icons-v67/pluxee.svg"],["setcard","/brand-icons-v67/setcard.svg"],["metropolcard","/brand-icons-v67/metropolcard.svg"],["tokenflex","/brand-icons-v67/tokenflex.svg"],["usmar.com","/brand-icons-v67/usmar-com.svg"]]);
 function sortPlatformFirms(rows){
  const ranks=new Map(presetNames.map((name,index)=>[key(name),index]));
  return (rows||[]).slice().sort((a,b)=>{
   const ai=ranks.get(key(a.name))??presetNames.length,bi=ranks.get(key(b.name))??presetNames.length;
   return ai-bi||(a.name||'').localeCompare(b.name||'','tr');
  });
 }
 function logoSource(name,uploaded='',domain=''){
  if(typeof uploaded==='string'&&uploaded.trim())return uploaded;
  const bundled=defaultLogos.get(key(name));if(bundled)return bundled;
  const preferred=defaultDomains.get(key(name))||domain;
  return preferred?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(preferred)+'&sz=128':'';
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
 window.HTBrand={label,initials,tone,mark,key,logoSource,defaultDomains,defaultLogos,presets:presetNames,sortPlatformFirms};
})();
