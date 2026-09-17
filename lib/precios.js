// Precios de mercado en vivo. Usamos el endpoint no-oficial de Yahoo Finance
// (sufijo .BA para instrumentos que cotizan en BYMA) y dolarapi.com para el
// tipo de cambio. Ninguno de los dos requiere API key. Si una fuente falla,
// devolvemos null para ese instrumento y la UI ofrece carga manual. Los bonos
// argentinos no están en Yahoo, así que para esos caemos a data912.com.

const TTL_MS = 60_000;
const cachePrecios = new Map(); // symbol -> { data, ts }
let cacheCCL = { data: null, ts: 0 };
let cacheBonos = { data: null, ts: 0 }; // symbol -> cotización (bonos BYMA, data912)

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
 * Cotizaciones de bonos argentinos (BYMA) vía data912.com — Yahoo no los trae.
 * El precio "c" es el último cierre, en la misma escala que usa IEB (cada 100 de
 * valor nominal, ej. TMF27 = 122,7). Se cachea el listado completo por un minuto.
 */
let bonosEnVuelo = null;
async function obtenerBonosData912() {
  if (cacheBonos.data && Date.now() - cacheBonos.ts < TTL_MS) return cacheBonos.data;
  if (bonosEnVuelo) return bonosEnVuelo;
  bonosEnVuelo = (async () => {
    const porSimbolo = new Map();
    try {
      const lista = await fetchJSON("https://data912.com/live/arg_bonds");
      for (const b of lista || []) {
        const simbolo = b?.symbol ? String(b.symbol).toUpperCase() : null;
        if (!simbolo || b.c == null || !(b.c > 0)) continue;
        porSimbolo.set(simbolo, {
          precio: b.c,
          moneda: "ARS",
          variacionDiariaPct: b.pct_change != null ? b.pct_change / 100 : null,
          actualizado: null,
          symbol: `data912:${simbolo}`,
        });
      }
    } catch {
      // sin cotizaciones de bonos: queda el precio que traiga el Portafolio
    }
    cacheBonos = { data: porSimbolo, ts: Date.now() };
    bonosEnVuelo = null;
    return porSimbolo;
  })();
  return bonosEnVuelo;
}

/**
 * Trae precios para una lista de tickers de IEB (ej. "AAPL", "BMA"), probando
 * el símbolo tal cual y con sufijo .BA (BYMA). Para los bonos, que no están en
 * Yahoo, cae a data912. Devuelve un Map ticker -> resultado|null.
 */
export async function obtenerPrecios(tickers) {
  const unicos = Array.from(new Set(tickers.filter(Boolean)));
  const resultados = await Promise.all(
    unicos.map(async (ticker) => {
      const conSufijo = await obtenerPrecioYahoo(`${ticker}.BA`);
      if (conSufijo) return [ticker, { ...conSufijo, symbol: `${ticker}.BA` }];
      const directo = await obtenerPrecioYahoo(ticker);
      if (directo) return [ticker, { ...directo, symbol: ticker }];
      const bono = (await obtenerBonosData912()).get(String(ticker).toUpperCase());
      if (bono) return [ticker, bono];
      return [ticker, null];
    })
  );
  return new Map(resultados);
}

/** Igual que obtenerPrecios pero probando primero el símbolo directo (NYSE/NASDAQ, USD) y sin sufijo .BA. */
export async function obtenerPreciosDirecto(tickers) {
  const unicos = Array.from(new Set(tickers.filter(Boolean)));
  const resultados = await Promise.all(
    unicos.map(async (ticker) => {
      const directo = await obtenerPrecioYahoo(ticker);
      return [ticker, directo ? { ...directo, symbol: ticker } : null];
    })
  );
  return new Map(resultados);
}

/**
 * CCL de Rava Bursátil (https://www.rava.com/perfil/DOLAR%20CCL). Es la referencia
 * que coincide con lo que se ve en los portales (dolarito, Rava), a diferencia del
 * "contadoconliqui" de dolarapi que suele publicar la punta de venta unos pesos
 * arriba. El precio viene server-rendered en <div class="p2-price">.
 */
async function obtenerCCLRava() {
  try {
    const res = await fetch("https://www.rava.com/perfil/DOLAR%20CCL", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/class="p2-price"\s*>\s*\$?\s*([\d.]+,\d+)/);
    if (!m) return null;
    const valor = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

/** Velocidades cambiarias en un solo request: ccl (Rava, fallback dolarapi) y oficial Balanz (ComparaDólar). */
export async function obtenerTipoCambioDolares() {
  if (cacheCCL.data && Date.now() - cacheCCL.ts < TTL_MS) return cacheCCL.data;

  let resultado = { ccl: null, oficial: null };
  // CCL: priorizamos Rava (coincide con la referencia pública ~1.595); si falla,
  // caemos al "contadoconliqui" de dolarapi (venta, o MEP/oficial si no hay).
  resultado.ccl = await obtenerCCLRava();
  if (resultado.ccl == null) {
    try {
      const lista = await fetchJSON("https://dolarapi.com/v1/dolares");
      const porCasa = Object.fromEntries((lista || []).map((d) => [d.casa, d]));
      const liqui = porCasa.contadoconliqui?.venta ?? porCasa.mep?.venta ?? porCasa.oficial?.venta;
      resultado.ccl = liqui ?? null;
    } catch {
      // sin ccl
    }
  }
  // Dólar oficial publicado por Balanz (vía ComparaDólar): usamos el precio de venta.
  try {
    const casas = await fetchJSON("https://api.comparadolar.ar/usd");
    const balanz = (casas || []).find((d) => d.slug === "balanz");
    if (balanz) resultado.oficial = balanz.ask ?? balanz.bid ?? null;
  } catch {
    // sin oficial Balanz
  }

  cacheCCL = { data: resultado, ts: Date.now() };
  return resultado;
}

/** Tipo de cambio USD/ARS "contado con liqui" (o MEP/oficial si CCL no está disponible). */
export async function obtenerTipoCambioCCL() {
  const dolares = await obtenerTipoCambioDolares();
  return dolares.ccl;
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
