const CACHE = 'fitforge12-static-v12';
const CACHE_PREFIX = 'fitforge12-static-';
const APP_SCOPE = new URL(self.registration.scope);
const APP_SHELL = new URL('index.html', APP_SCOPE);
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './food-search.js',
  './meal-assistant.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((path) =>
      new Request(new URL(path, APP_SCOPE), { cache: 'reload' })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('range') ||
      url.origin !== APP_SCOPE.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) {
    return;
  }

  const response = fetch(request, { cache: 'no-store' }).catch(() => undefined);

  event.waitUntil(response.then(async (fresh) => {
    if (fresh?.ok && !fresh.redirected) {
      const copy = fresh.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
  }).catch(() => {
    // A cache write failure should not interrupt an online response.
  }));

  event.respondWith((async () => {
    const fresh = await response;
    if (fresh && fresh.status < 500) return fresh;

    const cached = await caches.match(request, { cacheName: CACHE });
    if (cached) return cached;

    if (request.mode === 'navigate' &&
        (url.pathname === APP_SCOPE.pathname || url.pathname === APP_SHELL.pathname)) {
      const shell = await caches.match(APP_SHELL.href, { cacheName: CACHE });
      if (shell) return shell;
    }

    return fresh || Response.error();
  })());
});
