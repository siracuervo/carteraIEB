import { ARCHIVOS_RESPALDO, migrarArchivoAR2 } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Migración Blob → R2 por única vez: copia cada JSON del store legado al
 * bucket R2 y verifica leyéndolo de vuelta. Protegida con CRON_SECRET igual
 * que el cron (header `Authorization: Bearer <CRON_SECRET>`).
 * Uso: GET /api/migrar-r2 con el header, una sola vez tras configurar R2_*.
 * Después se borra esta ruta y la dependencia @vercel/blob.
 */
export async function GET(request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const resumen = {};
  for (const nombre of ARCHIVOS_RESPALDO) {
    try {
      resumen[nombre] = await migrarArchivoAR2(nombre);
    } catch (err) {
      resumen[nombre] = { estado: "error", detalle: err.message };
    }
  }
  return Response.json({ resumen });
}
