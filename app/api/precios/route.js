import { obtenerPrecios, obtenerPreciosDirecto, obtenerTipoCambioDolares } from "@/lib/precios";
import { leerCierresManuales } from "@/lib/storage";
import { cierreManualVigente } from "@/lib/calculos";

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

  // El mapa `usa` (NYSE/NASDAQ directo) solo lo necesita el modo USA·USD: no
  // se calcula en el camino común (ahorra ~1 request a Yahoo por ticker).
  // El dólar se pide en paralelo con el resto (antes los bloqueaba).
  const quiereUsa = url.searchParams.get("usa") === "1";
  const [dolares, cedear, usa, manuales] = await Promise.all([
    obtenerTipoCambioDolares(),
    tickers.length ? obtenerPrecios(tickers) : new Map(),
    quiereUsa && tickers.length ? obtenerPreciosDirecto(tickers) : new Map(),
    tickers.length ? leerCierresManuales() : {},
  ]);

  if (!tickers.length) {
    return Response.json(
      { ts: Date.now(), ccl: dolares.ccl, oficial: dolares.oficial, cedear: {}, usa: {} },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=45" } }
    );
  }

  // Un cierre guardado a mano (ej. SPCX) pisa la cotización viva fuera de
  // rueda: vale hasta que abra la próxima sesión (BYMA 10:30–17:00 ART).
  // En rueda manda el vivo.
  const ahoraPrecios = new Date();
  for (const tk of tickers) {
    const manual = cierreManualVigente(manuales, tk, ahoraPrecios);
    if (manual != null) {
      cedear.set(tk, { precio: manual.precio, ultimo: manual.precio, moneda: "ARS", variacionDiariaPct: null, cierreManual: true });
    }
  }

  const map = (m) => {
    const resultado = {};
    for (const [ticker, dato] of m) resultado[ticker] = dato;
    return resultado;
  };

  // El server ya cachea fuentes 15 s: se refleja en el cliente para que las
  // aperturas repetidas (mount de TablaTenencias/DolarCCL/...) resuelvan
  // al instante desde la caché HTTP y revaliden en fondo. No agrega staleness
  // más allá del que ya existe server-side.
  return Response.json(
    { ts: Date.now(), ccl: dolares.ccl, oficial: dolares.oficial, cedear: map(cedear), usa: map(usa) },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=45" } }
  );
}