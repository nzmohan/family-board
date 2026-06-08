// Minimal service worker — enables "Add to Home Screen" and caches the app shell.
const CACHE = "famboard-v1";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache Supabase API/realtime — always go to network.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("esm.sh")) return;
  // App shell: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (e.request.method === "GET" && res.ok) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
