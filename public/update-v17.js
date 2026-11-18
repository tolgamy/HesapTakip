'use strict';
// Update check only compares the running client with the currently deployed
// Cloudflare version. It cannot publish un-deployed GitHub commits.
(function(){
 const localVersion=document.querySelector('meta[name="ht-build"]')?.content||'bilinmiyor';
 let availableVersion=null;
 const elBy=id=>document.getElementById(id);
 function status(message){const e=elBy('htUpdateStatus');if(e)e.textContent=message;}
 if(elBy('htCurrentVersion'))elBy('htCurrentVersion').textContent=localVersion;
 async function check(){
  const button=elBy('htCheckUpdates');if(button)button.disabled=true;
  status('Canlı uygulamanın sürümü kontrol ediliyor...');
  try{
   const response=await fetch('/version.json?check='+Date.now(),{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw Error('Sürüm dosyasına ulaşılamadı.');
   const info=await response.json();
   if(!info||!/^v\d+(?:\.\d+){0,2}$/.test(info.version))throw Error('Sunucu sürüm bilgisi hatalı.');
   elBy('htServerVersion').textContent=info.version;
   const n=v=>v.replace(/^v/,'').split('.').map(Number);
   const a=n(info.version),b=n(localVersion);
   const compare=Array.from({length:3},(_,i)=>(a[i]||0)-(b[i]||0)).find(x=>x!==0)||0;
   availableVersion=compare>0?info.version:null;
   elBy('htApplyUpdate').hidden=!availableVersion;
   status(availableVersion?'Yeni sürüm '+availableVersion+' hazır. Güncellemeyi yükle düğmesine basın.':
     compare<0?'Açık sürüm sunucudakinden daha yeni görünüyor; yayın durumunu kontrol edin.':
       'HesapTakip güncel ('+info.version+').');
  }catch(err){availableVersion=null;elBy('htApplyUpdate').hidden=true;status('Güncelleme kontrol edilemedi: '+err.message);}
  finally{if(button)button.disabled=false;}
 }
 function unsavedForm(){
   if(document.querySelector('dialog[open] form'))return true;
   return [...document.querySelectorAll('#appPage input:not([type="file"]), #appPage textarea')].some(e=>{
     if(e.closest('[hidden]'))return false;
     return e.value!==e.defaultValue && e.type!=='search';
   });
 }
 async function apply(){
   if(!availableVersion)return;
   if(unsavedForm()&&!confirm('Kaydedilmemiş form bilgileri olabilir. Yine de uygulamayı yenilemek istiyor musun?'))return;
   const button=elBy('htApplyUpdate');button.disabled=true;status('Yeni sürümden yükleniyor...');
   try{
    if('serviceWorker' in navigator){
      const registration=await navigator.serviceWorker.getRegistration('/');
      if(registration)await registration.update();
    }
    // No API or finance record is cleared; browser requests the deployed assets.
    const target=new URL(window.location.href);target.searchParams.set('ht_version',availableVersion);
    window.location.replace(target.toString());
   }catch(err){status('Güncelleme açılamadı: '+err.message);button.disabled=false;}
 }
 elBy('htCheckUpdates')?.addEventListener('click',check);
 elBy('htApplyUpdate')?.addEventListener('click',apply);
 window.HTCheckUpdates=check;
})();
