// Migration only: retire installations that previously controlled /app/.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
    event.waitUntil(Promise.all([
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key.startsWith("sapo-app-shell-")).map((key) => caches.delete(key))
        )),
        self.registration.unregister(),
    ]));
});
