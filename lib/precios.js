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
      // Igual que data912: punta vendedora si está, si no el último.
      resultado = {
        precio: meta.ask > 0 ? meta.ask : meta.regularMarketPrice,
        ultimo: meta.regularMarketPrice,
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
 * Cotizaciones BYMA vía data912.com (agrega el feed directo de la bolsa: último,
 * bid/ask y variación). Tres listados en bloque — CEDEARs, acciones locales y
 * bonos — en la misma escala que usa IEB (bonos cada 100 de nominal, ej. TMF27 =
 * 122,7). Una sola request por listado en vez de una por ticker como Yahoo.
 * Se valúa a la punta vendedora más baja (ask) cuando hay: en papeles con
 * poco volumen el último operado queda viejo y la oferta marca el precio.
 * Se cachea todo junto por un minuto.
 */
let data912EnVuelo = null;
async function obtenerData912() {
  if (cacheBonos.data && Date.now() - cacheBonos.ts < TTL_MS) return cacheBonos.data;
  if (data912EnVuelo) return data912EnVuelo;
  data912EnVuelo = (async () => {
    const porSimbolo = new Map();
    const urls = [
      "https://data912.com/live/arg_cedears",
      "https://data912.com/live/arg_stocks",
      "https://data912.com/live/arg_bonds",
    ];
    try {
      const listas = await Promise.all(urls.map((u) => fetchJSON(u).catch(() => null)));
      for (const lista of listas) {
        for (const b of lista || []) {
          const simbolo = b?.symbol ? String(b.symbol).toUpperCase() : null;
          if (!simbolo || b.c == null || !(b.c > 0) || porSimbolo.has(simbolo)) continue;
          porSimbolo.set(simbolo, {
            // `precio` = punta vendedora (renta variable); `ultimo` = último
            // operado (bonos y fuera de rueda); `q_op` = operaciones de hoy.
            precio: b.px_ask > 0 ? b.px_ask : b.c,
            ultimo: b.c,
            q_op: b.q_op ?? null,
            moneda: "ARS",
            variacionDiariaPct: b.pct_change != null ? b.pct_change / 100 : null,
            actualizado: null,
            symbol: `data912:${simbolo}`,
          });
        }
      }
    } catch {
      // sin cotizaciones: queda el precio que traiga el Portafolio
    }
    cacheBonos = { data: porSimbolo, ts: Date.now() };
    data912EnVuelo = null;
    return porSimbolo;
  })();
  return data912EnVuelo;
}

/** Atajo: solo bonos (lo usa el fallback de Yahoo para tickers sueltos). */
async function obtenerBonosData912() {
  return obtenerData912();
}

/**
 * Cotización de Rava Bursátil (https://www.rava.com/perfil/{TICKER}): cubre
 * CEDEARs y bonos en ARS. Respaldo cuando data912 está caído y Yahoo no tiene
 * el papel (ej. bonos locales). El precio viene server-rendered en
 * <div class="p2-price"> en formato argentino ("85.300,00").
 */
async function obtenerPrecioRava(ticker) {
  const key = `rava:${String(ticker).toUpperCase()}`;
  const cacheado = cachePrecios.get(key);
  if (cacheado && Date.now() - cacheado.ts < TTL_MS) return cacheado.data;

  let resultado = null;
  try {
    const res = await fetch(`https://www.rava.com/perfil/${encodeURIComponent(String(ticker).toUpperCase())}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/class="p2-price"[^>]*>\s*\$?\s*([\d.,]+)\s*</);
      if (m) {
        let crudo = m[1].trim().replace(/[.,]+$/, "");
        const valor = crudo.includes(",")
          ? Number(crudo.replace(/\./g, "").replace(",", "."))
          : Number(crudo.replace(/,/g, ""));
        if (Number.isFinite(valor) && valor > 0) {
          resultado = { precio: valor, moneda: "ARS", variacionDiariaPct: null, actualizado: null, symbol: key };
        }
      }
    }
  } catch {
    resultado = null;
  }

  cachePrecios.set(key, { data: resultado, ts: Date.now() });
  return resultado;
}

/**
 * Trae precios para una lista de tickers de IEB (ej. "AAPL", "BMA"): primero el
 * feed directo de BYMA vía data912 (un bloque por listado), después Yahoo con
 * sufijo .BA, después Rava por ticker y como último recurso NYSE/NASDAQ directo
 * (en USD, los llamadores deben validar moneda).
 * Devuelve un Map ticker -> resultado|null.
 */
export async function obtenerPrecios(tickers) {
  const unicos = Array.from(new Set(tickers.filter(Boolean)));
  const data912 = await obtenerData912();
  const resultados = await Promise.all(
    unicos.map(async (ticker) => {
      const directo912 = data912.get(String(ticker).toUpperCase());
      if (directo912) return [ticker, directo912];
      const conSufijo = await obtenerPrecioYahoo(`${ticker}.BA`);
      if (conSufijo) return [ticker, { ...conSufijo, symbol: `${ticker}.BA` }];
      const rava = await obtenerPrecioRava(ticker);
      if (rava) return [ticker, rava];
      const directo = await obtenerPrecioYahoo(ticker);
      if (directo) return [ticker, { ...directo, symbol: ticker }];
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
 * CCL de Dolarito (https://www.dolarito.ar/cotizacion/dolar/ccl). Viene
 * server-rendered en el JSON-LD de preguntas frecuentes, ej. "El dolar ccl
 * cotiza a $1596.36, con una variación del 0.29%."
 */
async function obtenerCCLDolarito() {
  try {
    const res = await fetch("https://www.dolarito.ar/cotizacion/dolar/ccl", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
      let json;
      try {
        json = JSON.parse(m[1]);
      } catch {
        continue;
      }
      const entidades = json["@graph"] || [json];
      for (const e of entidades) {
        if (e?.["@type"] !== "FAQPage") continue;
        for (const q of e.mainEntity || []) {
          if (!/ccl|cable|contado/i.test(q?.name || "")) continue;
            const texto = q.acceptedAnswer?.text || "";
            const num = texto.match(/cotiza a\s*\$?\s*([\d.,]*\d)/i);
            if (!num) continue;
            // Formato US con punto decimal ("1596.36"); si viniera con coma
            // decimal ("1.596,36") se normaliza igual.
            let crudo = num[1];
            const valor = crudo.includes(",")
              ? Number(crudo.replace(/\./g, "").replace(",", "."))
              : Number(crudo.replace(/,/g, ""));
            if (Number.isFinite(valor) && valor > 0) return valor;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Velocidades cambiarias en un solo request: ccl (Dolarito, fallback dolarapi) y oficial Balanz (ComparaDólar). */
export async function obtenerTipoCambioDolares() {
  if (cacheCCL.data && Date.now() - cacheCCL.ts < TTL_MS) return cacheCCL.data;

  let resultado = { ccl: null, oficial: null };
  // CCL (Dolarito) y oficial (Balanz) en paralelo.
  const [ccl, oficial] = await Promise.all([
    (async () => {
      // CCL: priorizamos Dolarito; si falla, caemos al "contadoconliqui" de
      // dolarapi (venta, o MEP/oficial si no hay).
      const desdeDolarito = await obtenerCCLDolarito();
      if (desdeDolarito != null) return desdeDolarito;
      try {
        const lista = await fetchJSON("https://dolarapi.com/v1/dolares");
        const porCasa = Object.fromEntries((lista || []).map((d) => [d.casa, d]));
        return porCasa.contadoconliqui?.venta ?? porCasa.mep?.venta ?? porCasa.oficial?.venta ?? null;
      } catch {
        return null;
      }
    })(),
    (async () => {
      // Dólar oficial publicado por Balanz (vía ComparaDólar): usamos el precio de venta.
      try {
        const casas = await fetchJSON("https://api.comparadolar.ar/usd");
        const balanz = (casas || []).find((d) => d.slug === "balanz");
        return balanz ? (balanz.ask ?? balanz.bid ?? null) : null;
      } catch {
        return null;
      }
    })(),
  ]);
  resultado = { ccl, oficial };

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
  // Fin del día en hora argentina (UTC−3 fijo, sin DST): con mediodía UTC el
  // objetivo caía antes de la apertura de BYMA (14:00 UTC) y devolvía el cierre
  // del día ANTERIOR rotulado como fechaISO (pasó con ECOG/RKLB/NBIS/TEAM el 18/9).
  const objetivo = new Date(`${fechaISO}T23:59:59-03:00`).getTime();
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
      const c912 = cierreData912(await obtenerHistoricoData912(ticker), fechaISO);
      if (c912 != null) return [ticker, { precio: c912, moneda: "ARS", symbol: `data912:${ticker}` }];
      const conSufijo = await obtenerPrecioHistoricoYahoo(`${ticker}.BA`, fechaISO);
      if (conSufijo) return [ticker, { ...conSufijo, symbol: `${ticker}.BA` }];
      const directo = await obtenerPrecioHistoricoYahoo(ticker, fechaISO);
      if (directo) return [ticker, { ...directo, symbol: ticker }];
      return [ticker, null];
    })
  );
  return new Map(resultados);
}

const cacheHistorico912 = new Map(); // ticker -> puntos|null (el pasado no cambia)

/** Historial diario de data912 (cierre `c` en ARS): CEDEARs, acciones y bonos. */
async function obtenerHistoricoData912(ticker) {
  const key = String(ticker).toUpperCase();
  if (cacheHistorico912.has(key)) return cacheHistorico912.get(key);
  let puntos = null;
  for (const universo of ["cedears", "stocks", "bonds"]) {
    try {
      const res = await fetchJSON(`https://data912.com/historical/${universo}/${encodeURIComponent(key)}`);
      const arr = Array.isArray(res) ? res : [];
      if (arr.length) {
        puntos = [...arr].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        break;
      }
    } catch {
      // se prueba el universo siguiente
    }
  }
  cacheHistorico912.set(key, puntos);
  return puntos;
}

/** Último cierre en o antes de fechaISO. */
function cierreData912(puntos, fechaISO) {
  if (!puntos?.length) return null;
  let precio = null;
  for (const p of puntos) {
    if (p.date > fechaISO) break;
    if (p.c != null) precio = p.c;
  }
  return precio;
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
