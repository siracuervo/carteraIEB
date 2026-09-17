// Taxonomía a propósito chica, por ahora: CEDEARs, Bonos, Acciones (mercado
// argentino) y Efectivo (pesos, dólares y cauciones, todo junto). Se puede abrir
// más adelante si hace falta, pero mientras menos categorías, más fácil de leer.
export const CLASES = {
  CEDEAR: "CEDEARs",
  ACCION_LOCAL: "Acciones",
  BONO_SOBERANO: "Bonos",
  EFECTIVO: "Efectivo",
  MOVIMIENTO: "Movimiento de cuenta (no es tenencia)",
  OTRO: "Otro / sin clasificar",
};

// Nombre corto para mostrar y sector aproximado por ticker, para los instrumentos
// vistos en los exports de IEB. El sector no pretende ser una clasificación GICS
// estricta, solo una primera foto de diversificación que el usuario puede corregir
// desde la UI.
export const INFO_POR_TICKER = {
  AAPL: { nombre: "Apple", sector: "Tecnología" },
  MSFT: { nombre: "Microsoft", sector: "Tecnología" },
  GOOGL: { nombre: "Alphabet (Google)", sector: "Tecnología" },
  IBM: { nombre: "IBM", sector: "Tecnología" },
  HPQ: { nombre: "HP", sector: "Tecnología" },
  CSCO: { nombre: "Cisco", sector: "Tecnología" },
  INTC: { nombre: "Intel", sector: "Tecnología" },
  QCOM: { nombre: "Qualcomm", sector: "Tecnología" },
  TXN: { nombre: "Texas Instruments", sector: "Tecnología" },
  AVGO: { nombre: "Broadcom", sector: "Tecnología" },
  MRVL: { nombre: "Marvell", sector: "Tecnología" },
  MU: { nombre: "Micron", sector: "Tecnología" },
  SNDK: { nombre: "SanDisk", sector: "Tecnología" },
  AMAT: { nombre: "Applied Materials", sector: "Tecnología" },
  WDC: { nombre: "Western Digital", sector: "Tecnología" },
  CRWD: { nombre: "CrowdStrike", sector: "Tecnología" },
  PANW: { nombre: "Palo Alto Networks", sector: "Tecnología" },
  NOW: { nombre: "ServiceNow", sector: "Tecnología" },
  PATH: { nombre: "UiPath", sector: "Tecnología" },
  TWLO: { nombre: "Twilio", sector: "Tecnología" },
  ARM: { nombre: "Arm Holdings", sector: "Tecnología" },
  TSM: { nombre: "Taiwan Semiconductor", sector: "Tecnología" },
  ALAB: { nombre: "Astera Labs", sector: "Tecnología" },
  NBIS: { nombre: "Nebius", sector: "Tecnología" },
  NVDA: { nombre: "Nvidia", sector: "Tecnología" },
  AMZN: { nombre: "Amazon", sector: "Consumo discrecional" },
  TSLA: { nombre: "Tesla", sector: "Consumo discrecional" },
  SE: { nombre: "Sea Ltd", sector: "Consumo discrecional" },
  TCOM: { nombre: "Trip.com", sector: "Consumo discrecional" },
  BABA: { nombre: "Alibaba", sector: "Consumo discrecional" },
  META: { nombre: "Meta", sector: "Comunicación" },
  NFLX: { nombre: "Netflix", sector: "Comunicación" },
  SPOT: { nombre: "Spotify", sector: "Comunicación" },
  OKLO: { nombre: "Oklo", sector: "Energía" },
  CEG: { nombre: "Constellation Energy", sector: "Energía" },
  GEV: { nombre: "GE Vernova", sector: "Energía" },
  SPCX: { nombre: "SpaceX", sector: "Industriales" },
  RKLB: { nombre: "Rocket Lab", sector: "Industriales" },
  ASTS: { nombre: "AST SpaceMobile", sector: "Comunicación" },
  MP: { nombre: "MP Materials", sector: "Materiales" },
  NVO: { nombre: "Novo Nordisk", sector: "Salud" },
  MRNA: { nombre: "Moderna", sector: "Salud" },
  MRK: { nombre: "Merck", sector: "Salud" },
  LRCX: { nombre: "Lam Research", sector: "Tecnología" },
  XP: { nombre: "XP Inc.", sector: "Financiero" },
  NU: { nombre: "Nu Holdings", sector: "Financiero" },
  BBD: { nombre: "Banco Bradesco", sector: "Financiero" },
  PAGS: { nombre: "PagSeguro", sector: "Financiero" },
  STNE: { nombre: "StoneCo", sector: "Financiero" },
  HOOD: { nombre: "Robinhood", sector: "Financiero" },
  SPGI: { nombre: "S&P Global", sector: "Financiero" },
  BMA: { nombre: "Banco Macro", sector: "Financiero" },
  BYMA: { nombre: "Bolsas y Mercados Argentinos", sector: "Financiero" },
  TQQQ: { nombre: "ProShares UltraPro QQQ", sector: "Índice apalancado" },
  AUSO: { nombre: "Autopista del Sol", sector: "Infraestructura" },
  ECOG: { nombre: "Ecogas", sector: "Energía" },
  KEEL: { nombre: "Keel Infrastructure", sector: "Tecnología" },
  S30S6: { nombre: "Letra del Tesoro S30S6", sector: "Renta fija soberana" },
  AO27: { nombre: "Bono AO27", sector: "Renta fija soberana" },
  AO28: { nombre: "Bono AO28", sector: "Renta fija soberana" },
  AO29: { nombre: "Bono AO29", sector: "Renta fija soberana" },
  AE38: { nombre: "Bono AE38", sector: "Renta fija soberana" },
  AL35: { nombre: "Bono AL35", sector: "Renta fija soberana" },
  DICP: { nombre: "Bono DICP", sector: "Renta fija soberana" },
  DIP0: { nombre: "Bono DIP0", sector: "Renta fija soberana" },
  BA37D: { nombre: "Bono BA37D", sector: "Renta fija provincial" },
  BB37D: { nombre: "Bono BB37D", sector: "Renta fija provincial" },
  GBAN: { nombre: "Naturgy Ban", sector: "Energía" },
  METR: { nombre: "Metrogas", sector: "Energía" },
  COME: { nombre: "Comercial del Plata", sector: "Industrial" },
  MSFT: { nombre: "Microsoft", sector: "Tecnología" },
  SNOW: { nombre: "Snowflake", sector: "Tecnología" },
  ASML: { nombre: "ASML Holding", sector: "Tecnología" },
  CRWV: { nombre: "CoreWeave", sector: "Tecnología" },
  IREN: { nombre: "Iren", sector: "Tecnología" },
  ANET: { nombre: "Arista Networks", sector: "Tecnología" },
  ADI: { nombre: "Analog Devices", sector: "Tecnología" },
  AMD: { nombre: "Advanced Micro Devices", sector: "Tecnología" },
  GLW: { nombre: "Corning", sector: "Materiales" },
  ORCL: { nombre: "Oracle", sector: "Tecnología" },
  MELI: { nombre: "MercadoLibre", sector: "Consumo discrecional" },
  BIDU: { nombre: "Baidu", sector: "Tecnología" },
  JD: { nombre: "JD.com", sector: "Consumo discrecional" },
  VIST: { nombre: "Vista Energy", sector: "Energía" },
  SHOP: { nombre: "Shopify", sector: "Tecnología" },
  COIN: { nombre: "Coinbase", sector: "Financiero" },
  UBER: { nombre: "Uber", sector: "Consumo discrecional" },
  IBIT: { nombre: "iShares Bitcoin Trust", sector: "Criptoactivos" },
  CLS: { nombre: "Celestica", sector: "Tecnología" },
  BBAR: { nombre: "BBVA Argentina", sector: "Financiero" },
  VALO: { nombre: "Banco de Valores", sector: "Financiero" },
  PAMP: { nombre: "Pampa Energía", sector: "Energía" },
  EDN: { nombre: "Edenor", sector: "Energía" },
  GGAL: { nombre: "Grupo Financiero Galicia", sector: "Financiero" },
  YPFD: { nombre: "YPF", sector: "Energía" },
  A3: { nombre: "A3 Mercados", sector: "Financiero" },
  IEBC: { nombre: "IEB Construcciones", sector: "Infraestructura" },
};

