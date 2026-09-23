// Service worker para instalación (PWA) + velocidad en móvil.
// - /_next/static/* (JS/CSS con hash): cache-first; son inmutables entre deploys.
// - Navegaciones (HTML): network-first con respaldo a la última copia guardada.
//   En línea siempre devuelve el documento fresco; con red lenta o cortada
//   responde al instante con la última versión visitada.
// - /api/* va siempre a red: nada de datos viejos ni respuestas sin auth.
const CACHE = "siracartera-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, caché como respaldo.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw new Error("Sin red y sin copia guardada");
        }
      })
    );
    return;
  }

  if (!url.pathname.startsWith("/_next/static/")) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
  );
});