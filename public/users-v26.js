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
  if(s==='settings')return !isUser()||can('vault')||can('payables');
  if(s==='overview')return can('overview');
  if(s==='cardbank')return ['banking','cards','meal'].some(can);
  if(s==='accounts')return ['platforms','people'].some(can);
  if(s==='firms')return ['payables','directory'].some(can);
  return true;
 };
 function applyPermissions(){
  // A session switching away from admin must not retain a prior roster in the DOM.
  if(!admin()){
   members=[];
   const roster=el('v69MembersShortcut');if(roster)roster.hidden=true;
   el('v84ApprovedMembers')?.replaceChildren();
   el('v84MembersCounts')?.replaceChildren();
  }
  el('v26UsersPanel').hidden=!admin();
  el('v26VaultNew').hidden=!admin();
  el('v43VaultImport').hidden=!admin();
  el('v44ImageImport').hidden=true; // Image OCR remains disabled; only single JSON import is visible.
  if(!isUser()){
   // Restore the administrator Settings widgets after a restricted-user session.
   const view=el('settingsView');
   if(view)for(const child of view.children)child.hidden=false;
   for(const id of ['v68UserAccountsTile','v68BillsTile','v69MembersShortcut','v67UpdateTile']){
    const tile=el(id);if(tile)tile.hidden=false;
   }
   return;
  }
   const settingsView=el('settingsView');
   if(settingsView)for(const child of settingsView.children){
    if(!child.classList.contains('v67-settings-shortcuts'))child.hidden=true;
   }
   const update=el('v67UpdateTile');if(update)update.hidden=true;
   const usersEntry=el('v68UserAccountsTile');if(usersEntry)usersEntry.hidden=!can('vault');
   const membersLink=el('v69MembersShortcut');if(membersLink)membersLink.hidden=true;
   const billsEntry=el('v68BillsTile');if(billsEntry)billsEntry.hidden=!can('payables');
  document.querySelectorAll('[data-v18-section]').forEach(node=>{
   node.hidden=!visibleSection(node.dataset.v18Section);
  });
  document.querySelectorAll('[data-v18-sub]').forEach(node=>{
   // Firma Hareketleri reuses the existing Firma Borçlarım permission.
   // No extra user entitlement is silently granted.
   const permission=['firmactivity','bills'].includes(node.dataset.v18Sub)?'payables':node.dataset.v18Sub;
   node.hidden=!can(permission);
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
   platforms:'collections',people:'collections',vault:'vault',
   payables:'payables',directory:'directory'};
  if(!initial){
   el('pageTitle').textContent='Henüz yetkiniz yok';
   document.querySelectorAll('.view').forEach(v=>v.hidden=true);
   notice('Yöneticinin ekran yetkisi vermesi gerekiyor.',true);
  }else if(activeTab==='overview'&&!can('overview')){
   window.tab(tabMap[initial]||'overview');
   if(['people','platforms'].includes(initial))
    document.querySelector('[data-v8-accounts="'+initial+'"]')?.click();
  }
 }
 function renderMembersSummary(){
  // Only admin /api/users data is used. Render names as text, never as HTML.
  const counts=el('v84MembersCounts'),list=el('v84ApprovedMembers');
  if(!admin()||!counts||!list)return;
  const approved=members.filter(m=>m.status==='approved');
  const pending=members.filter(m=>m.status==='pending');
  const blocked=members.filter(m=>m.status==='blocked');
  counts.replaceChildren();
  const badge=(text,tone)=>{
   const span=document.createElement('span');span.className='v84-count v84-count-'+tone;
   span.textContent=text;counts.append(span);
  };
  badge(approved.length+' onaylı','approved');
  badge(pending.length+' bekliyor','pending');
  badge(blocked.length+' engelli','blocked');
  list.replaceChildren();
  if(!approved.length){
   const li=document.createElement('li');li.className='v84-member-empty';
   li.textContent='Henüz onaylı üye yok. Yönetici hesabı bu listeye dahil değildir.';
   list.append(li);return;
  }
  approved.slice(0,6).forEach(m=>{
   const li=document.createElement('li');li.className='v84-member-row';
   const avatar=document.createElement('span');avatar.className='v84-member-avatar';
   avatar.setAttribute('aria-hidden','true');
   avatar.textContent=String(m.display_name||m.username||'?').trim().charAt(0).toLocaleUpperCase('tr-TR');
   const info=document.createElement('span');info.className='v84-member-info';
   const name=document.createElement('strong');name.textContent=String(m.display_name||m.username||'Üye');
   const handle=document.createElement('small');handle.textContent='@'+String(m.username||'');
   info.append(name,handle);
   const status=document.createElement('span');status.className='v84-member-approved';
   status.textContent='Onaylı';
   li.append(avatar,info,status);list.append(li);
  });
  if(approved.length>6){
   const more=document.createElement('li');more.className='v84-member-empty';
   more.textContent='+'+(approved.length-6)+' onaylı üye daha. Tam listeyi Üyeleri yönet bölümünde gör.';
   list.append(more);
  }
 }
 function permissionForm(m){
  const permissions=new Set(m.permissions||[]);
  const checks=Object.entries(labels).map(([id,label])=>
   '<label class="v26-permission"><input type="checkbox" name="permissions" value="'+e(id)+'"'+
   (permissions.has(id)?' checked':'')+'><span>'+e(label)+'</span></label>').join('');
  const options=[['pending','Onay bekliyor'],['approved','Onaylı'],['blocked','Engellendi']].map(([v,name])=>
   '<option value="'+v+'"'+(m.status===v?' selected':'')+'>'+name+'</option>').join('');
  return '<form class="v26-user-card v85-permission-form" data-v26-user="'+e(m.id)+'">'+
   '<div class="v85-permission-identity"><strong>'+e(m.display_name||m.username)+'</strong>'+
   '<small>@'+e(m.username)+' · '+e(m.created_at||'')+'</small></div>'+
   '<label class="v85-status-picker">Üyelik durumu<select name="status">'+options+'</select></label>'+
   '<p class="hint">Ekran yetkilerini seç. Finans kayıtlarını yalnız yönetici değiştirir. Şifre kasası erişimini ayrıca kontrol et.</p>'+
   '<div class="v26-permission-grid">'+checks+'</div>'+
   '<div class="v38-user-actions"><button class="btn primary" type="submit">Yetkileri kaydet / Onayla</button>'+
   '<button class="btn subtle v38-user-delete" type="button" data-v38-delete-user="'+e(m.id)+'" aria-label="'+
   e(m.display_name||m.username)+' kullanıcısını sil">Kullanıcıyı Sil</button></div></form>';
 }
 function renderMembers(){
  const target=el('v26UsersList');if(!target||!admin())return;
  const order={pending:0,approved:1,blocked:2},statuses={pending:'Onay Bekliyor',approved:'Onaylı',blocked:'Engellendi'};
  target.innerHTML=members.slice().sort((a,b)=>(order[a.status]??3)-(order[b.status]??3)).map(m=>
   '<article class="v85-member-card" data-v85-member-id="'+e(m.id)+'">'+
   '<span class="v85-member-avatar" aria-hidden="true">'+e(String(m.display_name||m.username||'?').trim().charAt(0).toLocaleUpperCase('tr-TR'))+'</span>'+
   '<div class="v85-member-person"><strong>'+e(m.display_name||m.username)+'</strong>'+
   '<small>@'+e(m.username)+'</small>'+
   '<span class="v85-member-status v85-status-'+e(m.status)+'">'+e(statuses[m.status]||m.status)+'</span></div>'+
   '<button type="button" class="v85-member-gear" data-v85-permissions="'+e(m.id)+'" aria-haspopup="dialog" aria-label="'+e(m.display_name||m.username)+' kullanıcısının yetkilerini düzenle">⚙️</button>'+
   '</article>').join('')+
   '<dialog id="v85PermissionsDialog" class="v85-permissions-dialog" aria-labelledby="v85PermissionsTitle">'+
   '<div class="v85-permissions-top"><div><p class="v85-permission-eyebrow">ÜYE VE YETKİLER</p><h2 id="v85PermissionsTitle">⚙️ Üye Yetkileri</h2></div>'+
   '<button type="button" data-v85-close-permissions aria-label="Yetki penceresini kapat">×</button></div>'+
   '<div id="v85PermissionsContents"></div></dialog>';
  if(!members.length){
   const empty=document.createElement('p');empty.className='v85-no-members';
   empty.textContent='Henüz üyelik başvurusu yok.';target.prepend(empty);
  }
  renderMembersSummary();
 }
 async function loadMembers(){
  if(!admin())return;
  try{
   const res=await api('users');members=res.users||[];renderMembers();
   const pending=members.filter(x=>x.status==='pending').length;
   el('v26UsersStatus').textContent=pending?pending+' başvuru onay bekliyor.':
    members.length+' kullanıcı kaydı bulunuyor.';
  }catch(error){
   el('v26UsersStatus').textContent=error.message;
   const count=el('v84MembersCounts'),list=el('v84ApprovedMembers');
   if(count)count.textContent='Üye bilgileri alınamadı. Üyeleri yönet bölümünden tekrar deneyin.';
   if(list)list.replaceChildren();
 }
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
  const query=String(el('v69VaultSearch')?.value||'').toLocaleLowerCase('tr-TR').trim();
  const rows=query?vault.filter(v=>[v.institution_name,v.login_name,types[v.category],v.notes]
   .join(' ').toLocaleLowerCase('tr-TR').includes(query)):vault;
  if(!rows.length){target.innerHTML='<p class="muted">Aramana uygun giriş kaydı bulunamadı.</p>';return;}
  target.innerHTML=rows.map(v=>'<article class="v26-vault-card">'+
    '<div class="v26-vault-header"><div><small>'+e(types[v.category]||'Hesap')+'</small>'+
    '<strong>'+e(v.institution_name)+'</strong></div>'+
    '<div class="row-actions">'+
    (admin()?'<button type="button" class="mini-btn" data-v26-edit="'+e(v.id)+'">Düzenle</button>'+
    '<button type="button" class="mini-btn delete" data-v26-delete="'+e(v.id)+'">Sil</button>':'')+
    '</div></div>'+
    '<div class="v32-credentials">'+
      '<div class="v32-credential"><div><strong>Kullanıcı adı</strong><span>'+e(v.login_name||'Eklenmedi')+'</span></div>'+
       '<button type="button" class="mini-btn" data-v31-copy-user="'+e(v.id)+'"'+
       (!v.login_name?' disabled':'')+'>Kopyala</button></div>'+
      '<div class="v32-credential"><div><strong>Şifre</strong><span>'+ (v.has_password?'••••••••':'Eklenmedi') +'</span></div>'+
       '<button type="button" class="mini-btn" data-v32-password-copy="'+e(v.id)+'"'+
       (!v.has_password?' disabled':'')+'>Kopyala</button></div>'+
      (v.extra_fields||[]).map(field=>'<div class="v32-credential"><div><strong>'+e(field.label)+'</strong>'+
       '<span>'+(field.has_value?'••••••••':'Eklenmedi')+'</span></div>'+
       '<button type="button" class="mini-btn" data-v32-field-copy="'+e(field.id)+'" data-v32-parent="'+e(v.id)+'"'+
       (!field.has_value?' disabled':'')+'>Kopyala</button></div>').join('')+
    '</div>'+
    (v.login_url?'<a href="'+e(v.login_url)+'" rel="noopener noreferrer" target="_blank">'+e(v.login_url)+'</a>':'')+
    (v.notes?'<details class="v43-vault-about"><summary>Hakkında</summary><div>'+e(v.notes)+'</div></details>':'')+'</article>').join('');
 }
 function addVaultField(field={}){
  const host=el('v32FieldsEditor');if(!host)return;
  if(host.children.length>=20){notice('En fazla 20 ek alan oluşturabilirsin.',true);return;}
  const row=document.createElement('div');
  row.className='v32-extra-row';
  if(field.id)row.dataset.id=field.id;
  row.innerHTML='<label>Alan adı<input class="v32-extra-label" maxlength="60" required placeholder="Örn. Admin, Parola" value="'+e(field.label||'')+'"></label>'+
    '<label>Alan türü<select class="v32-extra-kind"><option value="text"'+(field.kind==='text'?' selected':'')+'>Normal alan</option>'+
    '<option value="secret"'+(field.kind!=='text'?' selected':'')+'>Gizli alan</option></select></label>'+
    '<label>Değer<input class="v32-extra-value" type="'+(field.kind==='text'?'text':'password')+
      '" maxlength="500" autocomplete="off" placeholder="'+(field.id?'Kayıtlı; değiştirmek için yaz':'Alan değerini gir')+'"'+
      (field.id?'':' required')+'></label>'+
    '<button type="button" class="mini-btn delete v32-remove-field" aria-label="Alanı kaldır">Kaldır</button>';
  row.querySelector('.v32-extra-kind').addEventListener('change',event=>{
   row.querySelector('.v32-extra-value').type=event.target.value==='secret'?'password':'text';
  });
  host.appendChild(row);
 }
 function collectVaultFields(){
  return [...el('v32FieldsEditor').querySelectorAll('.v32-extra-row')].map(row=>({
   ...(row.dataset.id?{id:row.dataset.id}:{}),
   label:row.querySelector('.v32-extra-label').value.trim(),
   kind:row.querySelector('.v32-extra-kind').value,
   value:row.querySelector('.v32-extra-value').value
  }));
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
  el('v32FieldsEditor').innerHTML='';
  for(const field of v?.extra_fields||[])addVaultField(field);
  el('v26VaultPasswordHint').textContent=v?
   'Boş bırakırsan kayıtlı şifre değişmez. Şifreyi değiştirmek için yenisini yaz.':
   'Şifre kaydedildiğinde AES-GCM ile şifrelenir; anahtar Cloudflare Secret içinde tutulur.';
  el('v26VaultDialogTitle').textContent=v?'Giriş bilgisini düzenle':'Yeni banka / platform girişi';
  el('v26VaultDialog').showModal();
 }
 function importImageDraft(raw){
  if(!admin())return;
  const d=raw||{};
  openVault(); // New record only; never overwrite an existing credential automatically.
  const form=el('v26VaultForm');
  form.elements.category.value=['bank','bank_pos','payment','platform','other'].includes(d.category)?d.category:'platform';
  form.elements.institution_name.value=String(d.institution_name||'').slice(0,120);
  form.elements.login_name.value=String(d.login_name||'').slice(0,120);
  form.elements.login_url.value=String(d.login_url||'').slice(0,500);
  form.elements.password.value=String(d.password||'').slice(0,500);
  form.elements.notes.value=String(d.notes||'').slice(0,12000);
  el('v26VaultDialogTitle').textContent='Resimden yeni giriş bilgisi';
  const duplicate=vault.some(x=>String(x.institution_name||'').trim().toLocaleLowerCase('tr-TR')===
   form.elements.institution_name.value.trim().toLocaleLowerCase('tr-TR'));
  if(duplicate)notice('Bu kurum adına ait bir kayıt zaten var. Yanlışlıkla çift kayıt açmamak için kontrol et.',true);
  else notice('Fotoğraftan okunan bilgileri özellikle şifreyi kontrol edip Kaydet.');
 }
 async function afterLoad(){
  applyPermissions();
  window.HTSettingsGrid?.applyRole?.();
  if(admin())loadMembers();
  if(can('vault'))loadVault();
 }
 document.addEventListener('input',event=>{if(event.target?.id==='v69VaultSearch')renderVault();});
 document.addEventListener('click',async event=>{
  const gear=event.target.closest('[data-v85-permissions]');
  if(gear&&admin()){
   const member=members.find(m=>String(m.id)===gear.dataset.v85Permissions);
   const dialog=el('v85PermissionsDialog'),contents=el('v85PermissionsContents');
   if(member&&dialog&&contents){contents.innerHTML=permissionForm(member);dialog.showModal();}
   return;
  }
  if(event.target.closest('[data-v85-close-permissions]')){el('v85PermissionsDialog')?.close();return;}
  const trigger=event.target.closest('#v26JoinToggle');
  if(trigger){el('v26RegisterForm').hidden=!el('v26RegisterForm').hidden;return;}
  if(event.target.closest('#v26VaultNew')){openVault();return;}
  if(event.target.closest('#v43VaultImport')&&admin()){
   const input=el('v43VaultImportFile');input.value='';input.click();return;
  }
  if(event.target.closest('#v26VaultCancel')){el('v26VaultDialog').close();return;}
  const edit=event.target.closest('[data-v26-edit]');
  if(edit){openVault(edit.dataset.v26Edit);return;}
  const deleteMember=event.target.closest('[data-v38-delete-user]');
  if(deleteMember&&admin()){
   const record=members.find(x=>x.id===deleteMember.dataset.v38DeleteUser);
   if(!record)return;
   if(!confirm('“'+record.display_name+'” (@'+record.username+') kullanıcı hesabı kalıcı olarak silinsin mi? Kullanıcı artık giriş yapamaz. Finans kayıtları silinmez.'))return;
   deleteMember.disabled=true;
   try{
    await api('users/'+record.id,'DELETE');
    await loadMembers();
    notice('Kullanıcı silindi. Açık kullanıcı oturumları geçersiz kılındı; finans kayıtları korundu.');
   }catch(err){notice(err.message,true);deleteMember.disabled=false;}
   return;
  }
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
  const copyPassword=event.target.closest('[data-v32-password-copy]');
  const copyField=event.target.closest('[data-v32-field-copy]');
  if((copyPassword||copyField)&&can('vault')){
   const button=copyPassword||copyField;
   const recordId=copyPassword?.dataset.v32PasswordCopy||copyField.dataset.v32Parent;
   const fieldId=copyField?.dataset.v32FieldCopy;
   button.disabled=true;
   try{
    const endpoint=fieldId?'vault/'+recordId+'/fields/'+fieldId+'/reveal':'vault/'+recordId+'/reveal';
    const result=await api(endpoint,'POST',{});
    const value=fieldId?result.value:result.password;
    if(!value){notice('Kayıtlı değer yok.',true);return;}
    await copyVaultText(value);
    notice('Giriş bilgisi kopyalandı. Paylaşılan cihazlarda panoyu temizle.');
   }catch(error){notice(error.message,true);}
   finally{button.disabled=false;}
   return;
  }
  if(event.target.closest('#v32AddField')){addVaultField();return;}
  const remove=event.target.closest('.v32-remove-field');
  if(remove){remove.closest('.v32-extra-row')?.remove();return;}
 });
 // A JSON import only prepares the editor. No credentials are committed to
 // public source code or sent to the server until the admin presses Kaydet.
 document.addEventListener('change',async event=>{
  if(event.target.id!=='v43VaultImportFile')return;
  const file=event.target.files?.[0];
  if(!file||!admin())return;
  try{
   if(file.size>65536)throw new Error('Dosya en fazla 64 KB olabilir.');
   const raw=JSON.parse(await file.text());
   if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('Tek bir giriş kaydı içeren JSON dosyası seç.');
   const name=String(raw.institution_name||'').trim();
   if(!name||name.length>120)throw new Error('Kurum / platform adı gerekli (en fazla 120 karakter).');
   const about=String(raw.notes||'');
   if(about.length>12000)throw new Error('Hakkında alanı en fazla 12.000 karakter olabilir.');
   const username=String(raw.login_name||'');
   const url=String(raw.login_url||'');
   const password=raw.password==null?'':String(raw.password);
   if(username.length>120||url.length>500||password.length>500)
    throw new Error('Giriş bilgisi alanlarından biri çok uzun.');
   const category=['bank','bank_pos','payment','platform','other'].includes(raw.category)
    ?raw.category:'other';
   const existing=vault.find(v=>String(v.institution_name||'').trim().toLocaleLowerCase('tr-TR')===
    name.toLocaleLowerCase('tr-TR'));
   openVault(existing?.id||'');
   const form=el('v26VaultForm');
   form.elements.category.value=category;
   form.elements.institution_name.value=name;
   form.elements.login_name.value=username;
   form.elements.login_url.value=url;
   form.elements.notes.value=about;
   form.elements.password.value=password;
   notice(existing?'Mevcut kayıt düzenlemeye açıldı. Değişiklikleri kontrol edip Kaydet.':
    'Kayıt formu dolduruldu. Bilgileri kontrol edip Kaydet.');
  }catch(error){
   notice('JSON içe aktarılamadı: '+error.message,true);
  }finally{event.target.value='';}
 });
 el('v26RegisterForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');
  button.disabled=true;const status=el('v26RegisterStatus');
  try{
   status.textContent='';
   const d=Object.fromEntries(new FormData(form));
   d.username=String(d.username||'').trim().normalize('NFC').toLocaleLowerCase('tr-TR');
   if(d.username==='admin')throw new Error('admin adı yalnızca yöneticiye aittir. Başka kullanıcı adı seç.');
   if(!/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,39}$/u.test(d.username))
    throw new Error('Kullanıcı adı 3-40 karakter olmalı: Türkçe harf, rakam, nokta, tire veya alt çizgi; boşluk olmamalı.');
   if(String(d.password||'').length<8||String(d.password||'').length>128)
    throw new Error('Şifre 8-128 karakter olmalı.');
   const res=await api('register','POST',d);
   status.textContent=res.message||'Başvurun alındı. Yönetici onayını bekle.';
   status.dataset.state='success';
   form.elements.password.value='';
  }catch(err){status.textContent=err.message;status.dataset.state='error';}
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
   d.extra_fields=collectVaultFields();
   await api(id?'vault/'+id:'vault',id?'PATCH':'POST',d);
   form.elements.password.value='';
   el('v26VaultDialog').close();
   await loadVault();notice('Giriş bilgisi kaydedildi.');
  }catch(err){notice(err.message,true);}
  finally{submit.disabled=false;}
 });
 // The account tab is preferred if it is the only granted account permission.
 window.HTV26={afterLoad,renderVault,loadVault,applyPermissions,importImageDraft,
  can,preferredAccountTab:()=>['platforms','people'].find(can)||'platforms'};
})();
