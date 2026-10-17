const CACHE = "sapo-app-shell-v2";
const SHELL = ["/app/offline.html", "/app/images/sapo.png", "/app/images/sapo-mouth-open.png", "/app/icons/app-192.png"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("activate", (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("sapo-app-shell-") && key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/") || url.pathname.startsWith("/app/api/")) return;
    if (request.mode === "navigate") {
        event.respondWith(fetch(request).catch(() => caches.match("/app/offline.html")));
    } else if (SHELL.includes(url.pathname)) {
        event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    }
});
