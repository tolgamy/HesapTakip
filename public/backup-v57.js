// V57 admin-only controls for existing Yedekleme view. No financial data is modified.
(() => {
  const view=document.getElementById('settingsBackupView');
  const status=document.getElementById('backupV57Status');
  const run=document.getElementById('backupV57Run');
  const preview=document.getElementById('backupV57Verify');
  const refresh=document.getElementById('backupV57Refresh');
  if(!view||!status||!run||!preview||!refresh)return;
  const admin=()=>window.HTIdentity?.role==='admin';
  const setBusy=value=>{
    run.disabled=value;preview.disabled=value;refresh.disabled=value;
  };
  async function updateStatus(){
    if(!admin()){
      run.hidden=true;preview.hidden=true;refresh.hidden=true;
      status.textContent='Yedekleme doğrulamasını yalnız yönetici görebilir.';
      return;
    }
    run.hidden=false;preview.hidden=false;refresh.hidden=false;
    try{
      const result=await api('backups/status');
      status.textContent=result.configured
        ? 'Şifreli R2 yedekleme hazır. Günlük zamanlayıcı Türkiye saatiyle 10.00’da kontrol eder.'
        : 'Şifreli R2 henüz etkin değil: '+result.reason;
      const latest=(result.runs||[])[0];
      if(latest?.state==='failed')status.textContent+=' Son başarısız deneme kodu: '+(latest.detail||'UNKNOWN')+'.';
      run.disabled=!result.configured;
      preview.disabled=!result.configured;
    }catch(error){
      status.textContent='Yedek durumu alınamadı: '+error.message;
    }
  }
  run.addEventListener('click',async()=>{
    if(!admin()||!confirm('Özel R2 üzerinde şifreli günlük yedek oluşturulsun mu?'))return;
    setBusy(true);status.textContent='Yedek doğrulanıyor...';
    try {
      const result=await api('backups/run','POST',{});
      status.textContent=result.status==='success'
        ? 'Şifreli yedek oluşturuldu ve R2 geri okuma doğrulandı.'
        : result.status==='already_done'
          ? 'Bugünkü şifreli yedek zaten var ve kontrol edildi.'
          : 'Yedekleme kapalı: '+result.reason;
      await load();
    }catch(error){status.textContent='Yedekleme başarısız: '+error.message;}
    finally{setBusy(false);}
  });
  preview.addEventListener('click',async()=>{
    if(!admin())return;
    setBusy(true);
    try{
      const result=await api('backups/preview');
      status.textContent=result.verified
        ? 'Son yedek doğrulandı: '+Object.keys(result.tables).length+' tablo. Canlı veriler değiştirilmedi.'
        : 'Henüz doğrulanmış arşiv yok: '+result.reason;
    }catch(error){status.textContent='Yedek doğrulanamadı: '+error.message;}
    finally{setBusy(false);}
  });
  refresh.addEventListener('click',updateStatus);
  // Fetch status on opening the existing view, not before login or in background.
  const panel=document.getElementById('settingsBackupsPanel');
  const settingsPage=document.getElementById('settingsView');
  panel?.addEventListener('toggle',()=>{if(panel.open&&!settingsPage.hidden)updateStatus();});
  new MutationObserver(()=>{if(panel?.open&&!settingsPage.hidden)updateStatus();})
    .observe(settingsPage,{attributes:true,attributeFilter:['hidden']});
})();