/**
 * Algunos bonos nunca traen "Referencia" (ticker) en los exports de IEB, ni en
 * histórico de tenencia ni en toda la actividad — quedan identificados solo por su
 * nombre largo. Acá los mapeamos a mano a su ticker de mercado conocido.
 */
export const TICKER_POR_NOMBRE_SIN_TICKER = {
  "BONOS REP ARG C/DESCUENTO $ 5,83% 2033": "DICP",
  "DISCOUNTS $ 2010-2033": "DIP0",
  "BONO TESORO NACIONAL 6% 29/10/27 USD": "AO27",
  "BONO TESORO NACIONAL 6% 31/10/28 USD": "AO28",
  "BONO REP. ARGENTINA USD STEP UP 2038": "AE38",
  "CEDEAR DE MICROSOFT CORP.": "MSFT",
  "CEDEAR SNOWFLAKE INC": "SNOW",
  "CEDEAR ASML HOLDING NV": "ASML",
  "CEDEAR COREWEAVE INC": "CRWV",
  "CEDEAR IREN LTD": "IREN",
  "CEDEAR ARISTA NETWORKS INC.": "ANET",
  "CEDEAR NEBIUS GROUP N.V.": "NBIS",
  "CEDEAR ANALOG DEVICES INC.": "ADI",
  "CEDEAR CORNING": "GLW",
  "ORACLE CORPORATION": "ORCL",
  "CEDEAR BANCO BRADESCO S.A.": "BBD",
  "CEDEAR MERCADOLIBRE INC": "MELI",
  "CEDEAR ADVANCED MICRO DEVICES": "AMD",
  "CEDEAR BAIDU INC": "BIDU",
  "CEDEAR JD.COM, INC": "JD",
  "CEDEAR VISTA OIL & GAS": "VIST",
  "CEDEAR SHOPIFY": "SHOP",
  "CEDEAR COINBASE GLOBAL INC.": "COIN",
  "CEDEAR UBER TECHNOLOGIES INC": "UBER",
  "CEDEAR ISHARES BITCOIN TR (IBIT)": "IBIT",
  "CEDEAR CELESTICA INC": "CLS",
  "BANCO BBVA ARG ESC S 1 V.": "BBAR",
  "BCO DE VALORES ACCIONES ORD. 1 VOTO $ ES": "VALO",
  "PAMPA HOLDING": "PAMP",
  "EDN- EDENOR S.A": "EDN",
  "GRUPO FINAN. GALICIA": "GGAL",
  "YPF": "YPFD",
  "A3 MERCADOS": "A3",
  "IEB CONSTRUCCIONES  B  1 VOTO ESCRITURAL": "IEBC",
  "BONO REP. ARGENTINA USD STEP UP 2035": "AL35",
  "BONO PCIA BS AS REGS NEW U$S 2037 A": "BA37D",
  "BONO PCIA BS AS REGS NEW U$S 2037 B": "BB37D",
  "NATURGY BAN S.A. ORD CLASE B 1 VOTO ESC": "GBAN",
  METROGAS: "METR",
  "COM. DEL PLATA": "COME",
};

