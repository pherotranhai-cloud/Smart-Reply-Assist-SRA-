const CACHE_NAME = 'smart-reply-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Potential icons to cache
const ICONS = [
  '/icon16.png',
  '/icon48.png',
  '/icon128.png',
  '/icon192.png',
  '/icon512.png'
];

// Lifecycle: Install
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll([...STATIC_ASSETS, ...ICONS]).catch(() => {
        // Fallback if some icons are missing during build/dev
        return cache.addAll(STATIC_ASSETS);
      });
    })
  );
});

// Lifecycle: Activate
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating and cleaning old caches');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Lifecycle: Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // 1. API Calls Strategy: Network First
  // (Handles Gemini API and backend vocab fetches)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Optionally cache successful API responses here if needed
          return response;
        })
        .catch(() => {
          // Fail gracefully for API calls
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return new Response(JSON.stringify({ error: 'Network unavailable', offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // 2. Static Assets Strategy: Stale-While-Revalidate
  // (UI, Icons, Scripts, Styles)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failure, browser will use cachedResponse if available
      });

      return cachedResponse || fetchPromise;
    })
  );
});

/*
// ==========================================
// Registration Snippet
// ==========================================
// Paste this into your main entry file (e.g., src/main.tsx or index.html)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registered. Scope:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
// ==========================================
*/
