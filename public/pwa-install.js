/* HesapTakip v16 — native install prompt where the browser supports it.
   On iPhone/iPad, Safari's Add to Home Screen is manual; no fake install button. */
(() => {
  let installEvent = null;
  const buttons = [...document.querySelectorAll('[data-pwa-install]')];
  const messages = [...document.querySelectorAll('[data-pwa-status]')];
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function render() {
    const alreadyInstalled = installed();
    const canPrompt = !!installEvent && !alreadyInstalled;
    for (const button of buttons) button.hidden = !canPrompt;
    const message = alreadyInstalled
      ? 'HesapTakip bu cihazda uygulama olarak açılıyor.'
      : isAppleMobile
        ? 'iPhone/iPad: Safari\u2019de Paylaş menüsünden Ana Ekrana Ekle\u2019yi seçin.'
        : canPrompt
          ? 'Kuruluma hazır. Uygulamayı yükle butonuna dokunun.'
          : 'Android veya bilgisayarda tarayıcı menüsünden Uygulamayı yükle / Ana ekrana ekle seçeneğini kullanın.';
    for (const el of messages) el.textContent = message;
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    render();
  });
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (!installEvent || installed()) return;
      const prompt = installEvent;
      installEvent = null;
      render();
      try { await prompt.prompt(); await prompt.userChoice; }
      catch (error) { console.warn('Kurulum penceresi açılamadı:', error); }
      render();
    });
  }
  window.addEventListener('appinstalled', () => { installEvent = null; render(); });
  window.addEventListener('pageshow', render);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register('/sw.js', {scope:'/'})
        .catch(error => console.warn('PWA servis çalışanı kaydedilemedi:', error)));
  }
  render();
})();