const SUFIJOS_SOCIETARIOS_RE =
  /[.,]?\s*\b(INCORPORATED|CORPORATION|COMPANY|HOLDINGS?|GROUP|LIMITED|LTD|INC|CORP|CO|PLC|N\.V\.?|A\/S|S\.A\.?)\.?\s*$/i;

/** Limpieza genérica para instrumentos que todavía no están en INFO_POR_TICKER. */
function limpiarNombreGenerico(nombreCrudo) {
  if (!nombreCrudo) return nombreCrudo;
  let n = nombreCrudo.replace(/^CEDEAR\s+/i, "").trim();
  let anterior;
  do {
    anterior = n;
    n = n.replace(SUFIJOS_SOCIETARIOS_RE, "").trim();
  } while (n !== anterior && n.length > 0);
  n = n.replace(/\s{2,}/g, " ").replace(/[.,]+$/, "").trim();
  if (!n) return nombreCrudo.trim();
  return n
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Nombre corto para mostrar: prioriza la tabla curada por ticker, si no limpia el nombre crudo de IEB. */
export function nombreLimpio(ticker, activoCrudo) {
  const info = ticker ? INFO_POR_TICKER[ticker.toUpperCase()] : null;
  if (info?.nombre) return info.nombre;
  return limpiarNombreGenerico(activoCrudo) || activoCrudo || ticker || "Sin identificar";
}

/** Valores de "Referencia" de IEB que no son instrumentos cotizables (cauciones, movimientos varios). */
export const TICKERS_NO_MERCADO = new Set(["CAUCION", "OTHER"]);

const CAUCION_RE = /CAUCION/i;
const MOVIMIENTO_RE = /(GASTOS|ORDEN\s*DE PAGO|CREDITO DER MERC|NOTA DE DEBITO|MEMBRESIA)/i;

/**
 * Movimientos de cuenta que no son una operación de compra/venta en sí (créditos por
 * derechos de mercado, gastos, notas de débito, etc.) — aunque vengan atados a un
 * activo puntual, son montos chicos y no representan una operación real sobre esa
 * posición, así que no tiene sentido mostrarlos en su historial.
 */
export function esMovimiento(operacion) {
  return MOVIMIENTO_RE.test(operacion || "");
}
// Bonos soberanos argentinos: por nombre (BONO/BONOS, Discount, Par, Boncer, Bopreal,
// título público, Letras/Lecaps del Tesoro "L.T.") o por los tickers cortos más
// comunes (Bonares AL/GD/AE/AO + año, Discount DICA/DICY/DICP, Par PARA/PARY,
// Letras S + vencimiento como S30S6). Todos cotizan "cada 100 de nominal".
const BONO_SOBERANO_RE = /^BONOS? |DISCOUNT|DESCUENTO|T[EÍ]TULO P[UÚ]BLICO|BONCER|BOPREAL|LECAPS?|\bLETRAS?\b|^L\.?T\.?(\s|$)/;
const TICKER_BONO_SOBERANO_RE = /^(AL|GD|AE|AO)\d|^(DICA|DICY|DICP|DIP0|PARA|PARY|PR13|PR15)$|^B[AB]37D$|^S\d{2}[A-Z]\d$/;

/** Los bonos soberanos no tienen logo en los proveedores de íconos que usamos. */
export function esTickerBonoSoberano(ticker) {
  return TICKER_BONO_SOBERANO_RE.test((ticker || "").toUpperCase());
}

// Acciones extranjeras que en el archivo de Portafolio de IEB no vienen con el
// prefijo "CEDEAR" en el nombre (a diferencia del resto), así que sin esta lista
// la heurística las confunde con una acción del mercado local.
const TICKERS_CEDEAR_SIN_PREFIJO = new Set(["KEEL", "ORCL"]);

// Tickers de acciones del mercado local argentino (no CEDEARs). Las operaciones que
// importamos de "Operaciones del día" no traen la sección del portafolio, así que
// solo con el ticker no se puede distinguir un CEDEAR de una acción local: por
// defecto asumimos que un ticker conocido es un CEDEAR, y esta lista rescata las
// pocas acciones locales reales.
const TICKERS_ACCION_LOCAL = new Set([
  "A3", "AUSO", "BBAR", "BMA", "BYMA", "COME", "ECOG", "EDN", "GBAN", "GGAL", "IEBC", "METR", "PAMP", "VALO", "YPFD",
]);

/** Tickers que ya sabemos que no tienen logo en el proveedor externo (parqet.com devuelve 404) — se
 * evita el pedido de red y se muestra directamente la inicial, en vez de depender de `onError`.
 * Mayormente acciones locales argentinas que ese proveedor no cubre, más algún caso suelto como
 * MRVL o KEEL. Si aparece un ticker nuevo sin logo, alcanza con sumarlo acá. */
export const TICKERS_SIN_LOGO = new Set([
  "KEEL", "MRVL", "BYMA", "COME", "GBAN", "METR", "PAMP", "VALO", "YPFD", "A3", "AUSO", "ECOG", "IEBC",
]);

/** Clave de agrupación de un activo: preferimos el ticker corto cuando está disponible. */
export function claveActivo(t) {
  return t.ticker || t.activo || "SIN_IDENTIFICAR";
}

/**
 * Heurística de clase de activo y sector a partir del nombre completo y/o ticker.
 * info: { activo, ticker, operacion }
 */
export function clasificar({ activo, ticker, operacion, seccion }) {
  const nombre = (activo || "").toUpperCase();
  const tick = (ticker || "").toUpperCase();
  const op = (operacion || "").toUpperCase();
  const secc = (seccion || "").toUpperCase();

  if (esCaucion(nombre, op)) {
    return { claseActivo: CLASES.EFECTIVO, sector: "Efectivo y equivalentes" };
  }
  if (tick === "OTHER" || esMovimiento(op)) {
    return { claseActivo: CLASES.MOVIMIENTO, sector: null };
  }
  // La sección que reporta el Portfolio de IEB es más confiable que adivinar por el
  // nombre: el nombre a veces no trae el prefijo "CEDEAR" (ya pasó con KEEL y ORCL).
  if (secc === "CEDEARS" || nombre.startsWith("CEDEAR") || TICKERS_CEDEAR_SIN_PREFIJO.has(tick)) {
    return { claseActivo: CLASES.CEDEAR, sector: INFO_POR_TICKER[tick]?.sector || "Sin clasificar" };
  }
  if (esDivisaEfectivo(nombre)) {
    return { claseActivo: CLASES.EFECTIVO, sector: "Efectivo y equivalentes" };
  }
  if (BONO_SOBERANO_RE.test(nombre) || TICKER_BONO_SOBERANO_RE.test(tick)) {
    return { claseActivo: CLASES.BONO_SOBERANO, sector: "Renta fija soberana" };
  }
  if (INFO_POR_TICKER[tick]?.sector) {
    // Sin la sección del Portafolio no hay forma de distinguir un CEDEAR de una
    // acción local solo por el ticker: los externos (US/ADR) cotizan como CEDEAR,
    // y los locales están en TICKERS_ACCION_LOCAL.
    const claseActivo = TICKERS_ACCION_LOCAL.has(tick) ? CLASES.ACCION_LOCAL : CLASES.CEDEAR;
    return { claseActivo, sector: INFO_POR_TICKER[tick].sector };
  }
  return { claseActivo: CLASES.OTRO, sector: null };
}

/** Cauciones/colocaciones transitorias: se calculan por neteo de flujos, no por cantidad de instrumento. */
export function esCaucion(nombre, operacion) {
  return CAUCION_RE.test(operacion || "") || CAUCION_RE.test(nombre || "");
}

/** Tenencia de dólar billete: misma clase visual "Efectivo", pero se sigue trackeando por cantidad y precio (cotización). */
export function esDivisaEfectivo(nombre) {
  const n = (nombre || "").toUpperCase();
  return n.includes("DOLARES USA") || n.includes("DÓLARES USA");
}

/** Aplica el override manual guardado por el usuario (si existe) sobre la heurística. */
export function aplicarOverride(clave, base, overrides) {
  const o = overrides?.[clave];
  if (!o) return base;
  return {
    claseActivo: o.claseActivo || base.claseActivo,
    sector: o.sector !== undefined ? o.sector : base.sector,
  };
}

/** Nombre para mostrar: el que haya cargado el usuario a mano, si no el que resolvimos solos. */
export function nombrePersonalizado(clave, nombreBase, overrides) {
  return overrides?.[clave]?.nombre || nombreBase;
}
