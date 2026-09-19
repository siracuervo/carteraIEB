import { obtenerPrecios, obtenerPreciosDirecto, obtenerTipoCambioDolares } from "@/lib/precios";

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

  const [cedear, usa] = await Promise.all([
    obtenerPrecios(tickers),
    obtenerPreciosDirecto(tickers),
  ]);

  const map = (m) => {
    const resultado = {};
    for (const [ticker, dato] of m) resultado[ticker] = dato;
    return resultado;
  };

  return Response.json({ ts: Date.now(), ccl: dolares.ccl, oficial: dolares.oficial, cedear: map(cedear), usa: map(usa) });
}