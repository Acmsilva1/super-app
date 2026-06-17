/**
 * Service Worker - SUPERAPP PWA
 * Incrementar CACHE_VERSION a cada deploy/commit para invalidar cache e forcar atualizacao.
 */
const CACHE_VERSION = '2026-06-17-no-stale-shell-v1';
const CACHE_NAME = 'superapp-' + CACHE_VERSION;

const ESSENTIAL_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ESSENTIAL_ASSETS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('superapp-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.method !== 'GET') return;

  // API deve sempre priorizar rede para refletir dados mais recentes da Vercel.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.html');

  // JS de modulos (import dinamico em /features/...) precisa vir sempre da rede para evitar shell antiga.
  const isStaleSensitiveScript =
    url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs');

  if (isHtmlRequest || isStaleSensitiveScript) {
    event.respondWith(
      fetch(event.request)
    );
    return;
  }

  // Demais assets: rede primeiro, com fallback de cache apenas para manter imagens e ícones responsivos.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      })
  );
});
