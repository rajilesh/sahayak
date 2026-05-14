const CACHE = "sahayak-v5";
const ASSETS = ["/", "/index.html", "/styles.css", "/report.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg", "/md.js"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache API
  // Network-first for HTML/JS/CSS so updates show up; cache fallback for offline.
  if (/\.(?:html|js|css)$/.test(url.pathname) || url.pathname === "/") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
