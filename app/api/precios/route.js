import { obtenerPrecios, obtenerPreciosDirecto, obtenerTipoCambioDolares } from "@/lib/precios";
import { leerCierresManuales } from "@/lib/storage";
import { aISO } from "@/lib/accesosRapidosFecha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Precios en vivo para refrescar la página principal sin recargar. Recibe
 * `?tickers=HPQ,BMA,...` y devuelve:
 *   - cedear: cotización local .BA en ARS (sufijo .BA si aplica),
 *   - usa:    cotización del símbolo directo (NYSE/NASDAQ) en USD,
 *   - ccl:    tipo de cambio CCL del día (o MEP/oficial si CCL no está disponible),
 *   - oficial: dólar oficial del día.
 * Fuente gratuita: Yahoo Finance y dolarapi.com (ver lib/precios.js), cache de 60s.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const tickers = (url.searchParams.get("tickers") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dolares = await obtenerTipoCambioDolares();

  if (!tickers.length) {
    return Response.json({ ts: Date.now(), ccl: dolares.ccl, oficial: dolares.oficial, cedear: {}, usa: {} });
  }

  const [cedear, usa, manuales] = await Promise.all([
    obtenerPrecios(tickers),
    obtenerPreciosDirecto(tickers),
    leerCierresManuales(),
  ]);

  // Un cierre guardado a mano hoy (ej. SPCX) pisa la cotización viva: es el
  // precio que el usuario fijó y vale para todo el día.
  const hoy = aISO(new Date());
  const manualesHoy = manuales[hoy] || {};
  for (const tk of tickers) {
    const pHoy = manualesHoy[tk] ?? manualesHoy[String(tk).toUpperCase()];
    if (pHoy != null && pHoy > 0) {
      cedear.set(tk, { precio: pHoy, ultimo: pHoy, moneda: "ARS", variacionDiariaPct: null, cierreManual: true });
    }
  }

  const map = (m) => {
    const resultado = {};
    for (const [ticker, dato] of m) resultado[ticker] = dato;
    return resultado;
  };

  return Response.json({ ts: Date.now(), ccl: dolares.ccl, oficial: dolares.oficial, cedear: map(cedear), usa: map(usa) });
}