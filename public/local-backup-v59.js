// V59 - local-only, encrypted finance backup. No Google, R2, CDN or upload.
(() => {
  'use strict';
  const panel=document.getElementById('settingsBackupsPanel');
  const status=document.getElementById('backupLocalStatus');
  const password=document.getElementById('backupLocalPass');
  const again=document.getElementById('backupLocalPassRepeat');
  const download=document.getElementById('backupDownloadBtn');
  const ready=document.getElementById('backupLocalReady');
  const share=document.getElementById('backupLocalShare');
  const verifyFile=document.getElementById('backupLocalVerifyFile');
  const verifyPass=document.getElementById('backupLocalVerifyPass');
  const verifyBtn=document.getElementById('backupLocalVerify');
  const verifyStatus=document.getElementById('backupLocalVerifyStatus');
  if(!panel||!status||!password||!again||!download||!ready||!verifyFile||!verifyBtn||!verifyPass||!verifyStatus)return;
  const LOCAL='hesaptakip-finance-local-v59';
  const ENCRYPTED='hesaptakip-local-aes256gcm-v59';
  const SIZE_LIMIT=24*1024*1024;
  const KDF_ITERATIONS=250000;
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  let fileUrl=null,preparedFile=null;
  const allowed=()=>window.HTIdentity?.role==='admin';
  const setStatus=(value,bad=false)=>{status.textContent=value;status.classList.toggle('error',bad);};
  const setVerifyStatus=(value,bad=false)=>{verifyStatus.textContent=value;verifyStatus.classList.toggle('error',bad);};
  const enc64=bytes=>{
    let out='';
    for(let i=0;i<bytes.length;i+=8192)
      out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out);
  };
  const dec64=value=>{
    if(typeof value!=='string'||value.length>SIZE_LIMIT*2||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
      throw Error('Dosya biçimi geçersiz.');
    return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  };
  async function derive(passwordValue,salt,iterations){
    const source=await crypto.subtle.importKey('raw',encoder.encode(passwordValue),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},
      source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  function validateArchive(data){
    if(!data||data.format!==LOCAL||!data.tables||typeof data.tables!=='object'||Array.isArray(data.tables))
      throw Error('HesapTakip yedek dosyası tanınmadı.');
    const tables=Object.values(data.tables);
    if(!tables.length||tables.some(t=>!t||typeof t.schema!=='string'||!Array.isArray(t.rows)))
      throw Error('Yedek dosyasında eksik veya bozuk tablo var.');
    return {tables:tables.length,records:tables.reduce((total,t)=>total+t.rows.length,0)};
  }
  async function createEncryptedFile(passphrase){
    if(!window.crypto?.subtle||!window.crypto?.getRandomValues)
      throw Error('Bu tarayıcı şifreli dosya indirmeyi desteklemiyor. Safari veya Chrome ile açın.');
    const manifest=await api('backups/local/manifest');
    if(manifest.format!==LOCAL||!Array.isArray(manifest.tables)||!manifest.tables.length)
      throw Error('Finans tabloları listelenemedi; dosya oluşturulmadı.');
    const tables={},used=new Set();
    for(let i=0;i<manifest.tables.length;i++){
      const item=manifest.tables[i];
      if(!item||typeof item.name!=='string'||typeof item.schema!=='string'||used.has(item.name))
        throw Error('Yedek tablo listesi geçersiz. Dosya oluşturulmadı.');
      used.add(item.name);
      setStatus('Finans tabloları okunuyor: '+(i+1)+' / '+manifest.tables.length);
      const result=await api('backups/local/table/'+encodeURIComponent(item.name));
      if(result.name!==item.name||!Array.isArray(result.rows))
        throw Error('Tablo okunamadı. Eksik yedek oluşturulmadı.');
      tables[item.name]={schema:item.schema,rows:result.rows};
      if(encoder.encode(JSON.stringify(tables)).byteLength>SIZE_LIMIT)
        throw Error('Yedek çok büyük; eksik dosya oluşturulmadı.');
    }
    const archive={format:LOCAL,exported_at:manifest.created_at,tables};
    const summary=validateArchive(archive);
    const plaintext=encoder.encode(JSON.stringify(archive));
    if(plaintext.byteLength>SIZE_LIMIT)throw Error('Yedek dosyası boyut sınırını aştı.');
    setStatus('Dosya cihazınızda şifreleniyor...');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(passphrase,salt,KDF_ITERATIONS);
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plaintext));
    const wrapper={
      format:ENCRYPTED,kdf:'PBKDF2-SHA256',iterations:KDF_ITERATIONS,
      cipher:'AES-256-GCM',salt:enc64(salt),iv:enc64(iv),data:enc64(ciphertext)
    };
    // Check the produced ciphertext before showing the file as ready.
    const checked=JSON.parse(decoder.decode(await crypto.subtle.decrypt(
      {name:'AES-GCM',iv},key,ciphertext)));
    const checkedSummary=validateArchive(checked);
    if(checkedSummary.tables!==summary.tables||checkedSummary.records!==summary.records)
      throw Error('Şifreli yedek doğrulaması başarısız oldu.');
    const fileBody=JSON.stringify(wrapper);
    const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'});
    const name='HesapTakip-Sifreli-Yedek-'+date+'.json';
    return {body:fileBody,name,summary};
  }
  function discard(){
    if(fileUrl)URL.revokeObjectURL(fileUrl);
    fileUrl=null;preparedFile=null;ready.hidden=true;ready.removeAttribute('href');
    share.hidden=true;
  }
  function prepare(body,name){
    discard();
    preparedFile=new File([body],name,{type:'application/json'});
    fileUrl=URL.createObjectURL(preparedFile);
    ready.href=fileUrl;ready.download=name;ready.hidden=false;
    share.hidden=!(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&
      navigator.canShare({files:[preparedFile]}));
    // Desktop/Android commonly download immediately. The visible anchor lets iOS
    // Safari users tap again if the async download does not open the Files dialog.
    ready.click();
  }
  download.addEventListener('click',async()=>{
    if(!allowed()){setStatus('Yedek indirme yalnızca yöneticiye açıktır.',true);return;}
    const passphrase=password.value;
    if(passphrase.length<10||passphrase.length>200){setStatus('En az 10 karakterlik yedek şifresi yazın.',true);return;}
    if(passphrase!==again.value){setStatus('İki şifre aynı değil.',true);return;}
    download.disabled=true;setStatus('Yedek hazırlanıyor...');
    try{
      const result=await createEncryptedFile(passphrase);
      prepare(result.body,result.name);
      setStatus('Şifreli dosya hazır: '+result.summary.tables+' tablo, '+result.summary.records+
        ' kayıt. İndirme başlamadıysa aşağıdaki kaydet bağlantısına dokunun.');
    }catch(error){discard();setStatus('Yedek hazırlanamadı: '+error.message,true);}
    finally{password.value='';again.value='';download.disabled=false;}
  });
  share.addEventListener('click',async()=>{
    if(!preparedFile||!allowed())return;
    try{await navigator.share({files:[preparedFile],title:'HesapTakip şifreli yedek'});}
    catch(error){if(error?.name!=='AbortError')setStatus('Paylaşım açılamadı. Kaydet bağlantısını kullanın.',true);}
  });
  verifyBtn.addEventListener('click',async()=>{
    const file=verifyFile.files?.[0],passphrase=verifyPass.value;
    if(!allowed()){setVerifyStatus('Yedek doğrulama yalnızca yöneticiye açıktır.',true);return;}
    if(!file){setVerifyStatus('Önce yedek dosyasını seçin.',true);return;}
    if(!passphrase){setVerifyStatus('Yedek dosyası şifresini yazın.',true);return;}
    if(file.size>SIZE_LIMIT*2){setVerifyStatus('Dosya doğrulama sınırından büyük.',true);return;}
    verifyBtn.disabled=true;setVerifyStatus('Dosya cihazınızda kontrol ediliyor...');
    try{
      const wrapper=JSON.parse(await file.text());
      if(wrapper?.format!==ENCRYPTED||wrapper.kdf!=='PBKDF2-SHA256'||
        wrapper.iterations!==KDF_ITERATIONS||wrapper.cipher!=='AES-256-GCM')
        throw Error('Dosya şifreleme biçimi tanınmadı.');
      const salt=dec64(wrapper.salt),iv=dec64(wrapper.iv),ciphertext=dec64(wrapper.data);
      if(salt.length!==16||iv.length!==12)throw Error('Şifreli dosya yapısı geçersiz.');
      const key=await derive(passphrase,salt,wrapper.iterations);
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext);
      const summary=validateArchive(JSON.parse(decoder.decode(plaintext)));
      setVerifyStatus('Doğrulandı: '+summary.tables+' tablo ve '+summary.records+
        ' kayıt. Canlı hesap verileri değiştirilmedi.');
    }catch(error){
      setVerifyStatus('Dosya açılamadı. Şifre yanlış veya dosya bozuk olabilir.',true);
    }finally{verifyPass.value='';verifyBtn.disabled=false;}
  });
  window.HTLocalBackup={
    open(){if(typeof tab==='function')tab('settings');panel.open=true;
      panel.scrollIntoView({block:'start'});password.focus({preventScroll:true});},
    clear(){discard();password.value='';again.value='';verifyPass.value='';verifyFile.value='';}
  };
})();
