/**
 * Service Worker – SUPERAPP PWA
 * Incrementar CACHE_VERSION a cada deploy/commit para invalidar cache e forçar atualização.
 */
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = 'superapp-' + CACHE_VERSION;

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('superapp-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((res) => {
        const clone = res.clone();
        if (res.ok && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')))
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => cached || caches.match('/') || caches.match('/index.html'));
      return cached || fetchPromise;
    })
  );
});
