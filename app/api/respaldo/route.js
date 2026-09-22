import { leerTodosLosDatos } from "@/lib/storage";
import { aISO } from "@/lib/accesosRapidosFecha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Descarga el respaldo completo de la carpeta data como un único JSON. */
export async function GET() {
  const archivos = await leerTodosLosDatos();
  const hoy = aISO(new Date());
  const cuerpo = JSON.stringify({ version: 1, exportado: hoy, archivos }, null, 2);
  return new Response(cuerpo, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="respaldo-cartera-${hoy}.json"`,
    },
  });
}
