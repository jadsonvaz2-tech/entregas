
const CACHE = 'scanner-entregas-cache-v3';

const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    await Promise.all(FILES.map(async file => {
      try {
        const response = await fetch(file, { cache: 'reload' });
        if (response.ok) {
          await cache.put(file, response);
        }
      } catch (error) {
        console.log('Arquivo não armazenado:', file);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('scanner-entregas-cache-') &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppFile =
    path.endsWith('/app.js') ||
    path.endsWith('/index.html') ||
    path.endsWith('/');

  if (isAppFile) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, {
          cache: 'no-cache'
        });

        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await caches.match(request);

        if (cached) return cached;

        return new Response(
          'Arquivo indisponível. Conecte-se à internet e tente novamente.',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        );
      }
    })());

    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) return cached;

    try {
      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      return new Response('', { status: 503 });
    }
  })());
});
