'use strict';
// V55: PIN lock screen. PIN verification and inactivity decisions are enforced in D1.
// This script does not persist PINs or password material in browser storage.
(function () {
  const byId = id => document.getElementById(id);
  const AUTO_MS = 5 * 60 * 1000;
  const TOUCH_MS = 45 * 1000;
  let ready = null, lastActivity = Date.now(), lastTouch = Date.now();
  let active = false, locking = false, currentMode = 'unlock', changingMode = 'change';
  let channel = null;
  const apiCall = (path, method='GET', body) => api(path, method, body);
  const pinPage = () => byId('htPinPage');
  function feedback(text, error=false) {
    const node = byId('htPinNotice');
    node.textContent = text || '';
    node.dataset.error = error ? '1' : '0';
  }
  function display(mode) {
    currentMode = mode;
    active = false;
    byId('appPage').hidden = true;
    byId('loginPage').hidden = true;
    pinPage().hidden = false;
    byId('htPinUnlockPanel').hidden = mode !== 'unlock';
    byId('htPinSetupPanel').hidden = mode !== 'setup';
    byId('htPinResetPanel').hidden = mode !== 'reset';
    byId('htPinTitle').textContent = mode === 'setup' ? 'Güvenlik PIN’i oluştur' :
      mode === 'reset' ? 'PIN’i yenile' : 'HesapTakip kilitli';
    feedback(mode === 'setup' ? 'Bir kez uzun şifreni doğrula ve 6 haneli PIN belirle.' : '');
    byId(mode === 'setup' ? 'htPinSetupPassword' : mode === 'reset' ? 'htPinResetPassword' : 'htPinUnlockInput').focus();
  }
  async function resume() {
    feedback('');
    pinPage().hidden = true;
    lastActivity = Date.now();
    lastTouch = Date.now();
    active = true;
    if (ready) await ready();
  }
  async function enter(session, onReady) {
    ready = onReady;
    window.HTBio?.sync(session);
    if (!session.pin?.configured) { display('setup'); return; }
    if (session.pin.locked) { display('unlock'); return; }
    await resume();
  }
  async function lockNow() {
    if (!active || locking) return;
    locking = true;
    // Hide potentially sensitive figures before awaiting the server.
    byId('appPage').hidden = true;
    try {
      await apiCall('pin/lock', 'POST');
      try { channel?.postMessage('lock'); } catch {}
      try { localStorage.setItem('ht-pin-lock-notice', String(Date.now())); } catch {}
      location.reload(); // Drop rendered financial records and all in-memory account data.
    } catch (error) {
      locking = false;
      active = false;
      display('unlock');
      feedback('Kilitleme bağlantısı doğrulanamadı. Güvenlik için yeniden giriş yap.', true);
      // If the network is offline, a new page avoids lingering financial data in the DOM.
      location.reload();
    }
  }
  function touch() {
    if (!active || document.hidden || byId('appPage').hidden) return;
    const now = Date.now();
    lastActivity = now;
    if (now - lastTouch < TOUCH_MS) return;
    lastTouch = now;
    apiCall('pin/touch','POST').catch(() => location.reload());
  }
  function checkIdle() {
    if (!active || locking || byId('appPage').hidden) return;
    if (Date.now() - lastActivity >= AUTO_MS) lockNow();
  }
  for (const eventName of ['pointerdown','keydown','mousemove','wheel','touchstart']) {
    document.addEventListener(eventName, touch, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkIdle();
  });
  window.addEventListener('focus', checkIdle);
  setInterval(checkIdle, 3000);
  window.addEventListener('storage', e => {
    if (e.key === 'ht-pin-lock-notice' && active) location.reload();
  });
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('hesaptakip-pin-security');
    channel.onmessage = e => { if (e.data === 'lock' && active) location.reload(); };
  }
  document.querySelectorAll('[data-ht-pin-lock]').forEach(b => b.addEventListener('click', lockNow));
  document.querySelectorAll('[data-ht-pin-change]').forEach(b => b.addEventListener('click', () => {
    if (!active) return;
    changingMode = 'change';
    byId('htPinChangeForm').reset();
    byId('htPinChangeTitle').textContent = 'PIN değiştir';
    byId('htPinOldLabel').textContent = 'Mevcut PIN';
    byId('htPinOldInput').type = 'password';
    byId('htPinOldInput').inputMode = 'numeric';
    byId('htPinOldInput').maxLength = 6;
    byId('htPinOldInput').autocomplete = 'off';
    byId('htPinOldInput').placeholder = '6 haneli mevcut PIN';
    byId('htPinChangeNotice').textContent = '';
    byId('htPinChangeUsePassword').textContent = 'PIN’i unuttum (uzun şifre)';
    byId('htPinChangeDialog').showModal();
  }));
  byId('htPinUsePassword').addEventListener('click', () => display('reset'));
  byId('htPinBack').addEventListener('click', () => display('unlock'));
  byId('htPinChangeUsePassword').addEventListener('click', () => {
    changingMode = changingMode === 'change' ? 'reset' : 'change';
    byId('htPinOldLabel').textContent = changingMode === 'reset' ? 'Uzun hesap şifresi' : 'Mevcut PIN';
    byId('htPinOldInput').value = '';
    byId('htPinOldInput').inputMode = changingMode === 'reset' ? 'text' : 'numeric';
    byId('htPinOldInput').maxLength = changingMode === 'reset' ? 500 : 6;
    byId('htPinOldInput').placeholder = changingMode === 'reset' ? 'Uzun hesap şifreniz' : '6 haneli mevcut PIN';
    byId('htPinChangeUsePassword').textContent = changingMode === 'reset' ? 'PIN ile değiştir' : 'PIN’i unuttum (uzun şifre)';
  });
  byId('htPinChangeCancel').addEventListener('click', () => byId('htPinChangeDialog').close());
  byId('htPinChangeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, button = form.querySelector('[type=submit]');
    const next = byId('htPinChangeNew').value;
    if (next !== byId('htPinChangeConfirm').value) {
      byId('htPinChangeNotice').textContent = 'Yeni PIN kodları aynı olmalı.'; return;
    }
    button.disabled = true;
    try {
      await apiCall(changingMode === 'reset' ? 'pin/reset' : 'pin/change','POST',
        { new_pin:next, ...(changingMode === 'reset' ?
          { password:byId('htPinOldInput').value } : { old_pin:byId('htPinOldInput').value }) });
      byId('htPinChangeDialog').close();
      alert('PIN güncellendi. Diğer açık oturumlar kilitlendi.');
    } catch (error) { byId('htPinChangeNotice').textContent = error.message; }
    finally { button.disabled = false; }
  });
  byId('htPinUnlockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await apiCall('pin/unlock', 'POST', { pin:byId('htPinUnlockInput').value });
      byId('htPinUnlockInput').value = '';
      await resume();
    } catch (error) {
      feedback(error.message,true);
      byId('htPinUnlockInput').value = '';
      byId('htPinUnlockInput').focus();
    } finally { button.disabled = false; }
  });
  byId('htPinSetupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('[type=submit]');
    const selected = byId('htPinSetupInput').value;
    if (selected !== byId('htPinSetupConfirm').value) {
      feedback('PIN kodları eşleşmiyor.', true); return;
    }
    button.disabled = true;
    try {
      await apiCall('pin/setup','POST',{ password:byId('htPinSetupPassword').value, pin:selected });
      e.currentTarget.reset();
      await resume();
    } catch (error) { feedback(error.message,true); }
    finally { button.disabled = false; }
  });
  byId('htPinResetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('[type=submit]');
    const selected = byId('htPinResetInput').value;
    if (selected !== byId('htPinResetConfirm').value) {
      feedback('Yeni PIN kodları eşleşmiyor.', true); return;
    }
    button.disabled = true;
    try {
      await apiCall('pin/reset','POST',{ password:byId('htPinResetPassword').value, new_pin:selected });
      e.currentTarget.reset();
      await resume();
    } catch (error) { feedback(error.message,true); }
    finally { button.disabled = false; }
  });
  byId('htPinLogout').addEventListener('click', async () => {
    try { await apiCall('logout','POST'); } finally { location.reload(); }
  });
  window.HTPin = { enter, lockNow, biometricVerified: resume };
})();
