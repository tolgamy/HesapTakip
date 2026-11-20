'use strict';
// V56: Mobile-only WebAuthn controls. The browser never sees or stores biometric data.
(() => {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    navigator.userAgentData?.mobile === true;
  const capable = mobile && window.isSecureContext && !!window.PublicKeyCredential &&
    !!navigator.credentials?.create && !!navigator.credentials?.get;
  const el = id => document.getElementById(id);
  const decode = text => {
    const s=text.replace(/-/g,'+').replace(/_/g,'/');
    const binary=atob(s+'='.repeat((4-s.length%4)%4));
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  };
  const encode = bytes => {
    let binary='';
    const data=new Uint8Array(bytes);
    for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  };
  const regPublicKey = options => ({
    ...options, challenge:decode(options.challenge),
    user:{...options.user,id:decode(options.user.id)},
    excludeCredentials:(options.excludeCredentials||[]).map(c=>({...c,id:decode(c.id)}))
  });
  const authPublicKey = options => ({
    ...options,challenge:decode(options.challenge),
    allowCredentials:(options.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))
  });
  const registrationResponse = cred => ({
    id:cred.id,rawId:encode(cred.rawId),type:cred.type,
    authenticatorAttachment:cred.authenticatorAttachment||null,
    response:{
      clientDataJSON:encode(cred.response.clientDataJSON),
      attestationObject:encode(cred.response.attestationObject),
      transports:cred.response.getTransports?.()||[]
    },
    clientExtensionResults:cred.getClientExtensionResults()
  });
  const authenticationResponse = cred => ({
    id:cred.id,rawId:encode(cred.rawId),type:cred.type,
    authenticatorAttachment:cred.authenticatorAttachment||null,
    response:{
      clientDataJSON:encode(cred.response.clientDataJSON),
      authenticatorData:encode(cred.response.authenticatorData),
      signature:encode(cred.response.signature),
      userHandle:cred.response.userHandle ? encode(cred.response.userHandle) : null
    },
    clientExtensionResults:cred.getClientExtensionResults()
  });
  let busy=false;
  const unlockBtn=document.createElement('button');
  unlockBtn.type='button';
  unlockBtn.id='htBioUnlock';
  unlockBtn.className='btn secondary ht-bio-unlock';
  unlockBtn.textContent=/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '🔓 Face ID / Touch ID ile aç' : '🔓 Parmak izi ile aç';
  unlockBtn.hidden=true;
  el('htPinUnlockPanel')?.append(unlockBtn);

  const target=document.querySelector('#settingsView .ht-pin-settings');
  const panel=document.createElement('section');
  panel.className='ht-pin-settings ht-bio-settings';
  panel.hidden=true;
  panel.innerHTML='<div><strong>Telefon biyometrik kilidi</strong><p class="muted">Face ID, Touch ID veya Android parmak izi desteklenen telefonlarda kullanılabilir. Cihaz kendi ekran kilidini de isteyebilir. Bilgisayarda yalnız 6 haneli PIN kullanılır.</p><p id="htBioStatus" class="hint" role="status" aria-live="polite"></p></div><div class="row-actions"><button class="btn secondary" type="button" id="htBioRegister">Bu telefonu tanıt</button><button class="btn subtle" type="button" id="htBioRevoke" hidden>Tüm telefonları kaldır</button></div>';
  target?.insertAdjacentElement('afterend',panel);
  const statusNode=el('htBioStatus');
  function feedback(message,error=false) {
    if(statusNode) { statusNode.textContent=message; statusNode.dataset.error=error?'1':'0'; }
  }
  function unlockFeedback(message) {
    const notice=el('htPinNotice');
    if(notice){notice.textContent=message;notice.dataset.error='1';}
  }
  async function refresh() {
    if(!capable)return;
    try {
      const status=await api('biometric/status');
      unlockBtn.hidden=!status.enrolled;
      panel.hidden=false;
      el('htBioRevoke').hidden=!status.enrolled;
      el('htBioRegister').hidden=status.count>=5;
      feedback(status.enrolled ? status.count+' mobil güvenlik anahtarı kayıtlı.' :
        'Henüz kayıtlı telefon yok. Önce PIN ile açıp bu telefonu tanıt.');
    } catch { unlockBtn.hidden=true; }
  }
  async function register() {
    if(!capable || busy)return;
    busy=true;el('htBioRegister').disabled=true;
    try {
      feedback('Telefonunuzun güvenlik doğrulamasını bekliyorum...');
      const options=await api('biometric/register/options','POST',{});
      const credential=await navigator.credentials.create({publicKey:regPublicKey(options)});
      if(!credential)throw Error('Telefon güvenlik onayı vermedi.');
      await api('biometric/register/verify','POST',registrationResponse(credential));
      await refresh();
      feedback('Telefon kaydedildi. Bir sonraki kilitte biyometrik doğrulamayla açabilirsiniz.');
    } catch(error) {
      feedback(error.name==='NotAllowedError'?'İşlem iptal edildi. PIN kullanılabilir.':
        error.message||'Biyometrik kayıt başarısız.',true);
    } finally {busy=false;el('htBioRegister').disabled=false;}
  }
  async function unlock() {
    if(!capable || busy)return;
    busy=true;unlockBtn.disabled=true;
    try {
      const options=await api('biometric/auth/options','POST',{});
      const credential=await navigator.credentials.get({publicKey:authPublicKey(options)});
      if(!credential)throw Error('Telefon doğrulamayı tamamlamadı.');
      await api('biometric/auth/verify','POST',authenticationResponse(credential));
      await window.HTPin.biometricVerified();
    } catch(error){
      unlockFeedback(error.name==='NotAllowedError'?'Doğrulama iptal edildi. PIN ile açabilirsiniz.':
        error.message||'Biyometrik giriş başarısız. PIN kullanın.');
    } finally {busy=false;unlockBtn.disabled=false;}
  }
  async function revoke() {
    if(busy || !confirm('Bu hesaba kayıtlı tüm telefon biyometrik girişlerini kaldırmak istiyor musunuz?'))return;
    busy=true;el('htBioRevoke').disabled=true;
    try{await api('biometric/revoke','POST',{}); await refresh();feedback('Kayıtlı telefon anahtarları kaldırıldı. PIN ile giriş devam eder.');}
    catch(error){feedback(error.message,true);}
    finally{busy=false;el('htBioRevoke').disabled=false;}
  }
  unlockBtn.addEventListener('click',unlock);
  el('htBioRegister')?.addEventListener('click',register);
  el('htBioRevoke')?.addEventListener('click',revoke);
  window.HTBio={sync(session){
    if(!session?.authenticated||!capable)return;
    void refresh();
  }};
})();
