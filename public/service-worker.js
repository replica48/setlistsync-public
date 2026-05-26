// BUMP THE VERSION NAME - This is critical to force all users to update
const STATIC_CACHE_NAME = 'setlistsync-static-cache-v12'; 
const DYNAMIC_CACHE_NAME = 'setlistsync-dynamic-cache-v3';  // This will clear PDF/TXT caches

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/setlistsynclogo_32px.png',
  // Add other core assets here
];

// --- INSTALL: Cache the static app shell ---
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// --- ACTIVATE: Clean up old, unused caches ---
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  const currentCaches = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If a cache's name isn't in our current list, delete it.
          if (!currentCaches.includes(cacheName)) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// --- FETCH: Use smart strategies for caching ---
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // We only want to process GET requests
  if (request.method !== 'GET') {
    return;
  }

  // STRATEGY: Stale-While-Revalidate for PDF/TXT files (Dynamic Content)
  // (Fast, serves from cache first but updates in background)
  if (request.url.match(/\.(pdf|txt)$/)) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          const fetchPromise = fetch(request)
            .then(networkResponse => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            })
            .catch(err => {
              // --- THIS IS THE FIX ---
              // If the network fails (e.g., CORS error), log it but don't crash.
              // If we have a cached response, we'll still return it below.
              console.error('Service Worker: Dynamic cache fetch failed:', err);
            });
            
          return cachedResponse || fetchPromise;
        });
      })
    );
    return; // Stop execution for this rule
  }

  // STRATEGY: Network-First for all other requests (App Shell, JS, CSS)
  // (Ensures the user always gets the freshest app code)
  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        // If we get a good response, update the static cache
        return caches.open(STATIC_CACHE_NAME).then(cache => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // --- THIS IS THE FIX (Graceful Fallback) ---
        // If the network fails, try to serve from the cache
        return caches.match(request).then(cachedResponse => {
            // If the specific file isn't in the cache, serve the main index.html
            // This is key for SPA routing to work offline
            return cachedResponse || caches.match('/');
        });
      })
  );
});