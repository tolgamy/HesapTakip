// V58: Google Drive app-specific encrypted archive controls in existing Yedekleme view.
// Only an authenticated admin with unlocked PIN may operate endpoints.
(() => {
  const view=document.getElementById('settingsBackupView');
  const state=document.getElementById('backupV58Status');
  const connect=document.getElementById('backupV58Connect');
  const disconnect=document.getElementById('backupV58Disconnect');
  const sync=document.getElementById('backupV58Sync');
  const verify=document.getElementById('backupV58Verify');
  const refresh=document.getElementById('backupV58Refresh');
  const logs=document.getElementById('backupV58Runs');
  if(!view||!state||!connect||!disconnect||!sync||!verify||!refresh||!logs)return;
  const admin=()=>window.HTIdentity?.role==='admin';
  const busy=b=>{for(const button of [connect,disconnect,sync,verify,refresh])button.disabled=b;};
  async function show(){
    if(!admin()){
      for(const button of [connect,disconnect,sync,verify,refresh])button.hidden=true;
      state.textContent='Google Drive yedeklemesini yalnız yönetici yönetebilir.';
      logs.textContent='';
      return;
    }
    for(const button of [connect,disconnect,sync,verify,refresh])button.hidden=false;
    try{
      const info=await api('google-drive/status');
      state.textContent=!info.configured
        ? 'Google bağlantısı kurulmamış: '+info.reason
        : info.connected
          ? 'Google Drive bağlı. Yedekler gizli uygulama klasöründe şifreli saklanır; normal Drive dosya listesinde görünmez.'
          : 'Google Drive henüz bağlı değil. Google hesabınızla izin vererek bağlayın.';
      if(!info.configured&&info.diagnostics){
        state.textContent+=' [ID: '+info.diagnostics.client_id+'; Secret: '+info.diagnostics.client_secret+'; R2: '+info.diagnostics.backup+']';
      }
      connect.hidden=info.connected;disconnect.hidden=!info.connected;
      connect.disabled=!info.configured;
      sync.disabled=!info.configured||!info.connected;
      verify.disabled=!info.configured||!info.connected;
      const last=(info.runs||[]).slice(0,8);
      logs.replaceChildren();
      if(!last.length){
        const p=document.createElement('p');p.className='muted';p.textContent='Henüz Google Drive yedek kaydı yok.';logs.append(p);
      }
      for(const record of last){
        const p=document.createElement('p');p.className='muted';
        p.textContent=(record.state==='success'?'✓ Şifreli kopya':'! Başarısız yedek denemesi')+' · '+
          (record.created_at||'')+' · '+(record.object_key||'');
        logs.append(p);
      }
    }catch(error){state.textContent='Google Drive durumu alınamadı: '+error.message;}
  }
  refresh.addEventListener('click',show);
  connect.addEventListener('click',async()=>{
    if(!admin())return;
    busy(true);
    try{
      const answer=await api('google-drive/connect','POST',{});
      const target=new URL(answer.url);
      if(target.origin!=='https://accounts.google.com')throw Error('Güvenli Google yetkilendirme bağlantısı alınamadı.');
      window.location.assign(target.toString());
    }catch(error){state.textContent='Google bağlantısı başlatılamadı: '+error.message;busy(false);}
  });
  disconnect.addEventListener('click',async()=>{
    if(!admin()||!confirm('Google Drive bağlantısı kaldırılsın mı? Eski Drive yedekleri silinmeyecek.'))return;
    busy(true);
    try{
      await api('google-drive/disconnect','POST',{});
      await show();
    }catch(error){state.textContent='Bağlantı kesilemedi: '+error.message;}
    finally{busy(false);}
  });
  sync.addEventListener('click',async()=>{
    if(!admin()||!confirm('Cloudflare R2’deki bugünün şifreli yedeği Google Drive’a kopyalansın mı?'))return;
    busy(true);state.textContent='Şifreli dosya Google Drive’a kopyalanıyor ve geri okunuyor...';
    try{
      const result=await api('google-drive/sync','POST',{});
      state.textContent=result.verified?'Google Drive kopyası doğrulandı: '+result.file_name:
        'Kopyalama yapılamadı: '+(result.reason||result.status);
    }catch(error){state.textContent='Google Drive yedeği oluşturulamadı: '+error.message;}
    finally{busy(false);}
  });
  verify.addEventListener('click',async()=>{
    if(!admin())return;
    busy(true);
    try{
      const result=await api('google-drive/verify');
      state.textContent=result.verified?'Google Drive’daki şifreli yedek tekrar okunarak doğrulandı. Canlı kayıtlar değiştirilmedi.':
        'Doğrulama yapılamadı: '+result.reason;
    }catch(error){state.textContent='Doğrulama başarısız: '+error.message;}
    finally{busy(false);}
  });
  const url=new URL(window.location.href);
  const result=url.searchParams.get('google_drive');
  if(result){
    state.textContent=result==='connected'?'Google hesabı bağlandı. Durumu yenileyin.':
      result==='cancelled'?'Google Drive bağlantısı iptal edildi.':
        'Google hesabı bağlanamadı. İzinleri ve ayarları kontrol edin.';
    url.searchParams.delete('google_drive');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  const panel=document.getElementById('settingsBackupsPanel');
  const settingsPage=document.getElementById('settingsView');
  panel?.addEventListener('toggle',()=>{if(panel.open&&!settingsPage.hidden)show();});
  new MutationObserver(()=>{if(panel?.open&&!settingsPage.hidden)show();})
    .observe(settingsPage,{attributes:true,attributeFilter:['hidden']});
})();
