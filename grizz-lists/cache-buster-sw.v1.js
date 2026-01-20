// ============================================
// CACHE BUSTER - Service Worker
// Forces fresh fetches for same-origin resources
// ============================================

// Service workers require the global `self` reference
/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'cache-buster-v1';

// Resource types to apply cache busting to
const BUSTABLE_EXTENSIONS = ['.js', '.css', '.html', '.json'];

// Check if URL should have cache busted
function shouldBustCache(url) {
  try {
    const parsedUrl = new URL(url);

    // Only same-origin
    if (parsedUrl.origin !== self.location.origin) {
      return false;
    }

    // Check if it's a bustable resource type
    const pathname = parsedUrl.pathname.toLowerCase();
    return BUSTABLE_EXTENSIONS.some((ext) => pathname.endsWith(ext))
               || pathname.endsWith('/') // HTML pages
               || !pathname.includes('.'); // Extensionless paths (likely HTML)
  } catch {
    return false;
  }
}

// Install event - take over immediately
self.addEventListener('install', () => {
  // eslint-disable-next-line no-console
  console.log('[CacheBuster SW] Installing...');
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  // eslint-disable-next-line no-console
  console.log('[CacheBuster SW] Activating...');
  event.waitUntil(
    Promise.all([
      // Take control of all pages immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )),
    ]),
  );
});

// Fetch event - network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Only bust cache for specific resources
  if (!shouldBustCache(request.url)) {
    return;
  }

  event.respondWith(
    // Try network first with cache: 'reload' to bypass browser cache
    fetch(request, { cache: 'reload' })
      .then((response) => {
        // Clone response for caching
        const responseClone = response.clone();

        // Cache the fresh response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });

        return response;
      })
      .catch(() => caches.match(request)),
  );
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'bustCache') {
    // eslint-disable-next-line no-console
    console.log('[CacheBuster SW] Manual cache bust requested');

    // Clear all caches
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => {
        // Notify all clients
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'cacheBusted' });
          });
        });
      }),
    );
  }
});
