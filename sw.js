// Service worker mínimo. Cachea solo los archivos estáticos propios para que la
// app abra rápido y funcione sin conexión a nivel de interfaz. Nunca cachea el
// SDK de Firebase ni las peticiones a Firestore/Auth (esas van siempre a la red).
const CACHE = "carga-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./routine.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Solo gestionamos peticiones del propio origen y método GET.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Red primero (para recoger actualizaciones); si falla, servimos de caché.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
