import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = file => readFileSync(new URL('../public/' + file, import.meta.url));
const html = read('index.html').toString('utf8');
const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));
const sw = read('sw.js').toString('utf8');
const script = read('pwa-install.js').toString('utf8');

function pngDimensions(file) {
  const data = read(file);
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file+' PNG signature');
  assert.equal(data.subarray(12,16).toString('ascii'),'IHDR');
  return [data.readUInt32BE(16),data.readUInt32BE(20)];
}

test('HesapTakip manifest enables standalone desktop and mobile installation', () => {
  assert.equal(manifest.name,'HesapTakip');
  assert.equal(manifest.short_name,'HesapTakip');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.lang,'tr-TR');
  assert.deepEqual(manifest.icons.filter(icon=>icon.purpose==='any' && icon.type==='image/png')
    .map(icon=>icon.sizes),['192x192','512x512']);
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable' && icon.sizes==='512x512'));
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png"/);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/favicon.svg"/);
});

test('app icons and Apple touch icon are real PNG files of the declared dimensions', () => {
  for (const [file,size] of [
    ['icons/icon-192.png',192], ['icons/icon-512.png',512],
    ['icons/icon-maskable-512.png',512], ['apple-touch-icon.png',180],
    ['favicon-32.png',32],
  ]) assert.deepEqual(pngDimensions(file),[size,size]);
  assert.equal(read('favicon.ico').subarray(0,4).toString('hex'),'00000100');
  assert.match(read('favicon.svg').toString('utf8'),/<svg/);
});

test('all three app headers use the brand image and install helper exists', () => {
  assert.equal((html.match(/class="pwa-brand-logo"/g)||[]).length,3);
  assert.equal((html.match(/data-pwa-install hidden/g)||[]).length,2);
  assert.match(html,/id="pwaInstallTitle"/);
  assert.match(html,/Ana Ekrana Ekle/);
  assert.match(html,/Uygulamayı yükle/);
  assert.match(html,/src="\/pwa-install.js" defer/);
  assert.match(script,/beforeinstallprompt/);
  assert.match(script,/appinstalled/);
  assert.match(script,/serviceWorker.register\('\/sw.js'/);
});

test('offline service worker never caches signed-in finance data or API responses', () => {
  assert.match(sw,/event.request.mode !== 'navigate'/);
  assert.match(sw,/url.pathname.startsWith\('\/api\/'\)/);
  assert.match(sw,/fetch\(event.request, \{cache:'no-store'\}\)/);
  assert.doesNotMatch(sw,/cache\.put/);
  assert.doesNotMatch(sw,/cache\.addAll/);
  assert.match(sw,/caches\.open\(OFFLINE_CACHE\)/);
  assert.match(read('offline.html').toString('utf8'),/İnternet bağlantısı yok/);
});
