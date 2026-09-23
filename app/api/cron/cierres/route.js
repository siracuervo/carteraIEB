import { leerTransacciones, leerPortafolioHistorial, leerCierresManuales, mergeCierresDiarios, limpiarVersionesViejasBlob } from "@/lib/storage";
import { resolverTickersConPortafolio } from "@/lib/calculos";
import { obtenerPrecios } from "@/lib/precios";
import { TICKERS_NO_MERCADO } from "@/lib/clasificacion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fecha en hora argentina (UTC−3 fijo, sin DST). */
function hoyART() {
  const ahora = new Date(Date.now() - 3 * 3600 * 1000);
  const y = ahora.getUTCFullYear();
  const m = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ahora.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Cron diario (lun–vie 17:05 ART, ver vercel.json): guarda los cierres del día
 * aunque no hayas entrado a la app. Corre después del cierre de BYMA, así lo
 * guardado es el último operado real y no una punta intradiaria.
 * Los cierres guardados a mano no se pisan.
 */
export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET sin configurar." }, { status: 401 });
  }
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const [transaccionesRaw, portafolioHistorial, manuales] = await Promise.all([
    leerTransacciones(),
    leerPortafolioHistorial(),
    leerCierresManuales(),
  ]);
  const transacciones = resolverTickersConPortafolio(transaccionesRaw, portafolioHistorial);

  const tickers = Array.from(
    new Set([
      ...transacciones.map((t) => t.ticker).filter(Boolean),
      ...portafolioHistorial.flatMap((h) => (h.tenencias || []).map((t) => t.ticker).filter(Boolean)),
    ])
  ).filter((t) => !TICKERS_NO_MERCADO.has(String(t).toUpperCase()));

  if (!tickers.length) {
    return Response.json({ fecha: hoyART(), guardados: 0, motivo: "Sin tickers." });
  }

  const precios = await obtenerPrecios(tickers);
  const fecha = hoyART();
  const manualesHoy = manuales[fecha] || {};
  const mapa = {};
  for (const [tk, cot] of precios) {
    if (!cot?.precio || (cot.moneda && cot.moneda !== "ARS")) continue;
    if (manualesHoy[tk] != null) continue;
    const px = cot.ultimo ?? cot.precio;
    if (px == null || !(px > 0)) continue;
    mapa[tk] = px;
  }

  if (!Object.keys(mapa).length) {
    return Response.json({ fecha, guardados: 0, motivo: "Sin cotizaciones." });
  }

  await mergeCierresDiarios({ [fecha]: mapa }, { forzar: true });
  // Poda diaria de versiones viejas con sufijo (cuando cada put creaba una URL
  // nueva): con rutas fijas ya no se generan más. Best-effort, no bloquea.
  let limpiadas = 0;
  try {
    limpiadas = await limpiarVersionesViejasBlob();
  } catch {
    // se poda en la próxima corrida
  }
  return Response.json({ fecha, guardados: Object.keys(mapa).length, tickers: Object.keys(mapa).sort(), limpiadas });
}
