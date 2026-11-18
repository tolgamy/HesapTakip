'use strict';
// V46 POS actions share the existing editable account/firm forms and D1 API.
// No POS balance is modified by these controls except an explicitly approved deletion.
(function(){
 const safe=x=>esc(String(x??''));
 const isViewer=()=>currentRole==='viewer';
 const admin=()=>window.HTIdentity?.role==='admin';
 const posAccount=id=>(state.accounts||[]).find(a=>a.id===id&&
  (window.HTPOS21?.readPos?.(state)?.posAccounts||[]).some(p=>p.id===a.id));
 const posFirm=id=>(window.HTPOS21?.readPos?.(state)?.firms||[])
  .find(f=>f.id===id&&f.category==='receivable'&&f.receivable_group==='pos');
 async function showArchive(){
  const host=el('v46PosArchive');
  if(!host||!admin())return;
  host.hidden=false;
  host.textContent='Arşivlenmiş POS günlük ciroları yükleniyor...';
  try{
   const data=await api('pos-archive');
   const rows=data.archivedPos||[];
   host.innerHTML='<h4>Arşivlenmiş POS günlük ciroları</h4>'+
    '<p class="hint">Hareket geçmişi silinmedi. İstersen yeniden aktif listeye alabilirsin.</p>'+
    (rows.length?rows.map(p=>'<div class="v46-pos-archive-row"><span>'+safe(p.firm_name)+'</span>'+
      '<button type="button" class="mini-btn" data-v46-pos-restore="'+safe(p.firm_id)+'">Geri getir</button></div>').join(''):
     '<p class="muted">Arşivlenmiş POS cirosu yok.</p>');
  }catch(error){host.textContent=error.message;}
 }
 document.addEventListener('click',async event=>{
  const elButton=event.target.closest('[data-v46-pos-account-new],[data-v46-pos-firm-edit],'+
   '[data-v46-pos-firm-archive],[data-v46-pos-account-edit],[data-v46-pos-account-delete],'+
   '[data-v46-pos-archive-show],[data-v46-pos-restore]');
  if(!elButton)return;
  const data=elButton.dataset;
  if(data.v46PosArchiveShow!==undefined){
   if(!admin()){notice('Arşivi yalnız yönetici açabilir.',true);return;}
   const host=el('v46PosArchive');
   if(!host)return;
   if(!host.hidden){host.hidden=true;return;}
   await showArchive();return;
  }
  if(isViewer()){notice('POS hesabını değiştirmek için yönetici yetkisi gerekli.',true);return;}
  if(data.v46PosAccountNew!==undefined){
   if(typeof window.openSuiteForm!=='function'){notice('POS hesap formu açılamadı. Sayfayı yenile.',true);return;}
   window.openSuiteForm('account');
   const form=el('suiteForm');
   if(!form){notice('Yeni POS hesabı formu bulunamadı.',true);return;}
   form.elements.type.value='bank';
   form.elements.is_pos.value='1';
   const selected=form.elements.institution_id?.value||'';
   if(selected&&!selected.startsWith('pos:')){
    const choice='pos:'+selected;
    if([...form.elements.institution_id.options].some(o=>o.value===choice))
     form.elements.institution_id.value=choice;
   }
   el('modalTitle').textContent='Yeni POS / ödeme kuruluşu hesabı';
   notice('POS hesabı seçili. Kurumu ve hesap adını belirleyip Kaydet.');
   return;
  }
  if(data.v46PosFirmEdit){
   const f=posFirm(data.v46PosFirmEdit);
   if(f&&typeof window.openFirmForm==='function')window.openFirmForm('edit',f.id);
   return;
  }
  if(data.v46PosAccountEdit){
   const a=posAccount(data.v46PosAccountEdit);
   if(a&&typeof window.HTEditAccountV10==='function')window.HTEditAccountV10(a.id);
   else notice('POS hesap düzenleme ekranı açılamadı.',true);
   return;
  }
  if(data.v46PosFirmArchive){
   if(!admin()){notice('POS hesabını yalnız yönetici kaldırabilir.',true);return;}
   const f=posFirm(data.v46PosFirmArchive);if(!f)return;
   const count=(state.firmMovements||[]).filter(m=>m.firm_id===f.id).length;
   if(!confirm(f.name+' POS günlük ciro hesabı aktif listeden kaldırılacak.\n\n'+
      count+' satış/tahsilat hareketi geçmişte korunacak. İşlem geri alınabilir.\n\nKaldırılsın mı?'))return;
   elButton.disabled=true;
   try{
    await api('pos-archive','POST',{firm_id:f.id,firm_name:f.name,confirmation:'KALDIR'});
    await load();notice(f.name+' listeden kaldırıldı. Arşivden geri getirebilirsin.');
    if(el('v46PosArchive')&&!el('v46PosArchive').hidden)await showArchive();
   }catch(error){notice(error.message,true);elButton.disabled=false;}
   return;
  }
  if(data.v46PosAccountDelete){
   if(!admin()){notice('POS hesabını yalnız yönetici silebilir.',true);return;}
   const a=posAccount(data.v46PosAccountDelete);if(!a)return;
   const movements=(state.entries||[]).filter(e=>e.account_id===a.id);
   if(movements.length){
    notice(a.name+' hesabında '+movements.length+' banka hareketi var. Geçmiş kaybolmaması için hesap silinemez. Hareketleri önce kontrol et.',true);
    return;
   }
   if(!confirm(a.name+' POS hesabı ve açılış bakiyesi ('+money(a.opening_kurus||0)+') silinsin mi?\n\nBu işlem geri alınamaz.'))return;
   elButton.disabled=true;
   try{
    await api('accounts/'+a.id,'DELETE');
    await load();notice(a.name+' POS hesabı silindi.');
   }catch(error){notice(error.message,true);elButton.disabled=false;}
   return;
  }
  if(data.v46PosRestore){
   if(!admin())return;
   if(!confirm('Arşivlenen POS cirosunu tekrar aktif listeye al?'))return;
   try{
    await api('pos-archive/'+data.v46PosRestore+'/restore','POST',{});
    await load();await showArchive();notice('POS cirosu aktif listeye geri alındı.');
   }catch(error){notice(error.message,true);}
  }
 });
 window.HTPOS46={showArchive,posAccount,posFirm};
})();
