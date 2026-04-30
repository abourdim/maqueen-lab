// sw.js — Service Worker for micro:bit Playground PWA
const CACHE_NAME = 'microbit-playground-v10';
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
    'js/models/buggy.js',
    'js/models/arm.js',
    'js/models/balance.js',
    'js/models/weather.js',
    'makecode.ts',
    'docs/guide.html',
    'assets/logo.svg',
    'manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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
