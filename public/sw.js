/*
 * Service worker of the public website. Its only jobs are to make the site
 * installable as an app and to show a friendly page when there is no internet.
 *
 * It deliberately caches nothing private: pages are always fetched from the
 * network (a member's details must never be served from a cache on a shared
 * phone), and only the offline page and its logo are stored.
 */
const CACHE = 'ckp-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only whole-page loads get the offline page; everything else goes straight to the network.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
