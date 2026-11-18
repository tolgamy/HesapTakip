'use strict';
// V21: user-selected catalog shared by every device through D1.
// Turning off a choice only removes it from NEW forms; no old record is edited.
(function(){
 const safe=x=>esc(String(x??''));
 const key=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
 // About 20 familiar, relevant institutions are available initially.
 // All other providers stay searchable in Settings and can be enabled individually.
 const defaults=new Set(['akbank','garanti','garanti-bbva','isbank','ziraat','vakifbank',
  'halkbank','yapikredi','qnb','denizbank','teb','enpara','ing','fibabanka',
  'kuveytturk','kuveyt-turk','albaraka','turkiyefinans','odeabank',
  'paytr','iyzico','garanti-odeme','tami']);
 const catalogs={
  bank:'Bankalar',payment:'Ödeme kuruluşları / POS',
  meal:'Yemek kartları',platform:'Platformlar'
 };
 const institutions=()=>state.institutions||[];
 const pref=(group,itemKey)=>(state.catalogPrefs||[]).find(p=>p.group_key===group&&p.item_key===itemKey);
 const usedInstitutions=()=>new Set([
  ...(state.accounts||[]).map(a=>a.institution_id),
  ...(state.cards||[]).map(c=>c.institution_id),
  ...(state.firms||[]).map(f=>f.payout_institution_id)
 ].filter(Boolean));
 const usedNames=group=>new Set((state.firms||[])
  .filter(f=>f.category==='receivable'&&f.receivable_group===group).map(f=>key(f.name)));
 const isInstitutionAllowed=i=>{
  if(!i||!i.is_active)return false;
  const chosen=pref(i.type,i.id);
  return chosen?chosen.enabled===1||chosen.enabled===true:
    defaults.has(i.id)||usedInstitutions().has(i.id)||!!i.is_custom;
 };
 const isNameAllowed=(group,name)=>{
  const p=pref(group,key(name));
  if(p)return p.enabled===1||p.enabled===true;
  return ((window.v9ReceivablePresets?.[group]||[]).some(([n])=>key(n)===key(name)))||
    usedNames(group).has(key(name));
 };
 const sourceRows=group=>{
  if(group==='bank'||group==='payment')
   return institutions().filter(i=>i.type===group).map(i=>({
    key:i.id,name:i.name,enabled:isInstitutionAllowed(i),available:!!i.is_active,kind:'institution',item:i
   }));
  const rows=new Map();
  for(const [name] of window.v9ReceivablePresets?.[group]||[])
   rows.set(key(name),{key:key(name),name,kind:'name'});
  for(const firm of (state.firms||[]).filter(f=>f.category==='receivable'&&f.receivable_group===group))
   if(!rows.has(key(firm.name)))rows.set(key(firm.name),{key:key(firm.name),name:firm.name,kind:'name'});
  for(const p of (state.catalogPrefs||[]).filter(p=>p.group_key===group)){
   const old=rows.get(p.item_key);
   rows.set(p.item_key,{...old,key:p.item_key,name:p.display_name,kind:'name'});
  }
  return [...rows.values()].map(row=>({...row,enabled:isNameAllowed(group,row.name),available:true}));
 };
 function init(){
  const view=el('settingsView'),header=view?.querySelector('.section-head');
  if(!header||el('v21CatalogManager'))return;
  header.insertAdjacentHTML('afterend',[
   '<section class="ht-settings-panel v21-catalog-manager" id="v21CatalogManager">',
   '<div class="ht-settings-heading"><span class="ht-settings-heading-icon">✓</span>',
   '<div><h3>Kullandığım kurum ve firma listeleri</h3>',
   '<p>Yalnızca burada açık bıraktıkların yeni banka, POS, yemek kartı ve platform kayıtlarında seçilir. Geçmiş kayıtların değişmez.</p></div></div>',
   '<div class="v21-catalog-tools"><div><label for="v21CatalogCategory">Listeyi seç</label>',
   '<select id="v21CatalogCategory"><option value="bank">Bankalar</option>',
   '<option value="payment">Ödeme kuruluşları / POS</option>',
   '<option value="meal">Yemek kartları</option><option value="platform">Platformlar</option></select></div>',
   '<div><label for="v21CatalogSearch">İsim ara</label>',
   '<input type="search" id="v21CatalogSearch" placeholder="Örn. PayTR, Kuveyt Türk, Pluxee"></div></div>',
   '<label class="v21-show-all"><input type="checkbox" id="v21CatalogShowAll">',
   'Tüm kuruluşları göster (kapalı olanlar dahil)</label>',
   '<div id="v21CatalogList" class="v21-catalog-list" aria-live="polite"></div>',
   '<div class="v21-catalog-bottom"><button type="button" class="btn secondary" id="v21CatalogAdd">',
   '+ Yeni kurum / firma ekle</button>',
   '<span class="hint" id="v21CatalogCount" role="status"></span></div></section>'
  ].join(''));
 }
 function render(){
  init();
  const host=el('v21CatalogList');if(!host)return;
  const group=el('v21CatalogCategory').value;
  const term=key(el('v21CatalogSearch').value);
  const showAll=el('v21CatalogShowAll').checked;
  const rows=sourceRows(group).filter(r=>(showAll||!!term||r.enabled)&&
    (!term||key(r.name).includes(term))).sort((a,b)=>Number(b.enabled)-Number(a.enabled)||
    a.name.localeCompare(b.name,'tr'));
  host.innerHTML=rows.length?rows.slice(0,70).map(r=>
   '<div class="v21-catalog-row">'+
   '<label class="v21-catalog-toggle"><input type="checkbox" data-v21-choice="'+safe(group)+
     '" data-v21-key="'+safe(r.key)+'" data-v21-name="'+safe(r.name)+'"'+
     (r.enabled?' checked':'')+(!r.available||currentRole!=='admin'?' disabled':'')+'>'+
     '<span class="v21-catalog-status">'+(r.enabled?'Açık':'Kapalı')+'</span></label>'+
   '<div class="v21-catalog-name"><strong>'+safe(r.name)+'</strong>'+
    (!r.available?'<small>Kurum yönetiminde gizli; önce oradan aç</small>':
      '<small>'+(r.enabled?'Yeni kayıtlarda seçilebilir':'Yeni kayıtlarda görünmez')+'</small>')+'</div>'+
   (currentRole==='admin'?
    '<button type="button" class="mini-btn" data-v21-edit="'+safe(group)+
      '" data-v21-key="'+safe(r.key)+'" data-v21-name="'+safe(r.name)+'">İsim düzenle</button>':'')+
   '</div>').join('')+(rows.length>70?'<p class="muted">İlk 70 kuruluş gösteriliyor. Aramayı daralt.</p>':''):
   '<p class="muted">Seçili kuruluş yok. “Tüm kuruluşları göster” ile seçim yapabilirsin.</p>';
  el('v21CatalogCount').textContent=rows.filter(r=>r.enabled).length+' açık seçenek gösteriliyor';
  el('v21CatalogAdd').hidden=currentRole!=='admin';
 }
 async function saveChoice(input){
  const {v21Choice:group,v21Key:item_key,v21Name:display_name}=input.dataset;
  const previous=!input.checked;
  input.disabled=true;
  try{
   await api('catalog-prefs','POST',{group,item_key,display_name,enabled:input.checked});
   await load();
   notice(display_name+(input.checked?' listene eklendi.':' yeni kayıt listesinden kaldırıldı.'));
  }catch(error){input.checked=previous;notice(error.message,true);}
  finally{input.disabled=false;}
 }
 function nameDialog(group,itemKey,oldName=''){
  const category=catalogs[group]||group;
  const renaming=!!itemKey;
  el('modalTitle').textContent=(renaming?'İsim düzenle: ':'Yeni isim ekle: ')+category;
  el('modalContents').innerHTML='<form id="v21NameForm" class="modal-form">'+
   '<div><label for="v21NewCatalogName">Kurum / firma adı</label>'+
   '<input id="v21NewCatalogName" name="name" maxlength="120" required value="'+safe(oldName)+'"></div>'+
   '<p class="hint">Bu yalnızca yeni kayıtların seçim listesini değiştirir; önceki borç ve alacak işlemleri aynen kalır.</p>'+
   '<div class="form-actions"><button type="button" class="btn subtle" id="v21Cancel">Vazgeç</button>'+
   '<button type="submit" class="btn primary">Kaydet</button></div></form>';
  el('v21Cancel').onclick=()=>el('modal').close();
  el('v21NameForm').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;
   const name=e.currentTarget.elements.name.value.trim();
   try{
    if(renaming)await api('catalog-prefs','PATCH',{group,item_key:itemKey,old_name:oldName,new_name:name});
    else await api('catalog-prefs','POST',{group,item_key:name,display_name:name,enabled:true});
    el('modal').close();await load();notice('Seçim listesi güncellendi.');
   }catch(error){notice(error.message,true);}
   finally{button.disabled=false;}
  };
  el('modal').showModal();
 }
 document.addEventListener('change',e=>{
  if(e.target.id==='v21CatalogCategory'||e.target.id==='v21CatalogShowAll'){render();return;}
  if(e.target.matches('[data-v21-choice]')){if(currentRole==='admin')saveChoice(e.target);}
 });
 document.addEventListener('input',e=>{if(e.target.id==='v21CatalogSearch')render();});
 document.addEventListener('click',e=>{
  if(currentRole!=='admin')return;
  if(e.target.id==='v21CatalogAdd'){
   const group=el('v21CatalogCategory').value;
   if(group==='bank'||group==='payment')window.openInstitutionManager({type:group});
   else nameDialog(group,'');
  }
  const edit=e.target.closest('[data-v21-edit]');
  if(!edit)return;
  const {v21Edit:group,v21Key:itemKey,v21Name:oldName}=edit.dataset;
  if(group==='bank'||group==='payment')window.openInstitutionManager({editId:itemKey,type:group});
  else nameDialog(group,itemKey,oldName);
 });
 const previousSettings=window.renderSettings;
 window.renderSettings=function(){
  if(typeof previousSettings==='function')previousSettings();
  render();
 };
 window.HTCatalog21={render,sourceRows,isInstitutionAllowed,isNameAllowed};
 init();
})();