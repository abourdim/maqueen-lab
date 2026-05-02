// sw.js — Service Worker for Maqueen Lab PWA
//
// Cache strategy: per-asset `add().catch()` instead of atomic `addAll()`.
// Reason: `addAll` is all-or-nothing — one missing asset (e.g. a model file
// that was deleted in a refactor) aborts the entire install and the PWA
// never caches anything. This was happening before — the previous ASSETS
// list referenced 5 deleted files (makecode.ts + 4 models) so cache install
// silently failed on every page load.
const CACHE_NAME = 'maqueen-lab-v11';
const ASSETS = [
    'index.html',
    'styles.css',
    'js/lang.js',
    'js/core.js',
    'js/ble.js',
    'js/sensors.js',
    'js/controls.js',
    'js/servos.js',
    'js/others.js',
    'js/graph.js',
    'js/board3d.js',
    'js/models/microbit.js',
    'docs/guide.html',
    'assets/logo.svg',
    'manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            // Per-asset add with .catch — one 404 doesn't kill the whole install.
            Promise.all(ASSETS.map(asset =>
                cache.add(asset).catch(err =>
                    console.warn('[sw] skip ' + asset + ':', err && err.message || err)
                )
            ))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
