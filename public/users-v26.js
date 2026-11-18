'use strict';
// V26: account requests, read-only per-module users, admin approval and vault UI.
(function(){
 const labels={overview:'Genel Bakış',banking:'Bankalar / POS',cards:'Kredi Kartları',
  meal:'Yemek Kartları',platforms:'Platform Alacaklarım',people:'Şahıs Alacaklarım',
  payables:'Firma Borçlarım',directory:'Firma Temsilcileri',vault:'Kullanıcı İşlemleri'};
 const types={bank:'Banka',bank_pos:'Banka POS',payment:'Ödeme Kuruluşu',
  platform:'Platform',other:'Diğer'};
 const e=x=>esc(String(x??''));
 let members=[],vault=[],loadedVault=false;
 const isUser=()=>window.HTIdentity?.role==='user';
 const admin=()=>window.HTIdentity?.role==='admin';
 const can=p=>!isUser()||(window.HTIdentity?.permissions||[]).includes(p);
 const visibleSection=s=>{
  if(s==='settings')return !isUser();
  if(s==='overview')return can('overview');
  if(s==='cardbank')return ['banking','cards','meal'].some(can);
  if(s==='accounts')return ['platforms','people','vault'].some(can);
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
 function renderVault(){
  const target=el('v26VaultList');if(!target)return;
  if(!loadedVault){target.innerHTML='<p class="muted">Kayıtlar yükleniyor.</p>';return;}
  if(!vault.length){target.innerHTML='<p class="muted">Henüz kayıtlı banka veya platform giriş bilgisi yok.</p>';return;}
  target.innerHTML=vault.map(v=>'<article class="v26-vault-card">'+
   '<div class="v26-vault-header"><div><small>'+e(types[v.category]||'Hesap')+'</small>'+
   '<strong>'+e(v.institution_name)+'</strong><span>'+e(v.login_name||'Kullanıcı adı yok')+'</span></div>'+
   '<div class="row-actions">'+(v.has_password?
    '<button type="button" class="mini-btn" data-v26-reveal="'+e(v.id)+'">Şifreyi göster</button>':'')+
   (admin()?'<button type="button" class="mini-btn" data-v26-edit="'+e(v.id)+'">Düzenle</button>'+
    '<button type="button" class="mini-btn delete" data-v26-delete="'+e(v.id)+'">Sil</button>':'')+
   '</div></div>'+
   (v.login_url?'<a href="'+e(v.login_url)+'" rel="noopener noreferrer" target="_blank">'+e(v.login_url)+'</a>':'')+
   (v.notes?'<p>'+e(v.notes)+'</p>':'')+
   '<p class="v26-secret" id="v26-secret-'+e(v.id)+'" aria-live="polite"></p></article>').join('');
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
  if(can('vault'))loadVault();
 }
 document.addEventListener('click',async event=>{
  const trigger=event.target.closest('#v26JoinToggle');
  if(trigger){el('v26RegisterForm').hidden=!el('v26RegisterForm').hidden;return;}
  const go=event.target.closest('[data-v26-open-vault]');
  if(go){if(!can('vault'))return;window.tab('collections');
   document.querySelector('[data-v8-accounts="vault"]')?.click();return;}
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
  const reveal=event.target.closest('[data-v26-reveal]');
  if(reveal&&can('vault')){
   const id=reveal.dataset.v26Reveal,host=el('v26-secret-'+id);
   if(host.dataset.shown==='1'){host.textContent='';host.dataset.shown='0';return;}
   reveal.disabled=true;
   try{
    const data=await api('vault/'+id+'/reveal','POST',{});
    host.textContent='Şifre: '+(data.password||'(kayıt yok)');
    host.dataset.shown='1';
    setTimeout(()=>{if(host.dataset.shown==='1'){host.textContent='';host.dataset.shown='0';}},20000);
   }catch(err){notice(err.message,true);}
   finally{reveal.disabled=false;}
  }
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
  preferredAccountTab:()=>['platforms','vault','people'].find(can)||'platforms'};
})();
