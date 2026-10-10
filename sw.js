// Service worker: cho phép app chạy offline sau lần mở đầu tiên.
// Khi sửa data.js / app.js, tăng VERSION để iPhone tải bản mới.
const VERSION = 'v9';
const CACHE = 'zh-study-' + VERSION;
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stale-while-revalidate: mở app ngay từ cache (nhanh, không chờ mạng),
// đồng thời tải bản mới ở nền → lần mở sau sẽ thấy nội dung mới.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached || cache.match('index.html'));
    if (cached) { e.waitUntil(network); return cached; }
    return network;
  }));
});
