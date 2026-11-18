'use strict';
// V26: account requests, read-only per-module users, admin approval and vault UI.
(function(){
 const labels={overview:'Genel Bakış',banking:'Bankalar / POS',cards:'Kredi Kartları',
  meal:'Yemek Kartları',platforms:'Platform Alacaklarım',people:'Şahıs Alacaklarım',
  payables:'Firma Borçlarım',directory:'Firma Temsilcileri',vault:'Kullanıcı İşlemleri'};
 const types={bank:'Banka',bank_pos:'Banka POS',payment:'Ödeme Kuruluşu',
  platform:'Platform',other:'Diğer'};
 const e=x=>esc(String(x??''));
 let members=[],vault=[],loadedVault=false,pinConfigured=false;
 const isUser=()=>window.HTIdentity?.role==='user';
 const admin=()=>window.HTIdentity?.role==='admin';
 const can=p=>!isUser()||(window.HTIdentity?.permissions||[]).includes(p);
 const visibleSection=s=>{
  if(s==='settings')return !isUser();
  if(s==='overview')return can('overview');
  if(s==='cardbank')return ['banking','cards','meal'].some(can);
  if(s==='accounts')return ['vault','platforms','people'].some(can);
  if(s==='firms')return ['payables','directory'].some(can);
  return true;
 };
 function applyPermissions(){
  el('v26UsersPanel').hidden=!admin();
  el('v26VaultNew').hidden=!admin();
  if(!isUser())return;
  document.querySelectorAll('[data-v18-section]').forEach(node=>{
   node.hidden=!visibleSection(node.dataset.v18Section);
  });
  document.querySelectorAll('[data-v18-sub]').forEach(node=>{
   node.hidden=!can(node.dataset.v18Sub);
  });
  document.querySelectorAll('[data-v8-accounts]').forEach(node=>{
   node.hidden=!can(node.dataset.v8Accounts);
  });
  document.querySelectorAll('[data-v18-link]').forEach(node=>{
   node.hidden=!can(node.dataset.v18Link);
  });
  document.querySelectorAll('[data-v26-open-vault]').forEach(node=>node.hidden=!can('vault'));
  const map={overview:'overview',banking:'banking',cards:'cards',meal:'meal',
   platforms:'platforms',people:'people',payables:'payables',directory:'directory',settings:'settings'};
  document.querySelectorAll('[data-mobile-tab]').forEach(node=>{
   const key=map[node.dataset.mobileTab];
   if(key)node.hidden=!can(key);
  });
  document.querySelectorAll('[data-v8-quick],[data-v18-quick]').forEach(node=>node.hidden=true);
  const initial=(window.HTIdentity.permissions||[]).find(p=>p!=='vault')||
   (can('vault')?'vault':null);
  const tabMap={overview:'overview',banking:'banking',cards:'cards',meal:'meal',
   platforms:'collections',people:'collections',vault:'collections',
   payables:'payables',directory:'directory'};
  if(!initial){
   el('pageTitle').textContent='Henüz yetkiniz yok';
   document.querySelectorAll('.view').forEach(v=>v.hidden=true);
   notice('Yöneticinin ekran yetkisi vermesi gerekiyor.',true);
  }else if(activeTab==='overview'&&!can('overview')){
   window.tab(tabMap[initial]||'overview');
   if(['vault','people','platforms'].includes(initial))
    document.querySelector('[data-v8-accounts="'+initial+'"]')?.click();
  }
 }
 function renderMembers(){
  const target=el('v26UsersList');if(!target||!admin())return;
  if(!members.length){target.innerHTML='<p class="muted">Henüz üyelik başvurusu yok.</p>';return;}
  target.innerHTML=members.map(m=>{
   const permissions=new Set(m.permissions||[]);
   const checks=Object.entries(labels).map(([id,label])=>
    '<label class="v26-permission"><input type="checkbox" name="permissions" value="'+e(id)+'"'+
    (permissions.has(id)?' checked':'')+'><span>'+e(label)+'</span></label>').join('');
   const options=[['pending','Onay bekliyor'],['approved','Onaylı'],['blocked','Engellendi']].map(([v,title])=>
    '<option value="'+v+'"'+(m.status===v?' selected':'')+'>'+title+'</option>').join('');
   return '<form class="v26-user-card" data-v26-user="'+e(m.id)+'">'+
    '<div class="v26-user-title"><div><strong>'+e(m.display_name)+'</strong>'+
    '<small>@'+e(m.username)+' · '+e(m.created_at||'')+'</small></div>'+
    '<label>Üyelik durumu<select name="status">'+options+'</select></label></div>'+
    '<p class="hint">İşaretlediğin bölümleri görebilir. Kayıtları sadece admin değiştirebilir. Şifre kasası erişimini özellikle kontrol et.</p>'+
    '<div class="v26-permission-grid">'+checks+'</div>'+
    '<button class="btn primary" type="submit">Yetkileri kaydet / Onayla</button></form>';
  }).join('');
 }
 async function loadMembers(){
  if(!admin())return;
  try{
   const res=await api('users');members=res.users||[];renderMembers();
   const pending=members.filter(x=>x.status==='pending').length;
   el('v26UsersStatus').textContent=pending?pending+' başvuru onay bekliyor.':
    members.length+' kullanıcı kaydı bulunuyor.';
  }catch(error){el('v26UsersStatus').textContent=error.message;}
 }
 async function copyVaultText(value){
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(value);return;}catch{}
  }
  const temp=document.createElement('textarea');
  temp.value=value;temp.setAttribute('readonly','');
  temp.style.position='fixed';temp.style.opacity='0';
  document.body.appendChild(temp);temp.focus();temp.select();
  const copied=document.execCommand('copy');temp.remove();
  if(!copied)throw new Error('Tarayıcı panoya erişime izin vermedi.');
 }
 function renderVault(){
  const target=el('v26VaultList');if(!target)return;
  if(!loadedVault){target.innerHTML='<p class="muted">Kayıtlar yükleniyor.</p>';return;}
  if(!vault.length){target.innerHTML='<p class="muted">Henüz kayıtlı banka veya platform giriş bilgisi yok.</p>';return;}
  target.innerHTML=vault.map(v=>'<article class="v26-vault-card">'+
   '<div class="v26-vault-header"><div><small>'+e(types[v.category]||'Hesap')+'</small>'+
   '<strong>'+e(v.institution_name)+'</strong><span>'+e(v.login_name||'Kullanıcı adı yok')+'</span></div>'+
   '<div class="row-actions">'+
    '<button type="button" class="mini-btn" data-v31-copy-user="'+e(v.id)+'"'+
      (!v.login_name?' disabled title="Önce kullanıcı adı ekleyin"':'')+'>Kullanıcı adını kopyala</button>'+
    '<button type="button" class="mini-btn" data-v26-reveal="'+e(v.id)+'"'+
      (!v.has_password?' disabled title="Önce giriş şifresi ekleyin"':'')+'>Şifreyi göster</button>'+
    '<button type="button" class="mini-btn" data-v28-copy="'+e(v.id)+'"'+
      (!v.has_password?' disabled title="Önce giriş şifresi ekleyin"':'')+'>Şifreyi kopyala (PIN)</button>'+
   (admin()?'<button type="button" class="mini-btn" data-v26-edit="'+e(v.id)+'">Düzenle</button>'+
    '<button type="button" class="mini-btn delete" data-v26-delete="'+e(v.id)+'">Sil</button>':'')+
   '</div></div>'+
   (v.login_url?'<a href="'+e(v.login_url)+'" rel="noopener noreferrer" target="_blank">'+e(v.login_url)+'</a>':'')+
   (v.notes?'<p>'+e(v.notes)+'</p>':'')+
   (!v.has_password?'<p class="v31-vault-missing">Şifre kaydedilmemiş. Düzenle bölümünden şifre eklediğinde PIN ile kopyalanabilir.</p>':'')+
   '<p class="v26-secret" id="v26-secret-'+e(v.id)+'" aria-live="polite"></p></article>').join('');
 }
 async function loadPinStatus(){
  if(!can('vault'))return;
  try{
   const status=await api('vault/pin');
   pinConfigured=!!status.configured;
   el('v28PinStatus').textContent=pinConfigured?'Şifreleri görmek veya kopyalamak için 4 haneli PIN gerekir.':'Kasa PIN’i henüz tanımlanmadı. Yönetici PIN oluşturana kadar şifreler açılamaz.';
   el('v28PinSetup').hidden=!admin();
   el('v28OldPinLabel').hidden=!pinConfigured;
   el('v28PinSetupForm').elements.old_pin.required=pinConfigured;
  }catch(error){el('v28PinStatus').textContent=error.message;}
 }
 async function loadVault(){
  if(!can('vault'))return;
  try{
   const data=await api('vault');vault=data.vault||[];loadedVault=true;
   el('v26VaultStatus').textContent=vault.length+' giriş kaydı';
   renderVault();
  }catch(err){
   el('v26VaultStatus').textContent=err.message;
   el('v26VaultList').innerHTML='';
  }
 }
 function openVault(id=''){
  if(!admin())return;
  const form=el('v26VaultForm');
  form.reset();
  const v=vault.find(x=>x.id===id);
  form.elements.id.value=v?.id||'';
  form.elements.category.value=v?.category||'bank';
  form.elements.institution_name.value=v?.institution_name||'';
  form.elements.login_name.value=v?.login_name||'';
  form.elements.login_url.value=v?.login_url||'';
  form.elements.notes.value=v?.notes||'';
  form.elements.password.value='';
  el('v26VaultPasswordHint').textContent=v?
   'Boş bırakırsan kayıtlı şifre değişmez. Şifreyi değiştirmek için yenisini yaz.':
   'Şifre kaydedildiğinde AES-GCM ile şifrelenir; anahtar Cloudflare Secret içinde tutulur.';
  el('v26VaultDialogTitle').textContent=v?'Giriş bilgisini düzenle':'Yeni banka / platform girişi';
  el('v26VaultDialog').showModal();
 }
 async function afterLoad(){
  applyPermissions();
  if(admin())loadMembers();
  if(can('vault')){loadPinStatus();loadVault();}
 }
 document.addEventListener('click',async event=>{
  const trigger=event.target.closest('#v26JoinToggle');
  if(trigger){el('v26RegisterForm').hidden=!el('v26RegisterForm').hidden;return;}
  if(event.target.closest('#v26VaultNew')){openVault();return;}
  if(event.target.closest('#v26VaultCancel')){el('v26VaultDialog').close();return;}
  const edit=event.target.closest('[data-v26-edit]');
  if(edit){openVault(edit.dataset.v26Edit);return;}
  const del=event.target.closest('[data-v26-delete]');
  if(del&&admin()){
   if(!confirm('Bu giriş bilgisini silmek istiyor musun?'))return;
   try{await api('vault/'+del.dataset.v26Delete,'DELETE');await loadVault();notice('Giriş bilgisi silindi.');}
   catch(err){notice(err.message,true);}return;
  }
  const copyUsername=event.target.closest('[data-v31-copy-user]');
  if(copyUsername&&can('vault')){
   const record=vault.find(row=>row.id===copyUsername.dataset.v31CopyUser);
   if(!record?.login_name){notice('Bu kayıtta kullanıcı adı bulunmuyor.',true);return;}
   try{
    await copyVaultText(record.login_name);
    notice('Kullanıcı adı kopyalandı.');
   }catch(error){notice('Kullanıcı adı kopyalanamadı: '+error.message,true);}
   return;
  }
  const reveal=event.target.closest('[data-v26-reveal]');
  const copy=event.target.closest('[data-v28-copy]');
  if((reveal||copy)&&can('vault')){
   const id=reveal?.dataset.v26Reveal||copy.dataset.v28Copy;
   if(!pinConfigured){notice('Önce yönetici 4 haneli kasa PIN’i oluşturmalı.',true);return;}
   const form=el('v28PinRevealForm');
   form.reset();form.elements.credential_id.value=id;
   form.elements.action.value=copy?'copy':'show';
   el('v28PinDialogTitle').textContent=copy?'PIN ile şifreyi kopyala':'PIN ile şifreyi göster';
   el('v28PinError').hidden=true;
   el('v28PinDialog').showModal();
   form.elements.pin.focus();
  }
 });
 el('v28PinCancel').addEventListener('click',()=>{el('v28PinRevealForm').reset();el('v28PinDialog').close();});
 el('v28PinSetupForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!admin())return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form));
   await api('vault/pin','POST',{pin:d.pin,...(pinConfigured?{old_pin:d.old_pin}:{})});
   form.reset();await loadPinStatus();notice('4 haneli kasa PIN’i kaydedildi.');
  }catch(err){el('v28PinStatus').textContent=err.message;}
  finally{button.disabled=false;}
 });
 el('v28PinRevealForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('[type="submit"]');
  const data=Object.fromEntries(new FormData(form));button.disabled=true;
  el('v28PinError').hidden=true;
  try{
   const response=await api('vault/'+data.credential_id+'/reveal','POST',{pin:data.pin});
   const password=response.password||'';
   el('v28PinDialog').close();form.reset();
   if(data.action==='copy'){
    if(!password){notice('Kayıtlı şifre yok.',true);return;}
    await copyVaultText(password);
    notice('Şifre panoya kopyalandı. Ortak bilgisayarda panoyu temizlemeyi unutma.');
   }else{
    const host=el('v26-secret-'+data.credential_id);
    if(!host)return;
    host.textContent='Şifre: '+(password||'(kayıt yok)');
    host.dataset.shown='1';
    setTimeout(()=>{host.textContent='';host.dataset.shown='0';},20000);
   }
  }catch(error){
   el('v28PinError').textContent=error.message;
   el('v28PinError').hidden=false;
  }finally{form.elements.pin.value='';button.disabled=false;}
 });
 el('v26RegisterForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');
  button.disabled=true;const status=el('v26RegisterStatus');
  try{
   const d=Object.fromEntries(new FormData(form));
   const res=await api('register','POST',d);
   status.textContent=res.message;form.elements.password.value='';
  }catch(err){status.textContent=err.message;}
  finally{button.disabled=false;}
 });
 el('v26UsersList').addEventListener('submit',async event=>{
  const form=event.target.closest('[data-v26-user]');if(!form)return;
  event.preventDefault();if(!admin())return;
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const d=new FormData(form);
   await api('users/'+form.dataset.v26User,'PATCH',{status:d.get('status'),permissions:d.getAll('permissions')});
   await loadMembers();notice('Üyelik ve ekran yetkileri güncellendi. Oturum izinleri yenilendi.');
  }catch(err){notice(err.message,true);button.disabled=false;}
 });
 el('v26VaultForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!admin())return;
  const form=event.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
   const d=Object.fromEntries(new FormData(form));
   const id=d.id;delete d.id;
   if(id&&!d.password)delete d.password;
   await api(id?'vault/'+id:'vault',id?'PATCH':'POST',d);
   form.elements.password.value='';
   el('v26VaultDialog').close();
   await loadVault();notice('Giriş bilgisi kaydedildi.');
  }catch(err){notice(err.message,true);}
  finally{submit.disabled=false;}
 });
 // The account tab is preferred if it is the only granted account permission.
 window.HTV26={afterLoad,renderVault,loadVault,applyPermissions,
  preferredAccountTab:()=>['vault','people','platforms'].find(can)||'platforms'};
})();
