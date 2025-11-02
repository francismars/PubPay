// Service Worker for PUBPAY.me PWA
const CACHE_NAME = 'pubpay-v1';
const RUNTIME_CACHE = 'pubpay-runtime-v1';

// Assets to cache on install (static assets without contenthash)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/favicon.ico',
  '/images/android-icon-192x192.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
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
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/lightning/') ||
      (url.pathname.startsWith('/multi/') && !url.pathname.startsWith('/live/multi/'))) {
    // Skip caching - always fetch fresh from network
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();

            // Cache in runtime cache (for JS/CSS with contenthash)
            caches.open(RUNTIME_CACHE).then((cache) => {
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

