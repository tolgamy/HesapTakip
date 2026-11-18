'use strict';
// V19 usability layer: the existing D1 records and transaction routes are reused.
(function(){
 const safe=x=>esc(String(x??''));
 let platformSection='platform';
 const platformGroups=new Set(['platform']);
 function setPlatformPanel(which){
  platformSection=platformGroups.has(which)?which:'platform';
  const platform=platformSection==='platform';
  el('v19PlatformPanel').hidden=!platform;
  el('v19VeresiyePanel').hidden=true; // Legacy records now appear under Şahıs Alacakları.
  document.querySelectorAll('[data-v19-platform]').forEach(button=>{
   const active=button.dataset.v19Platform===platformSection;
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
  });
 }
 const container=el('htLogoPanel');
 if(container){
  container.insertAdjacentHTML('beforebegin',[
   '<details class="ht-settings-panel v19-catalog-panel" id="v19CatalogPanel">',
   '<summary class="v19-logo-summary"><div class="ht-settings-heading">',
   '<span class="ht-settings-heading-icon">☷</span><div><h3>Çalıştığım kurumlar ve firmalar</h3>',
   '<p>Önce kayıtlı olanları göster. Diğer banka, ödeme kuruluşu ve platformları arayarak bul.</p>',
   '</div></div></summary>',
   '<div class="v19-catalog-tools">',
   '<div><label for="v19CatalogType">Kategori</label><select id="v19CatalogType">',
   '<option value="bank">Banka hesaplarım</option><option value="bank_pos">Banka POS</option><option value="payment">Ödeme kuruluşları</option>',
   '<option value="platform">Platform firmaları</option><option value="firm">Borçlu olduğum firmalar</option>',
   '<option value="directory">Firma rehberi</option></select></div>',
   '<div><label for="v19CatalogSearch">Ara</label><input id="v19CatalogSearch" type="search" placeholder="İsim veya marka ara..."></div>',
   '</div>',
   '<label class="v19-show-all"><input type="checkbox" id="v19CatalogAll"> Tüm hazır kataloğu göster (kullanmıyor olduklarım dahil)</label>',
   '<div id="v19CatalogList" class="v19-catalog-list" aria-live="polite"></div>',
   '<button type="button" class="btn secondary v19-catalog-add" id="v19CatalogAdd">+ Bu kategoriye kayıt ekle</button>',
   '</details>'
  ].join(''));
 }
 const installedInstitutions=()=>window.HTInstitution24?
   window.HTInstitution24.uniqueInstitutions(state.institutions||[]):state.institutions||[];
 const usedInstitutions=()=>new Set([
  ...(state.firms||[]).map(f=>f.payout_institution_id).filter(Boolean),
  ...(state.cards||[]).map(c=>c.institution_id).filter(Boolean),
  ...(state.accounts||[]).map(a=>a.institution_id).filter(Boolean)
 ]);
 function catalogItems(type,all){
  const inst=installedInstitutions(),used=usedInstitutions();
  switch(type){
   case 'bank':return [
    ...(state.accounts||[]).filter(a=>a.type==='bank').map(a=>({type:'account',id:a.id,name:a.name,note:'Banka hesabım'})),
    ...(all?inst.filter(i=>i.type==='bank'&&i.is_active).map(i=>({type:'institution',id:i.id,name:i.name,note:'Hazır banka'})):[])
   ];
   case 'bank_pos':return [
    ...(state.accounts||[]).filter(a=>a.type==='bank'&&Number(a.is_pos)===1)
     .map(a=>({type:'account',id:a.id,name:a.name,note:'Kayıtlı banka POS hesabı'})),
    ...(all?inst.filter(i=>i.type==='bank'&&i.is_active)
     .map(i=>({type:'posbank',id:i.id,name:i.name+' POS',note:'Hazır banka POS seçeneği'})):[])
   ];
   case 'payment':return inst.filter(i=>i.type==='payment'&&i.is_active&&(all||used.has(i.id)))
     .map(i=>({type:'institution',id:i.id,name:i.name,note:used.has(i.id)?'Kullandığım ödeme kuruluşu':'Hazır kuruluş'}));
   case 'platform':{
    const accounts=(state.firms||[]).filter(f=>f.category==='receivable'&&f.receivable_group==='platform')
     .map(f=>({type:'firm',id:f.id,name:f.name,note:'Platform alacağım'}));
    if(!all)return accounts;
    const recorded=new Set(accounts.map(x=>x.name.toLocaleLowerCase('tr-TR')));
    const presets=window.v9ReceivablePresets?.platform||[];
    return [...accounts,...presets.filter(([name])=>!recorded.has(name.toLocaleLowerCase('tr-TR')))
     .map(([name])=>({type:'preset',id:'',name,note:'Hazır platform (henüz eklenmemiş)'}))];
   }
   case 'firm':return (state.firms||[]).filter(f=>f.category==='payable')
     .map(f=>({type:'firm',id:f.id,name:f.name,note:'Firma borcum'}));
   case 'directory':return (state.directory?.companies||[])
     .map(c=>({type:'directory',id:c.id,name:c.name,note:'Firma rehberi'}));
   default:return [];
  }
 }
 function renderCatalog(){
  const wrapper=el('v19CatalogPanel');if(!wrapper||!wrapper.open)return;
  const type=el('v19CatalogType').value,term=el('v19CatalogSearch').value.trim().toLocaleLowerCase('tr-TR'),
   all=el('v19CatalogAll').checked;
  const items=catalogItems(type,all).filter(item=>(item.name+' '+item.note).toLocaleLowerCase('tr-TR').includes(term));
  const visible=items.slice(0,40);
  el('v19CatalogList').innerHTML=visible.length?visible.map(item=>
   '<div class="v19-catalog-row"><div class="v19-catalog-badge">'+safe((item.name||'?').slice(0,2).toLocaleUpperCase('tr-TR'))+'</div>'+
   '<div class="v19-catalog-info"><strong>'+safe(item.name)+'</strong><small>'+safe(item.note)+'</small></div>'+
   (currentRole==='admin'?
    (item.type==='account'?'<button type="button" class="mini-btn" data-v10-account-edit="'+safe(item.id)+'">Düzenle</button>':
    '<button type="button" class="mini-btn" data-v19-cat-edit="'+safe(item.type)+
    '" data-v19-cat-id="'+safe(item.id)+'" data-v19-cat-name="'+safe(item.name)+'">'+
    (item.type==='preset'?'Kullan':'Düzenle')+'</button>'):'')+
   '</div>').join('')+(items.length>40?'<p class="muted">İlk 40 kayıt gösteriliyor. Aramayı daralt.</p>':''):
   '<p class="muted">Bu kategoride eşleşen kayıt yok. Kullanmadığın kuruluşlar burada kalabalık oluşturmaz.</p>';
  const add=el('v19CatalogAdd');add.hidden=currentRole!=='admin';
 }
 const oldSettings=window.renderSettings;
 window.renderSettings=function(){if(typeof oldSettings==='function')oldSettings();renderCatalog();};
 document.addEventListener('click',event=>{
  const platform=event.target.closest('[data-v19-platform]');
  if(platform){setPlatformPanel(platform.dataset.v19Platform);return;}
  const edit=event.target.closest('[data-v19-cat-edit]');
  if(edit){
   if(currentRole!=='admin')return;
   const {v19CatEdit:type,v19CatId:id,v19CatName:name}=edit.dataset;
   if(type==='posbank'){
    window.tab('banking');window.openSuiteForm('account');
    const inst=el('suite-institution_id'),pos=el('suite-is-pos');
    if(inst){inst.value='pos:'+id;inst.dispatchEvent(new Event('change',{bubbles:true}));}
    if(pos)pos.value='1';
   }else if(type==='institution'){
    const inst=installedInstitutions().find(x=>x.id===id);
    window.openInstitutionManager({editId:id,type:inst?.type||'bank'});
   }else if(type==='firm')window.openFirmForm('edit',id);
   else if(type==='directory')window.HTDirectory?.companyForm(id);
   else if(type==='preset')window.openFirmForm('new','receivable','platform',name);
   return;
  }
  if(event.target.id==='v19CatalogAdd'){
   if(currentRole!=='admin')return;
   const kind=el('v19CatalogType').value;
   if(kind==='bank'){window.tab('banking');window.openSuiteForm('account');const field=el('suite-type');if(field)field.value='bank';}
   else if(kind==='bank_pos'){
    window.tab('banking');window.openSuiteForm('account');
    const field=el('suite-is-pos');if(field)field.value='1';
   }
   else if(kind==='payment')window.openInstitutionManager({type:'payment'});
   else if(kind==='platform')window.openFirmForm('new','receivable','platform');
   else if(kind==='firm')window.openFirmForm('new','payable');
   else if(kind==='directory')window.HTDirectory?.companyForm();
  }
 });
 document.addEventListener('input',event=>{
  if(event.target.id==='v19CatalogSearch')renderCatalog();
 });
 document.addEventListener('change',event=>{
  if(event.target.id==='v19CatalogType'||event.target.id==='v19CatalogAll')renderCatalog();
 });
 document.addEventListener('toggle',event=>{
  if(event.target?.id==='v19CatalogPanel'&&event.target.open)renderCatalog();
 },true);
 window.HTV19={setPlatformPanel,renderCatalog,catalogItems};
 setPlatformPanel('platform');
})();
