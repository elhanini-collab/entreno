// Service worker mínimo. Cachea solo los archivos estáticos propios para que la
// app abra rápido y funcione sin conexión a nivel de interfaz. Nunca cachea el
// SDK de Firebase ni las peticiones a Firestore/Auth (esas van siempre a la red).
const CACHE = "carga-v30";
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
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./favicon.ico",
  "./brand-lockup.png",
  "./img/musculos/chest.png",
  "./img/musculos/lats.png",
  "./img/musculos/shoulders.png",
  "./img/musculos/biceps.png",
  "./img/musculos/triceps.png",
  "./img/musculos/quadriceps.png",
  "./img/musculos/hamstrings.png",
  "./img/musculos/glutes.png",
  "./img/musculos/calves.png",
  "./img/musculos/abdominals.png",
];

const CORE = ASSETS.slice(0, 9);
const EXTRA = ASSETS.slice(9);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(CORE);                       // imprescindibles
      await Promise.allSettled(EXTRA.map((u) => c.add(u)));  // iconos: mejor esfuerzo
    }).then(() => self.skipWaiting())
  );
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
