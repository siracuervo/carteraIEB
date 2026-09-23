// Service worker para instalación (PWA) + velocidad en móvil.
// - /_next/static/* (JS/CSS con hash): cache-first; son inmutables entre deploys.
// - Navegaciones (HTML): carrera red vs timeout (2,5 s). En red buena manda la
//   red (siempre fresco); en red lenta de móvil responde al instante con la
//   última copia guardada y actualiza la caché en fondo. Sin copia guardada se
//   espera la red real. Solo se cachea HTML con 200 (nunca 401s ni errores).
// - Calentado: al activarse precarga el HTML de las 4 rutas (best-effort; si la
//   Basic Auth lo rechaza se ignora) para que la app instalada abra al instante
//   y las pestañas cambien sin red.
// - /api/* va siempre a red: nada de datos viejos ni respuestas sin auth (la
//   caché HTTP del navegador con stale-while-revalidate igual aplica antes).
const CACHE = "siracartera-v4";
const RUTAS_PRECALENTAR = ["/", "/trades", "/movimientos", "/proyeccion"];
const TIMEOUT_NAVEGACION_MS = 2500;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      const cache = await caches.open(CACHE);
      // Precalentado best-effort: solo HTML 200; un 401 (sin auth) u otro error
      // simplemente no se guarda.
      await Promise.allSettled(
        RUTAS_PRECALENTAR.map(async (ruta) => {
          try {
            const res = await fetch(ruta, { credentials: "same-origin" });
            if (res && res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
              await cache.put(ruta, res.clone());
            }
          } catch {
            // sin red en la activación: no pasa nada
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

function esHTMLCacheable(res) {
  return !!res && res.ok && (res.headers.get("content-type") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red con timeout → caché → espera real.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const red = fetch(request);
        // La red siempre actualiza la caché en fondo cuando responde bien.
        red
          .then((r) => {
            if (esHTMLCacheable(r)) cache.put(request, r.clone()).catch(() => {});
          })
          .catch(() => {});
        const timeout = new Promise((res) => setTimeout(() => res("timeout"), TIMEOUT_NAVEGACION_MS));
        try {
          const ganador = await Promise.race([red, timeout]);
          if (ganador !== "timeout") return ganador;
        } catch {
          // red caída de entrada: se intenta la caché abajo
        }
        const copia = await cache.match(request);
        if (copia) return copia;
        // Sin copia guardada no queda otra que esperar la red real.
        return red.catch(() => {
          throw new Error("Sin red y sin copia guardada");
        });
      })()
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