// Worker custom de Cloudflare: reutiliza el fetch generado por OpenNext y suma
// el scheduled handler del cron diario.
//
// Por qué existe: los triggers cron de Cloudflare disparan el Worker SIN
// headers HTTP, pero /api/cron/cierres exige
// `Authorization: Bearer <CRON_SECRET>` (ver app/api/cron/cierres/route.js).
// El scheduled se auto-llama vía el service binding WORKER_SELF_REFERENCE
// (ya declarado en wrangler.jsonc) agregando el Bearer desde el secret.

// @ts-ignore `.open-next/worker.js` se genera en el build, no existe en el repo
import { default as handler } from "./.open-next/worker.js";

interface Env extends CloudflareEnv {
  CRON_SECRET?: string;
}

export default {
  fetch: handler.fetch,

  // Cron lun-vie 20:05 ART (ver triggers en wrangler.jsonc): guarda los
  // cierres del día aunque nadie haya entrado a la app.
  async scheduled(_event, env: Env) {
    if (!env.CRON_SECRET) {
      console.error("[cron] CRON_SECRET sin configurar, se omite la corrida.");
      return;
    }
    // proxy.js deja pasar /api/cron/cierres sin Basic (tiene Bearer propio).
    const res = await env.WORKER_SELF_REFERENCE.fetch(
      new Request("https://worker/api/cron/cierres", {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      })
    );
    const cuerpo = await res.text();
    if (!res.ok) {
      console.error(`[cron] /api/cron/cierres -> ${res.status}: ${cuerpo.slice(0, 500)}`);
      return;
    }
    console.log(`[cron] /api/cron/cierres OK: ${cuerpo.slice(0, 500)}`);
  },
} satisfies ExportedHandler<Env>;
