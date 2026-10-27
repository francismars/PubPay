// Service Worker for PUBPAY.me PWA
// CACHE_VERSION is injected by webpack on each production build — no manual bump needed.
// VERSION: __CACHE_VERSION__
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME_PREFIX = 'pubpay';
const RUNTIME_CACHE_PREFIX = 'pubpay-runtime';
const CACHE_NAME = `${CACHE_NAME_PREFIX}-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}-${CACHE_VERSION}`;

// Assets to cache on install (static assets without contenthash)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/favicon.ico',
  '/images/android-icon-192x192.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing new version...');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(
          STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))
        );
      })
      .catch(error => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
  // Force immediate activation of new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating new version...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all([
        // Delete old caches
        ...cacheNames
          .filter(cacheName => {
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map(cacheName => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }),
        // Claim all clients immediately
        self.clients.claim()
      ]);
    })
  );
});

// Note: skipWaiting() in install handler already forces immediate activation
// This message handler is kept for manual update triggers if needed in future
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log(
      '[Service Worker] Received SKIP_WAITING message, forcing activation'
    );
    self.skipWaiting();
  }
});

const HTTP_OK = 200;

function isAppShellRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/service-worker.js'
  );
}

// HTML and the worker script must come from the network when it is up.
// cache: 'reload' skips the HTTP cache, which otherwise holds index.html
// for a year and keeps pointing at the old hashed bundles.
// Fetch by URL: passing a navigate-mode Request plus options throws.
async function networkFirst(request) {
  try {
    const response = await fetch(request.url, {
      cache: 'reload',
      credentials: 'same-origin',
      redirect: 'follow'
    });
    if (response && response.status === HTTP_OK && response.type === 'basic') {
      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request.url, responseToCache);
      });
    }
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return Response.error();
  }
}

// Fetch event - hashed assets from cache, app shell from the network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip API requests (always fetch fresh from network)
  // Note: /live/ is a frontend route (SPA), not an API endpoint
  // Backend API endpoints are proxied through Nginx
  const url = new URL(event.request.url);

  // Skip backend API endpoints (these are proxied to port 3002)
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/lightning/') ||
    url.pathname.startsWith('/live/')
  ) {
    // Skip caching - always fetch fresh from network
    return;
  }

  if (isAppShellRequest(event.request, url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached version if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Fetch from network
      return fetch(event.request)
        .then(response => {
          // Don't cache if not a valid response
          if (
            !response ||
            response.status !== HTTP_OK ||
            response.type !== 'basic'
          ) {
            return response;
          }

          // Clone the response for caching
          const responseToCache = response.clone();

          // Cache in runtime cache (for JS/CSS with contenthash)
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // If network fails and we have a cached version, return it
          // For navigation requests, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
