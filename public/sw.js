/* HesapTakip v16: safe PWA offline fallback.
   Financial APIs, private pages, and authenticated responses are never cached. */
const OFFLINE_CACHE = 'hesaptakip-offline-v16';
const OFFLINE_URL = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('hesaptakip-offline-') && key !== OFFLINE_CACHE)
      .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request, {cache:'no-store'})
      .catch(async () => (await caches.match(OFFLINE_URL)) ||
        new Response('Çevrimdışısınız. Bağlantınızı kontrol edin.', {
          status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}
        }))
  );
});
