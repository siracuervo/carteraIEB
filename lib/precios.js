// Precios de mercado en vivo. Usamos el endpoint no-oficial de Yahoo Finance
// (sufijo .BA para instrumentos que cotizan en BYMA) y dolarapi.com para el
// tipo de cambio. Ninguno de los dos requiere API key. Si una fuente falla,
// devolvemos null para ese instrumento y la UI ofrece carga manual.

const TTL_MS = 60_000;
const cachePrecios = new Map(); // symbol -> { data, ts }
let cacheCCL = { data: null, ts: 0 };

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

async function obtenerPrecioYahoo(symbol) {
  const cacheado = cachePrecios.get(symbol);
  if (cacheado && Date.now() - cacheado.ts < TTL_MS) return cacheado.data;

  let resultado = null;
  try {
    const json = await fetchJSON(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    );
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      resultado = {
        precio: meta.regularMarketPrice,
        moneda: meta.currency || null,
        actualizado: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
        variacionDiariaPct: meta.regularMarketChangePercent != null ? meta.regularMarketChangePercent / 100 : null,
      };
    }
  } catch {
    resultado = null;
  }

  cachePrecios.set(symbol, { data: resultado, ts: Date.now() });
  return resultado;
}

/**
 * Trae precios para una lista de tickers de IEB (ej. "AAPL", "BMA"), probando
 * el símbolo tal cual y con sufijo .BA (BYMA). Devuelve un Map ticker -> resultado|null.
 */
export async function obtenerPrecios(tickers) {
  const unicos = Array.from(new Set(tickers.filter(Boolean)));
  const resultados = await Promise.all(
    unicos.map(async (ticker) => {
      const conSufijo = await obtenerPrecioYahoo(`${ticker}.BA`);
      if (conSufijo) return [ticker, { ...conSufijo, symbol: `${ticker}.BA` }];
      const directo = await obtenerPrecioYahoo(ticker);
      if (directo) return [ticker, { ...directo, symbol: ticker }];
      return [ticker, null];
    })
  );
  return new Map(resultados);
}

/** Tipo de cambio USD/ARS "contado con liqui" (o MEP/oficial si CCL no está disponible). */
export async function obtenerTipoCambioCCL() {
  if (cacheCCL.data && Date.now() - cacheCCL.ts < TTL_MS) return cacheCCL.data;

  let valor = null;
  try {
    const lista = await fetchJSON("https://dolarapi.com/v1/dolares");
    const porCasa = Object.fromEntries((lista || []).map((d) => [d.casa, d]));
    const elegido = porCasa.contadoconliqui || porCasa.mep || porCasa.oficial;
    if (elegido?.venta) valor = elegido.venta;
  } catch {
    valor = null;
  }

  cacheCCL = { data: valor, ts: Date.now() };
  return valor;
}

/** Último cierre disponible en o antes de fechaISO ("YYYY-MM-DD"). Para reconstruir valores pasados. */
async function obtenerPrecioHistoricoYahoo(symbol, fechaISO) {
  const objetivo = new Date(`${fechaISO}T12:00:00Z`).getTime();
  const period1 = Math.floor((objetivo - 9 * 86400000) / 1000);
  const period2 = Math.floor((objetivo + 1 * 86400000) / 1000);

  try {
    const json = await fetchJSON(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`
    );
    const resultado = json?.chart?.result?.[0];
    const timestamps = resultado?.timestamp || [];
    const cierres = resultado?.indicators?.quote?.[0]?.close || [];
    let precio = null;
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] * 1000 > objetivo) break;
      if (cierres[i] != null) precio = cierres[i];
    }
    if (precio == null) return null;
    return { precio, moneda: resultado.meta?.currency || null };
  } catch {
    return null;
  }
}

/** Igual que obtenerPrecios pero con el último cierre disponible a una fecha pasada. */
export async function obtenerPreciosHistoricos(tickers, fechaISO) {
  const unicos = Array.from(new Set(tickers.filter(Boolean)));
  const resultados = await Promise.all(
    unicos.map(async (ticker) => {
      const conSufijo = await obtenerPrecioHistoricoYahoo(`${ticker}.BA`, fechaISO);
      if (conSufijo) return [ticker, { ...conSufijo, symbol: `${ticker}.BA` }];
      const directo = await obtenerPrecioHistoricoYahoo(ticker, fechaISO);
      if (directo) return [ticker, { ...directo, symbol: ticker }];
      return [ticker, null];
    })
  );
  return new Map(resultados);
}

// Una fecha pasada no cambia de cotización — a diferencia del precio en vivo, este
// cache no necesita TTL, solo evitar pegarle a la API de nuevo por la misma fecha.
const cacheHistorico = new Map(); // fechaISO -> valor|null

/** Tipo de cambio CCL (o MEP/oficial) de una fecha pasada puntual, vía argentinadatos.com. */
export async function obtenerTipoCambioHistorico(fechaISO) {
  if (cacheHistorico.has(fechaISO)) return cacheHistorico.get(fechaISO);

  const [anio, mes, dia] = fechaISO.split("-");
  let valor = null;
  for (const casa of ["contadoconliqui", "mep", "oficial"]) {
    try {
      const dato = await fetchJSON(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}/${anio}/${mes}/${dia}`);
      if (dato?.venta) {
        valor = dato.venta;
        break;
      }
    } catch {
      // probamos la siguiente casa
    }
  }

  cacheHistorico.set(fechaISO, valor);
  return valor;
}
