'use strict';
// v85 settings navigation: presentation-only routing over existing functional
// DOM controls. Never clone form nodes or write data; /api/users stays admin-only.
(function(){
 const view=document.getElementById('settingsView');
 const hub=document.getElementById('v85SettingsHub');
 const header=document.getElementById('v85SettingsDetail');
 if(!view||!hub||!header)return;
 const title=document.getElementById('v85SettingsDetailTitle');
 const subtitle=document.getElementById('v85SettingsDetailDescription');
 const center=document.getElementById('v60Center');
 const screens={
  control:['İşletme Kontrol Merkezi','Mevcut 20 kontrol aracını bölüm bölüm aç.'],
  cards:['Kart ve Ekstre','Kredi kartı önerileri ve PDF ekstre ön kontrolü.'],
  banks:['Banka ve POS','POS mutabakatı, banka/kasa ve firma bakiye kontrolü.'],
  reports:['Raporlar','Filtreli PDF ve Excel raporları, vade ve nakit akışı.'],
  security:['Güvenlik','PIN, cihaz kilidi ve kullanım kılavuzu.'],
  logos:['Marka Logoları','Mevcut banka, platform, firma ve kurum logoları.'],
  updates:['Güncellemeler','Yayınlanan sürümler ve uygulama kurulumu.']
 };
 const route={
  vault:'vault',bills:'bills',members:'useraccounts'
 };
 const admin=()=>window.HTIdentity?.role==='admin';
 const groups=['control','control','control','cards','cards','banks','banks','banks',
  'control','control','control','control','reports','reports','reports','reports',
  'reports','reports','control','control'];
 const tools=[...center.querySelectorAll('.v60-tool')];
 tools.forEach((tool,i)=>{tool.dataset.v85Group=groups[i]||'control';});
 const links=document.getElementById('htSettingsLinks')?.closest('.ht-settings-panel');
 const registered=document.getElementById('htSettingsRegistered')?.closest('.ht-settings-panel');
 const newInstitution=document.querySelector('#settingsView .ht-settings-new');
 const correction=document.querySelector('#settingsView .v13-correction-panel');
 for(const item of [links,registered,newInstitution]){
  if(item)item.dataset.v85Slot='logos';
 }
 if(correction)correction.dataset.v85Slot='control';
 function applyRole(){
  const allowed=admin();
  if(!allowed){
   hub.hidden=true;
   delete view.dataset.v85Screen;
   header.hidden=true;
   return;
  }
  if(!view.dataset.v85Screen)view.dataset.v85Screen='home';
  hub.hidden=view.dataset.v85Screen!=='home';
  header.hidden=view.dataset.v85Screen==='home';
  // applyPermissions() restores legacy Settings children before calling us.
  // Do not let that restoration expose a stale detail heading on the home grid.
  header.hidden=view.dataset.v85Screen==='home';
 }
 function home(){
  if(!admin())return;
  view.dataset.v85Screen='home';
  hub.hidden=false;
  header.hidden=true;
  if(center)center.open=false;
  window.scrollTo({top:0,behavior:'auto'});
 }
 function open(target){
  if(!admin()||!target)return;
  if(route[target]){
   window.tab(route[target]);
   window.scrollTo({top:0,behavior:'auto'});
   return;
  }
  if(!Object.prototype.hasOwnProperty.call(screens,target))return;
  const [heading,description]=screens[target];
  view.dataset.v85Screen=target;
  hub.hidden=true;
  title.textContent=heading;
  subtitle.textContent=description;
  header.hidden=false;
  if(center)center.open=['control','cards','banks','reports'].includes(target);
  if(target==='logos'){
   const logo=document.getElementById('htLogoPanel');
   if(logo)logo.open=true;
  }
  window.scrollTo({top:0,behavior:'auto'});
 }
 document.addEventListener('click',event=>{
  const tile=event.target.closest('[data-v85-settings]');
  if(tile){open(tile.dataset.v85Settings);return;}
  if(event.target.closest('[data-v85-settings-back]')){
   home();return;
  }
 });
 // A user revisiting Settings always sees the main 10-card menu, rather than
 // unexpectedly returning deep into a hidden control tool. No route data saved.
 const oldTab=window.tab;
 if(typeof oldTab==='function'){
  window.tab=function(name){
   oldTab(name);
   if(name==='settings'&&admin())home();
  };
 }
 window.HTSettingsGrid={applyRole,home,open,groups:()=>groups.slice()};
 applyRole();
})();