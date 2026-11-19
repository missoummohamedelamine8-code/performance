// Service worker — Performance
// Incrémenter VERSION à chaque déploiement : l'app proposera la mise à jour.
// Les données (IndexedDB) ne sont jamais touchées par les mises à jour.
const VERSION = 'v1.0.3';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/core.js', 'js/calc.js', 'js/nav.js', 'js/ui.js', 'js/charts.js', 'js/importer.js', 'js/foods.js',
  'js/views-home.js', 'js/views-train.js', 'js/views-workout.js', 'js/views-run.js', 'js/views-activity.js',
  'js/views-nutrition.js', 'js/views-progress.js', 'js/views-profile.js',
  'data/ciqual.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const CDN = ['cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', e => {
  // s'active tout de suite, sans attendre la fermeture des onglets
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Bibliothèques (lecteur XLSX, scanner) : mises en cache au premier usage
  if (CDN.includes(url.hostname)) { e.respondWith(cacheFirst(req, RUNTIME)); return; }
  // Photos de produits Open Food Facts : cache, sans bloquer
  if (url.hostname.endsWith('openfoodfacts.org') && /\.(jpg|png|webp)$/.test(url.pathname)) { e.respondWith(cacheFirst(req, RUNTIME)); return; }
  if (url.origin !== location.origin) return; // API : réseau uniquement
  // Application : cache d'abord (hors ligne), navigation -> index.html
  if (req.mode === 'navigate') { e.respondWith(caches.match('index.html', { ignoreSearch: true }).then(r => r || fetch(req))); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => { if (res.ok) caches.open(RUNTIME).then(c => c.put(req, res.clone())); return res; })));
});

async function cacheFirst(req, name) {
  const c = await caches.open(name); const hit = await c.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
  catch (err) { return hit || Response.error(); }
}
