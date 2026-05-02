const CACHE = 'suika-v9';
const ASSETS = [
  './',
  './index.html',
  './js/game.js',
  './js/matter.js',
  './assets/img/circle0.png',
  './assets/img/circle1.png',
  './assets/img/circle2.png',
  './assets/img/circle3.png',
  './assets/img/circle4.png',
  './assets/img/circle5.png',
  './assets/img/circle6.png',
  './assets/img/circle7.png',
  './assets/img/circle8.png',
  './assets/img/circle9.png',
  './assets/img/circle10.png',
  './assets/img/circle11.png',
  './assets/img/circle12.png',
  './assets/img/pop.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/share_template.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // PokeAPI 이미지 — 네트워크 우선, 실패 시 캐시
  if (e.request.url.includes('githubusercontent.com')) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // 나머지 — 캐시 우선
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
