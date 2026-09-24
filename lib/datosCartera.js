import { cache } from "react";
import { leerTransacciones, leerClasificaciones, leerPortafolioHistorial, leerCierresDiarios, leerCierresManuales, mergeCierresDiarios, leerMovimientosFondos, leerPatrimonioAuto, guardarPatrimonioAuto, leerTraspasosEfectivo, versionDatos } from "./storage.js";
import {
  calcularTenencias,
  calcularTenenciasAFecha,
  calcularResumen,
  calcularDistribucion,
  calcularVentasRealizadas,
  construirTenenciasDesdePortafolio,
  proyectarOperacionesSobrePortafolio,
  actualizarConPreciosVivos,
  calcularEvolucionPatrimonio,
  calcularEvolucionSemana,
  calcularSemanas,
  calcularSerieEvolucion,
  calcularNuevasEnCartera,
  resolverTickersConPortafolio,
  rentaFijaSnapshot,
  calcularCCLHistoricoPorClave,
  calcularResultadosDelDia,
  calcularDiasTenencia,
  factorPrecioPorClase,
  ajusteFlujosRentaFija,
  efectivoParaRentaFija,
  precioVivo,
  mercadoAbierto,
  sesionAbiertaHoy,
  cierreManualVigente,
} from "./calculos.js";
import { obtenerPrecios, obtenerTipoCambioCCL, obtenerPreciosHistoricos } from "./precios.js";
import { TICKERS_NO_MERCADO, CLASES } from "./clasificacion.js";
import { aperturaDesdePortafolio, lotesPorSleeve, efectivoPorSleeve, dividirTenenciasPorSleeve, serieValorSleeve, serieEfectivoSleeve, serieCostoSleeve, balanceCaucion, SLEEVES } from "./sleeves.js";
import { aISO } from "./accesosRapidosFecha.js";
import { hoyArgentina } from "./fechas.js";

// Firma compacta (ticker/cantidad/costo) para detectar si una proyección de
// operaciones sobre el Portafolio realmente cambió las posiciones.
function firmaTenencias(t) {
  return JSON.stringify(
    t
      .map((x) => [
        x.clave,
        Math.round((x.cantidad ?? 0) * 10000) / 10000,
        Math.round((x.costoTotal ?? 0) * 100) / 100,
      ])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );
}

// Precio unitario de cierre del día anterior a `diaISO`, tomado del Portafolio
// importado más reciente anterior a esa fecha. Es la base "a mercado" del resultado
// del día: lo que ya se tenía al cierre se mide contra ese precio y no contra el
// costo de compra, que arrastraría ganancias/pérdidas de días previos. Se indexa por
// ticker y por clave (nombre) porque los movimientos pueden venir sin ticker.
function preciosDeFecha(fecha, portafolioHistorial, cierres) {
  const mapa = new Map();
  // Último snapshot a la fecha o anterior (no solo el de la fecha exacta):
  // si no, los días sin import valúan con el precio vivo de hoy y el cierre
  // queda inflado/deflactado por movimientos posteriores.
  let snap = null;
  for (const h of portafolioHistorial) {
    if (!h.fecha || h.fecha > fecha) continue;
    if (!snap || h.fecha > snap.fecha) snap = h;
  }
  // Cierres anteriores a `fecha` (del más nuevo al más viejo) primero: lo más
  // nuevo siempre gana, sea snapshot o cierre.
  if (cierres) {
    for (const f of Object.keys(cierres).sort().reverse()) {
      if (f >= fecha) continue;
      for (const [tk, p] of Object.entries(cierres[f])) {
        if (p == null || mapa.has(tk)) continue;
        mapa.set(tk, p);
      }
    }
  }
  if (snap) {
    for (const h of snap.tenencias || []) {
      if (h.precio == null) continue;
      if (h.ticker && !mapa.has(h.ticker)) mapa.set(h.ticker, h.precio);
      const clave = h.ticker || h.nombre;
      if (!mapa.has(clave)) mapa.set(clave, h.precio);
    }
  }
  const guardados = cierres?.[fecha];
  if (guardados) {
    for (const [tk, p] of Object.entries(guardados)) {
      if (p == null) continue;
      mapa.set(tk, p);
    }
  }
  return mapa;
}

function precioNumerico(mapa, ticker, clave) {
  const v = mapa?.get?.(ticker) ?? mapa?.get?.(clave);
  if (v == null) return null;
  return typeof v === "number" ? v : v.precio ?? null;
}

function preciosCierreAnterior(portafolioHistorial, diaISO, cierres) {
  const candidatas = new Set();
  for (const h of portafolioHistorial) {
    if (!h.fecha || h.fecha >= diaISO) continue;
    candidatas.add(h.fecha);
  }
  for (const f of Object.keys(cierres || {})) {
    if (f < diaISO) candidatas.add(f);
  }
  if (!candidatas.size) return new Map();
  const fecha = [...candidatas].sort().pop();
  return preciosDeFecha(fecha, portafolioHistorial, cierres);
}

function numerosACotizaciones(mapaNumeros, divisa = "ARS") {
  const out = new Map();
  for (const [tk, p] of mapaNumeros) {
    if (p == null) continue;
    out.set(tk, { precio: p, moneda: divisa, variacionDiariaPct: null });
  }
  return out;
}

// Precios para valuar el cierre de `fecha`: snapshot + cierres guardados, con
// fallback a la cotización viva solo para tickers sin dato (o cuando la sesión
// viva ES esa fecha, caso en que lo vivo es el precio de sesión). Hoy siempre
// es sesión viva (aunque ninguna cotización traiga `actualizado`): si no, el
// día actual quedaría valuado con precios viejos mientras la vista en vivo
// usa los nuevos.
function mapaPreciosDia(fecha, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva) {
  const mapa = new Map(preciosDeFecha(fecha, portafolioHistorial, cierres));
  const esSesionViva = (fechaSesionViva && fechaSesionViva === fecha) || fecha === hoyArgentina();
  for (const [tk, cot] of preciosDisponibles) {
    if (!cot?.precio) continue;
    // Vivo solo para HOY (sesión actual): para días pasados no se inventa un
    // valor con la cotización de hoy, queda el último dato conocido o nada.
    if (!esSesionViva) continue;
    // En rueda al ask más bajo, fuera de rueda al cierre (último operado).
    mapa.set(tk, precioVivo(cot, null) ?? cot.ultimo ?? cot.precio);
  }
  return mapa;
}

function conCclCompra(t, cclHistoricoPorClave) {
  const cclEfectivo = cclHistoricoPorClave.get(t.clave);
  const esRentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
  return {
    ...t,
    cclCompra: !t.esCash && !esRentaFija && cclEfectivo != null ? cclEfectivo : null,
    costoPromedioUSD:
      !t.esCash && t.costoPromedio && t.costoPromedio > 0 && cclEfectivo != null
        ? t.costoPromedio / cclEfectivo
        : null,
  };
}

function detectarCierres(preciosDisponibles) {
  const porFecha = new Map();
  let fechaMax = null;
  for (const [ticker, cot] of preciosDisponibles) {
    if (!cot?.precio) continue;
    if (cot.actualizado) {
      const fecha = aISO(new Date(cot.actualizado));
      const mapa = porFecha.get(fecha) ?? new Map();
      mapa.set(ticker, cot.ultimo ?? cot.precio);
      porFecha.set(fecha, mapa);
      if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    }
  }
  if (fechaMax) {
    const mapa = porFecha.get(fechaMax);
    for (const [ticker, cot] of preciosDisponibles) {
      if (!cot?.precio || cot.actualizado) continue;
      mapa.set(ticker, cot.ultimo ?? cot.precio);
    }
  }
  const cierres = {};
  for (const [fecha, mapa] of porFecha) {
    cierres[fecha] = Object.fromEntries(mapa);
  }
  return { cierres, fechaSesion: fechaMax };
}

async function backfillCierres(faltantes, portafolioHistorial, transaccionesResueltas, cierresExistentes) {
  if (!faltantes.length) return {};
  const agregados = {};
  for (const f of faltantes) {
    const snapBase = [...portafolioHistorial].filter((h) => h.fecha && h.fecha <= f).pop() ?? null;
    const tickers = new Set();
    if (snapBase) {
      for (const h of snapBase.tenencias || []) if (h.ticker) tickers.add(h.ticker);
    }
    for (const t of transaccionesResueltas) {
      if (t.fecha === f && t.ticker) tickers.add(t.ticker);
    }
    if (!tickers.size) continue;
    const hist = await obtenerPreciosHistoricos([...tickers], f);
    const mapa = {};
    // Solo ARS: el fallback a NYSE/NASDAQ devuelve USD y valuarlo como ARS rompería el cierre.
    for (const [tk, cot] of hist) if (cot?.precio && (!cot.moneda || cot.moneda === "ARS")) mapa[tk] = cot.precio;
    if (Object.keys(mapa).length) {
      agregados[f] = { ...(cierresExistentes[f] || {}), ...mapa };
    }
  }
  return agregados;
}

function posicionesAlCierre(dia, { portafolioHistorial, transaccionesResueltas, overrides, preciosDia, tipoCambioCCL, movimientosFondos }) {
  const opsHasta = (hasta) => transaccionesResueltas.filter((t) => !t.fecha || t.fecha <= hasta);
  const fondosHasta = (movimientosFondos || []).filter((f) => f.fecha && f.fecha <= dia);
  let snapshot = null;
  for (const h of portafolioHistorial) {
    if (!h.fecha || h.fecha > dia) continue;
    if (!snapshot || h.fecha > snapshot.fecha) snapshot = h;
  }
  let base;
  if (snapshot) {
    if (snapshot.fecha === dia && !fondosHasta.some((f) => f.fecha === dia)) {
      base = construirTenenciasDesdePortafolio(snapshot, overrides);
    } else {
      const proy = proyectarOperacionesSobrePortafolio(snapshot, opsHasta(dia), overrides, fondosHasta);
      base = proy.hubo ? proy.tenencias : construirTenenciasDesdePortafolio(snapshot, overrides);
    }
  } else {
    const preciosLegacy = numerosACotizaciones(preciosDia);
    base = calcularTenenciasAFecha(opsHasta(dia), overrides, dia, preciosLegacy, tipoCambioCCL);
  }
  return base.map((t) => {
    if (t.esCash || !t.ticker || t.cantidad == null) return t;
    const p = precioNumerico(preciosDia, t.ticker, t.clave);
    if (p == null) return t;
    const factor = factorPrecioPorClase(t.claseActivo);
    const valor = t.cantidad * p * factor;
    return {
      ...t,
      precioActual: p,
      sinPrecio: false,
      valorActual: valor,
      valorActualARS: valor,
      gananciaNoRealizada: t.costoTotal != null ? valor - t.costoTotal : t.gananciaNoRealizada,
      retornoPct: t.costoTotal > 0 ? (valor - t.costoTotal) / t.costoTotal : t.retornoPct,
    };
  });
}

/**
 * Junta todo lo que necesitan las pestañas del dashboard. La fuente de verdad de
 * "qué tengo hoy" es el último import de Portafolio (ya viene calculado por IEB,
 * sin que tengamos que reconstruir nada). Si todavía no se importó ningún
 * Portafolio, caemos al motor viejo que reconstruye la posición a partir de las
 * transacciones — menos confiable, pero mejor que nada mientras tanto. Las
 * transacciones siguen siendo la única fuente para el historial de "Ventas realizadas".
 * Ahora acepta `diaSeleccionado` para ver resultados de un día específico.
 */
const obtenerDatosCarteraInterna = cache(async function obtenerDatosCarteraInterna(diaSeleccionado = null, diaTenenciaSeleccionado = null) {
  const [transacciones, overrides, portafolioHistorial, movimientosFondos, patrimonioAuto, traspasosEfectivo, cierresManuales] = await Promise.all([
    leerTransacciones(),
    leerClasificaciones(),
    leerPortafolioHistorial(),
    leerMovimientosFondos(),
    leerPatrimonioAuto(),
    leerTraspasosEfectivo(),
    leerCierresManuales(),
  ]);

  if (!transacciones.length && !portafolioHistorial.length) {
    return { vacio: true, diasOperados: [], dia: null, diasTenencia: [], diaTenencia: null, tenenciasCierre: null };
  }

  // Los movimientos del export "histórico de tenencia" vienen sin "Referencia"
  // (ticker) — solo el nombre largo. El Portafolio identifica los activos por
  // ticker, así que antes de cualquier agrupación completamos los tickers usando
  // el historial de Portafolios como diccionario nombre→ticker. Así las páginas
  // de cada activo encuentran sus movimientos con la misma clave.
  const transaccionesResueltas = resolverTickersConPortafolio(transacciones, portafolioHistorial);

  const ultimoPortafolio = portafolioHistorial[portafolioHistorial.length - 1] || null;

  let tenencias;
  let fuentePosiciones;
  let proyeccionOperaciones = false;
  let proyeccionDesdeFecha = null;
  let tipoCambioCCL = null;
  let preciosEnVivo = false;
  let preciosDisponibles = new Map();
  if (ultimoPortafolio) {
    const base = construirTenenciasDesdePortafolio(ultimoPortafolio, overrides);
    const proyeccion = proyectarOperacionesSobrePortafolio(ultimoPortafolio, transaccionesResueltas, overrides, movimientosFondos);
    if (proyeccion.hubo && firmaTenencias(proyeccion.tenencias) !== firmaTenencias(base)) {
      tenencias = proyeccion.tenencias;
      proyeccionOperaciones = true;
      proyeccionDesdeFecha = ultimoPortafolio.fecha;
    } else {
      tenencias = base;
    }
    fuentePosiciones = "portafolio";
    tipoCambioCCL = tenencias.find((t) => t.ticker === "DOLARUSA")?.precioActual ?? null;

    const tickersConMercado = Array.from(new Set(tenencias.map((t) => t.ticker).filter(Boolean))).filter(
      (t) => !TICKERS_NO_MERCADO.has(t.toUpperCase())
    );
    const preciosVivos = await obtenerPrecios(tickersConMercado);
    preciosDisponibles = preciosVivos;
    tenencias = actualizarConPreciosVivos(tenencias, preciosVivos);
    preciosEnVivo = tenencias.some((t) => t.precioEnVivo);
  } else {
    const tickers = Array.from(new Set(transaccionesResueltas.map((t) => t.ticker).filter(Boolean))).filter(
      (t) => !TICKERS_NO_MERCADO.has(t.toUpperCase())
    );
    const precios = await obtenerPrecios(tickers);
    preciosDisponibles = precios;
    tipoCambioCCL = await obtenerTipoCambioCCL();
    tenencias = calcularTenencias(transaccionesResueltas, overrides, precios, tipoCambioCCL);
    fuentePosiciones = "transacciones";
  }

  // Costo promedio en USD por CEDEAR usando el dólar CCL de cada día de compra
  let cclHistoricoPorClave = new Map();
  if (transacciones.length) {
    cclHistoricoPorClave = await calcularCCLHistoricoPorClave(transaccionesResueltas);
    tenencias = tenencias.map((t) => conCclCompra(t, cclHistoricoPorClave));
  }

  if (transacciones.length || portafolioHistorial.length) {
    const diasPorClave = calcularDiasTenencia(transaccionesResueltas, {
      portafolioHistorial,
      fechaReferenciaISO: aISO(new Date()),
    });
    tenencias = tenencias.map((t) => ({
      ...t,
      diasTenencia: t.esCash ? null : diasPorClave.get(t.clave)?.dias ?? null,
    }));
  }

  // Ledger autónomo por estrategias: apertura en el último Portafolio (toda la
  // RV existente a trading, bonos a renta fija, efectivo 100% a trading) y de
  // ahí en más compras/ventas con sleeve, fondos con destino y traspasos.
  const fechaCorteSleeves = ultimoPortafolio?.fecha ?? null;
  const aperturaSleeves = aperturaDesdePortafolio(ultimoPortafolio, overrides);
  let efectivoAperturaSleeves = { [SLEEVES.TRADING]: 0, [SLEEVES.LARGO]: 0, [SLEEVES.RENTA_FIJA]: 0 };
  if (ultimoPortafolio) {
    const baseApertura = construirTenenciasDesdePortafolio(ultimoPortafolio, overrides);
    efectivoAperturaSleeves = {
      [SLEEVES.TRADING]: baseApertura.find((t) => t.clave === "EFECTIVO_TOTAL")?.valorActualARS ?? 0,
      [SLEEVES.LARGO]: 0,
      [SLEEVES.RENTA_FIJA]: 0,
    };
  }
  const mapaLotesSleeves = lotesPorSleeve(transaccionesResueltas, {
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    overrides,
  });
  const efectivoSleeves = efectivoPorSleeve({
    apertura: efectivoAperturaSleeves,
    fondos: movimientosFondos,
    transacciones: transaccionesResueltas,
    traspasos: traspasosEfectivo,
    overrides,
    fechaCorte: fechaCorteSleeves,
  });

  // Tenencias partidas por sleeve (misma clave puede dar 2 filas; la caja se
  // parte en 3) y resumen calculado sobre esas filas.
  let tenenciasSleeve = dividirTenenciasPorSleeve(tenencias, mapaLotesSleeves, efectivoSleeves).tenencias;
  // Caución colocada y no vencida: salió de caja pero sigue siendo
  // patrimonio — se muestra como fila propia para no perderla del total.
  const caucionAbierta = balanceCaucion(transaccionesResueltas, aISO(new Date()));
  if (caucionAbierta > 0) {
    tenenciasSleeve.push({
      clave: "CAUCION_ABIERTA",
      claveFila: "CAUCION_ABIERTA",
      activo: "Caución colocada",
      ticker: "CAUCION",
      claseActivo: CLASES.EFECTIVO,
      sector: "Efectivo y equivalentes",
      divisa: "ARS",
      esCash: true,
      sleeve: SLEEVES.RENTA_FIJA,
      cantidad: null,
      costoPromedio: null,
      costoTotal: caucionAbierta,
      precioActual: null,
      sinPrecio: false,
      usaPrecioManual: false,
      valorActual: caucionAbierta,
      valorActualARS: caucionAbierta,
      gananciaNoRealizada: 0,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct: 0,
      diasTenencia: null,
    });
  }
  // El valor de la cartera es siempre la suma de las tenencias valuadas
  // (nunca el total del snapshot: así refleja cierres manuales y operaciones
  // posteriores al último Portafolio).
  let resumen = calcularResumen(tenenciasSleeve);

  const ventasRealizadas = transaccionesResueltas.length ? await calcularVentasRealizadas(transaccionesResueltas, overrides) : [];

  // "Hoy" en hora argentina (el server en Vercel corre en UTC: con aISO el día
  // se adelantaba 21:00–24:00 ART y el cierre manual "de hoy" dejaba de matchear).
  const hoyISO = hoyArgentina();
  // Hoy se habilita solo cuando abre la sesión (10:30 ART); antes de eso el
  // día todavía no existe: no se crean puntos de hoy ni se lo ofrece por defecto.
  const sesionHoy = sesionAbiertaHoy(new Date());

  // Captura/backfill de cierres diarios (solo en runtime, no en build).
  // Todo lo que la app ve en vivo se persiste: si no, los días sin Portfolio
  // importado quedarían reconstruidos para siempre con precios viejos y el
  // gráfico nunca registraría cómo cerró cada día.
  let cierres = await leerCierresDiarios();
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const detectado = detectarCierres(preciosDisponibles);
    if (detectado.cierres && Object.keys(detectado.cierres).length) {
      // En sesiones pasadas solo se completan tickers faltantes: lo servido en
      // vivo un finde/feriado puede ser intradiario y no debe pisar el cierre.
      // Y los tickers con cierre guardado a mano para esa fecha nunca se pisan
      // (igual que el cron): si fijaste SPCX 4955, la última visita no lo revierte.
      const filtrados = {};
      for (const [f, mapa] of Object.entries(detectado.cierres)) {
        const manualesF = cierresManuales[f] || {};
        if (f >= hoyISO) {
          const sinManuales = Object.fromEntries(Object.entries(mapa).filter(([tk]) => manualesF[tk] == null));
          if (Object.keys(sinManuales).length) filtrados[f] = sinManuales;
        } else {
          const falt = Object.fromEntries(Object.entries(mapa).filter(([tk]) => cierres[f]?.[tk] == null));
          if (Object.keys(falt).length) filtrados[f] = falt;
        }
      }
      if (Object.keys(filtrados).length) cierres = await mergeCierresDiarios(filtrados);
    }
    // Los vivos de BYMA (data912) no traen `actualizado` y detectarCierres solo
    // los guarda si algún Yahoo pone fecha de sesión: se guardan igual, bajo la
    // sesión viva (finde/feriado cae en el último día operado) o hoy. En una
    // sesión pasada solo se completan los tickers que falten (no se pisa el
    // cierre ya guardado); hoy se actualiza con lo último (última visita gana).
    // Pre-sesión no se guarda nada bajo la fecha de hoy: el día todavía no abrió.
    const fechaVivos = detectado.fechaSesion || hoyISO;
    const soloFaltantes = fechaVivos !== hoyISO;
    const guardarVivos = fechaVivos !== hoyISO || sesionHoy;
    const baseVivos = soloFaltantes ? { ...(cierres[fechaVivos] || {}) } : {};
    const manualesVivos = cierresManuales[fechaVivos] || {};
    const vivosHoy = {};
    for (const [tk, cot] of preciosDisponibles) {
      if (!cot?.precio || (cot.moneda && cot.moneda !== "ARS")) continue;
      if (manualesVivos[tk] != null) continue;
      if (soloFaltantes && baseVivos[tk] != null) continue;
      const px = cot.ultimo ?? cot.precio;
      if (px == null || !(px > 0)) continue;
      vivosHoy[tk] = px;
    }
    if (Object.keys(vivosHoy).length && guardarVivos) {
      cierres = await mergeCierresDiarios({ [fechaVivos]: { ...(cierres[fechaVivos] || {}), ...vivosHoy } });
    }
    const fechasOperadasTodas = Array.from(new Set(transaccionesResueltas.map((t) => t.fecha).filter(Boolean))).sort();
    const ultimaFechaPortafolio = ultimoPortafolio?.fecha ?? null;
    // Solo días sin ningún cierre: los parciales los completa el guardado en
    // vivo (arriba) sin pisar lo ya guardado con datos históricos dudosos.
    const faltantes = fechasOperadasTodas
      .filter((f) => f < hoyISO && f !== detectado.fechaSesion && (!ultimaFechaPortafolio || f > ultimaFechaPortafolio) && !cierres[f] && !portafolioHistorial.some((h) => h.fecha === f))
      .slice(-5);
    if (faltantes.length) {
      const backfill = await backfillCierres(faltantes, portafolioHistorial, transaccionesResueltas, cierres);
      if (Object.keys(backfill).length) cierres = await mergeCierresDiarios(backfill);
    }
  }

  // Fallback para tickers sin precio vivo (ej. SPCX 4920 guardado manualmente en cierresDiarios):
  // si no hay cotización ni precioManual, usar el último cierre manual
  {
    const fechasCierresDesc = Object.keys(cierres).sort().reverse();
    function ultimoCierre(ticker) {
      for (const f of fechasCierresDesc) {
        const p = cierres[f]?.[ticker];
        if (p != null && p > 0) return p;
      }
      return null;
    }
    tenencias = tenencias.map((t) => {
      if (!t.sinPrecio || !t.ticker || t.precioActual != null) return t;
      const p = ultimoCierre(t.ticker);
      if (p == null) return t;
      const factor = factorPrecioPorClase(t.claseActivo);
      const valor = t.cantidad != null ? t.cantidad * p * factor : p;
      return {
        ...t,
        precioActual: p,
        sinPrecio: false,
        usaPrecioManual: false,
        valorActual: valor,
        valorActualARS: valor,
        gananciaNoRealizada: t.costoTotal != null ? valor - t.costoTotal : t.gananciaNoRealizada,
        retornoPct: t.costoTotal > 0 && valor != null ? (valor - t.costoTotal) / t.costoTotal : t.retornoPct,
      };
    });
    // Un cierre guardado a mano para HOY (cierresManuales.json, ej. SPCX) pisa
    // el vivo fuera de rueda. Los de otras fechas no aplican: valen para su
    // propia rueda y los días siguientes quedan como último cierre guardado.
    // En rueda manda el vivo.
    {
      const ahora = new Date();
      if (!mercadoAbierto(ahora)) {
        tenencias = tenencias.map((t) => {
          if (!t.ticker) return t;
          const manual = cierreManualVigente(cierresManuales, t.ticker, ahora);
          if (manual == null) return t;
          const pHoy = manual.precio;
          if (t.precioActual != null && Math.abs(t.precioActual - pHoy) < 1e-9) return t;
          const factor = factorPrecioPorClase(t.claseActivo);
          const valor = t.cantidad != null ? t.cantidad * pHoy * factor : pHoy;
          return {
            ...t,
            precioActual: pHoy,
            sinPrecio: false,
            usaPrecioManual: false,
            valorActual: valor,
            valorActualARS: valor,
            gananciaNoRealizada: t.costoTotal != null ? valor - t.costoTotal : t.gananciaNoRealizada,
            retornoPct: t.costoTotal > 0 && valor != null ? (valor - t.costoTotal) / t.costoTotal : t.retornoPct,
          };
        });
      }
    }
  }
  // Re-dividir sleeve con precios corregidos por cierre manual y recalcular
  // el resumen: si no, el total seguiría valuado al vivo (ej. SPCX 4942.5 en
  // vez del cierre manual 4955).
  tenenciasSleeve = dividirTenenciasPorSleeve(tenencias, mapaLotesSleeves, efectivoSleeves).tenencias;
  if (caucionAbierta > 0 && !tenenciasSleeve.some((t) => t.clave === "CAUCION_ABIERTA")) {
    tenenciasSleeve.push({
      clave: "CAUCION_ABIERTA",
      claveFila: "CAUCION_ABIERTA",
      activo: "Caución colocada",
      ticker: "CAUCION",
      claseActivo: CLASES.EFECTIVO,
      sector: "Efectivo y equivalentes",
      divisa: "ARS",
      esCash: true,
      sleeve: SLEEVES.RENTA_FIJA,
      cantidad: null,
      costoPromedio: null,
      costoTotal: caucionAbierta,
      precioActual: null,
      sinPrecio: false,
      usaPrecioManual: false,
      valorActual: caucionAbierta,
      valorActualARS: caucionAbierta,
      gananciaNoRealizada: 0,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct: 0,
      diasTenencia: null,
    });
  }
  resumen = calcularResumen(tenenciasSleeve);

  // Selección de día: hoy se habilita solo cuando abre la sesión (10:30 ART);
  // antes de eso se muestra la última sesión. En rueda, hoy para el vivo.
  const fechasOperadas = Array.from(new Set([...transaccionesResueltas.map((t) => t.fecha).filter(Boolean), ...(sesionHoy ? [hoyISO] : [])])).sort();
  const diaPorDefecto = sesionHoy ? hoyISO : (fechasOperadas[fechasOperadas.length - 1] ?? null);
  const dia = (diaSeleccionado && fechasOperadas.includes(diaSeleccionado)) ? diaSeleccionado : diaPorDefecto;
  const esUltimo = dia === fechasOperadas[fechasOperadas.length - 1];
  const fechaSesionViva = detectarCierres(preciosDisponibles).fechaSesion;

  // Días con tenencia reconstruible al cierre: snapshots + días operados.
  const fechasSnapshots = portafolioHistorial.map((h) => h.fecha).filter(Boolean);
  const diasTenencia = Array.from(new Set([...fechasSnapshots, ...fechasOperadas])).sort();
  const diaTenencia = (diaTenenciaSeleccionado && diasTenencia.includes(diaTenenciaSeleccionado)) ? diaTenenciaSeleccionado : null;

  let resultadosDia = null;
  if (dia) {
    const preciosCierre = preciosCierreAnterior(portafolioHistorial, dia, cierres);
    const preciosDiaMap = mapaPreciosDia(dia, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva);
    const transaccionesHastaDia = transaccionesResueltas.filter((t) => !t.fecha || t.fecha <= dia);
    const preciosDiaCotizaciones = new Map();
    for (const [tk, p] of preciosDiaMap) if (p != null) preciosDiaCotizaciones.set(tk, { precio: p, moneda: "ARS", variacionDiariaPct: null });
    resultadosDia = await calcularResultadosDelDia(transaccionesHastaDia, dia, preciosDiaCotizaciones, overrides, preciosCierre);
    resultadosDia.esHoy = dia === hoyISO;
    resultadosDia.esUltimo = esUltimo;
    // Variación del día de la tenencia que ya se tenía al cierre anterior (precio de
    // ayer → hoy) y seguía abierta al cierre del día. Se muestra unificada por ticker
    // junto a lo operado: cada ticker held suma su resultado (ventas + pendiente +
    // variación de la tenencia previa). La cantidad previa sale del FIFO de
    // `calcularResultadosDelDia` (fecha de operación), no del snapshot del Portafolio
    // (fecha de liquidación T+1/T+2), que no refleja las operaciones del propio día.
    // La renta fija se lista pero no computa en el mosaico.
    const previaPorClave = new Map((resultadosDia.posicionesCierre || []).map((p) => [p.clave, p]));
    const clavesConTx = new Set(previaPorClave.keys());
    // Tickers que solo existen en el snapshot (sin transacciones): se valúan por su
    // cantidad de cierre reconstruida como antes.
    const posicionesDia = posicionesAlCierre(dia, {
      portafolioHistorial,
      transaccionesResueltas,
      overrides,
      preciosDia: preciosDiaMap,
      tipoCambioCCL,
      movimientosFondos,
    });
    let rendimientoTenencia = 0;
    const rendimientosTenencia = [];
    const agregarRendimiento = (info) => {
      const prev = precioNumerico(preciosCierre, info.ticker, info.clave);
      const cur = info.precioActual;
      if (prev == null || prev <= 0 || cur == null) return;
      const cantidadBase = info.cantidadBase;
      if (!(cantidadBase > 0)) return;
      const factor = factorPrecioPorClase(info.claseActivo);
      const resultado = (cur - prev) * cantidadBase * factor;
      const pct = prev > 0 ? cur / prev - 1 : null;
      const esRentaFija = info.claseActivo === CLASES.BONO_SOBERANO;
      if (!esRentaFija) rendimientoTenencia += resultado;
      rendimientosTenencia.push({
        clave: info.clave,
        ticker: info.ticker,
        activo: info.activo,
        claseActivo: info.claseActivo,
        divisa: info.divisa,
        cantidad: cantidadBase,
        precioAyer: prev,
        precioActual: cur,
        variacionDiariaPct: pct,
        resultado,
        gananciaNoRealizada: info.gananciaNoRealizada ?? null,
        computa: !esRentaFija,
      });
    };
    for (const p of resultadosDia.posicionesCierre || []) {
      agregarRendimiento({
        ...p,
        cantidadBase: p.cantidadPrevia,
        precioActual: precioNumerico(preciosDiaMap, p.ticker, p.clave),
      });
    }
    for (const t of posicionesDia) {
      if (t.esCash || t.cantidad == null || clavesConTx.has(t.clave)) continue;
      agregarRendimiento({ ...t, cantidadBase: t.cantidad });
    }
    rendimientosTenencia.sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado));
    resultadosDia.totals.rendimientoTenencia = rendimientoTenencia;
    resultadosDia.rendimientosTenencia = rendimientosTenencia;
  }

  // Tenencia al cierre de un día pasado (para navegar la cartera por fecha).
  // Sin día elegido se muestra la posición viva de siempre.
  let tenenciasCierre = null;
  if (diaTenencia) {
    const preciosDiaTenencia = mapaPreciosDia(diaTenencia, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva);
    const posiciones = posicionesAlCierre(diaTenencia, {
      portafolioHistorial,
      transaccionesResueltas,
      overrides,
      preciosDia: preciosDiaTenencia,
      tipoCambioCCL,
      movimientosFondos,
    });
    const diasPorClaveCierre =
      transacciones.length || portafolioHistorial.length
        ? calcularDiasTenencia(transaccionesResueltas, { portafolioHistorial, fechaReferenciaISO: diaTenencia })
        : new Map();
    const totalCierre = posiciones.reduce((acc, t) => acc + (t.valorActualARS ?? 0), 0);
    tenenciasCierre = posiciones.map((t) => ({
      ...conCclCompra(t, cclHistoricoPorClave),
      diasTenencia: t.esCash ? null : diasPorClaveCierre.get(t.clave)?.dias ?? null,
      pctCartera: totalCierre > 0 && t.valorActualARS != null ? t.valorActualARS / totalCierre : null,
    }));
  }

  const tenenciasConPeso = tenenciasSleeve.map((t) => ({
    ...t,
    pctCartera: resumen.valorTotalARS > 0 && t.valorActualARS != null ? t.valorActualARS / resumen.valorTotalARS : null,
  }));

  const porSector = calcularDistribucion(tenenciasSleeve, "sector");
  const nuevasEnCartera = calcularNuevasEnCartera(portafolioHistorial, tenenciasConPeso);

  let snapshots = portafolioHistorial.map((h) => ({
    fecha: h.fecha,
    valorTotalARS: h.patrimonioTotal,
    rentaFijaARS: rentaFijaSnapshot(h),
    efectivoParaRF: efectivoParaRentaFija(transaccionesResueltas, movimientosFondos, h.fecha),
  }));

  /** Renta fija de unas tenencias ya valuadas (para los cierres reconstruidos). */
  const rentaFijaTenencias = (lista) => {
    let total = 0;
    for (const t of lista || []) {
      if (t.claseActivo !== CLASES.BONO_SOBERANO) continue;
      if (t.valorActualARS == null) return null;
      total += t.valorActualARS;
    }
    return total;
  };

  const fechaPosicionViva = ultimoPortafolio
    ? proyeccionOperaciones
      ? transaccionesResueltas
          .map((t) => t.fecha)
          .filter((f) => f && f > ultimoPortafolio.fecha)
          .reduce((a, b) => (b > a ? b : a), ultimoPortafolio.fecha)
      : ultimoPortafolio.fecha
    : null;

  if (preciosEnVivo && ultimoPortafolio) {
    const valorVivo = resumen.valorTotalARS;
    // Días operados intermedios sin Portafolio importado (ej. operaste el 16/09 y
    // el 17/09 pero solo hay Portafolio hasta el 15/09): antes solo se agregaba el
    // último día y los anteriores quedaban sin variación diaria. Se reconstruye el
    // valor de cierre de cada uno (posiciones + caja a ese día, a precios de ese
    // día) para que queden seleccionables con su variación.
    const diasSinSnapshot = fechasOperadas.filter(
      (f) => f > ultimoPortafolio.fecha && f < hoyISO && !snapshots.some((s) => s.fecha === f)
    );
    for (const fecha of diasSinSnapshot) {
      let preciosDiaFalta = mapaPreciosDia(fecha, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva);
      let posicionesFalta = posicionesAlCierre(fecha, {
        portafolioHistorial,
        transaccionesResueltas,
        overrides,
        preciosDia: preciosDiaFalta,
        tipoCambioCCL,
        movimientosFondos,
      });
      // Tickers con posición pero sin precio conocido (ni snapshot, ni cierre
      // guardado, ni vivo disponible por ser bajas ya vendidas): se trae el
      // cierre histórico real en vez de dejar el precio de compra proyectado.
      if (process.env.NEXT_PHASE !== "phase-production-build") {
        const vistos = new Set();
        const sinPrecio = posicionesFalta
          .filter((t) => !t.esCash && (t.cantidad ?? 0) > 0 && t.ticker && precioNumerico(preciosDiaFalta, t.ticker, t.clave) == null)
          .map((t) => t.ticker)
          .filter((tk) => {
            if (vistos.has(tk)) return false;
            vistos.add(tk);
            return true;
          });
        if (sinPrecio.length) {
          const hist = await obtenerPreciosHistoricos(sinPrecio, fecha);
          const nuevos = {};
          // Solo cotizaciones en ARS: el fallback a NYSE/NASDAQ devuelve USD y
          // valuarlo como ARS rompería el cierre (ya pasó con LRCX).
          for (const [tk, cot] of hist) if (cot?.precio && (!cot.moneda || cot.moneda === "ARS")) nuevos[tk] = cot.precio;
          if (Object.keys(nuevos).length) {
            cierres = await mergeCierresDiarios({ [fecha]: { ...(cierres[fecha] || {}), ...nuevos } });
            preciosDiaFalta = mapaPreciosDia(fecha, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva);
            posicionesFalta = posicionesAlCierre(fecha, {
              portafolioHistorial,
              transaccionesResueltas,
              overrides,
              preciosDia: preciosDiaFalta,
              tipoCambioCCL,
              movimientosFondos,
            });
          }
        }
      }
      const valor = posicionesFalta.reduce((acc, t) => acc + (t.valorActualARS ?? 0), 0);
      if (valor > 0) snapshots.push({
        fecha,
        valorTotalARS: valor,
        rentaFijaARS: rentaFijaTenencias(posicionesFalta),
        efectivoParaRF: efectivoParaRentaFija(transaccionesResueltas, movimientosFondos, fecha),
      });
    }
    const fechas = new Set([fechaPosicionViva, ...(sesionHoy ? [hoyISO] : [])].filter(Boolean));
    const rentaFijaViva = rentaFijaTenencias(tenencias);
    for (const fecha of [...fechas].sort()) {
      const idx = snapshots.findIndex((s) => s.fecha === fecha);
      const efectivoRF = efectivoParaRentaFija(transaccionesResueltas, movimientosFondos, fecha);
      if (idx >= 0) {
        if (fecha === hoyISO && ultimoPortafolio.fecha === hoyISO) {
          snapshots[idx] = { fecha, valorTotalARS: valorVivo, rentaFijaARS: rentaFijaViva, efectivoParaRF: efectivoRF };
        }
        continue;
      }
      snapshots.push({ fecha, valorTotalARS: valorVivo, rentaFijaARS: rentaFijaViva, efectivoParaRF: efectivoRF });
    }
    snapshots.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // Total visto en vivo: se persiste solo (última visita del día gana) y pisa
  // el valor reconstruido en snapshots/serie. Ante un Portfolio importado de
  // la misma fecha, el Portfolio (dato oficial IEB) tiene prioridad.
  // CLAVE: solo se auto-guarda la sesión de HOY en rueda. Con timestamps
  // viejos (pre-sesión, finde) `detectado.fechaSesion` apunta a la última
  // sesión y el valor vivo de hoy pisaría su cierre real (pasó el 22/9:
  // el punto mostraba el valor de la mañana siguiente superpuesto).
  let auto = patrimonioAuto && typeof patrimonioAuto === "object" ? patrimonioAuto : {};
  if (process.env.NEXT_PHASE !== "phase-production-build" && preciosEnVivo && ultimoPortafolio && resumen.valorTotalARS > 0) {
    const fechaAuto = sesionHoy ? hoyISO : null;
    const hayPortafolio = fechaAuto != null && portafolioHistorial.some((h) => h.fecha === fechaAuto);
    if (fechaAuto != null && !hayPortafolio) auto = await guardarPatrimonioAuto(fechaAuto, resumen.valorTotalARS, rentaFijaTenencias(tenencias));
  }
  if (auto && typeof auto === "object" && Object.keys(auto).length) {
    const fechasPortafolio = new Set(portafolioHistorial.map((h) => h.fecha));
    for (const [fecha, entrada] of Object.entries(auto)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fechasPortafolio.has(fecha)) continue;
      // Entradas viejas en formato número directo; las nuevas traen { valor, rentaFija }.
      const valor = typeof entrada === "number" ? entrada : entrada?.valor;
      const rf = typeof entrada === "number" ? null : (entrada?.rentaFija ?? null);
      if (!(valor > 0)) continue;
      const idx = snapshots.findIndex((s) => s.fecha === fecha);
      if (idx >= 0) {
        snapshots[idx] = {
          ...snapshots[idx],
          fecha,
          valorTotalARS: valor,
          ...(rf != null && snapshots[idx].rentaFijaARS == null ? { rentaFijaARS: rf } : {}),
        };
      } else {
        snapshots.push({
          fecha,
          valorTotalARS: valor,
          rentaFijaARS: rf,
          efectivoParaRF: efectivoParaRentaFija(transaccionesResueltas, movimientosFondos, fecha),
        });
      }
    }
    snapshots.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // Pre-sesión, el punto de hoy no se muestra aunque haya quedado guardado
  // (auto de una visita anterior): el día se habilita cuando abre la rueda.
  // Así gráfico, periodos y estrategias terminan en la última sesión.
  if (!sesionHoy) {
    const soloCerrados = snapshots.filter((s) => s.fecha < hoyISO);
    if (soloCerrados.length) snapshots = soloCerrados;
  }

  const evolucionPatrimonio = calcularEvolucionPatrimonio(snapshots);
  const evolucionSemana = calcularEvolucionSemana(snapshots);
  const semanasEvolucion = calcularSemanas(snapshots);
  const serieEvolucion = calcularSerieEvolucion(snapshots, 365);

  // La variación "sin renta fija" por fotos mezcla rendimiento con movimientos
  // de plata entre sleeves (ej. comprar bonos con caja se leería como pérdida
  // de la parte variable). Se netean con el ajuste de flujos hacia RF.
  const flujoHaciaRF = (desde, hasta) => ajusteFlujosRentaFija(transaccionesResueltas, movimientosFondos, desde, hasta);
  const ajustarSinRF = (variacion) => {
    const s = variacion?.sinRentaFija;
    if (!s || variacion.desdeValorARS == null) return;
    // Ventana con fechas REALES (s.desdeFecha, no el lunes de display).
    const flujo = flujoHaciaRF(s.desdeFecha, variacion.hastaFecha);
    if (!flujo) return;
    s.diffARS += flujo;
    s.diffPct = variacion.desdeValorARS > 0 ? s.diffARS / variacion.desdeValorARS : null;
  };
  if (evolucionPatrimonio) {
    ajustarSinRF(evolucionPatrimonio.diaria);
    ajustarSinRF(evolucionPatrimonio.semanal);
  }
  for (const sem of semanasEvolucion) {
    ajustarSinRF(sem.semanal);
    for (const d of sem.dias || []) {
      ajustarSinRF(d.variacion);
      // Ex-RF acumulada base→día (la que muestra la tarjeta al navegar): con flujos.
      const base = sem.semanal?.sinRentaFija;
      const dv = d.variacion?.sinRentaFija;
      if (base && dv && dv.hastaValorARS != null && base.desdeValorARS != null && d.fecha && sem.semanal?.desdeValorARS != null) {
        const flujo = flujoHaciaRF(base.desdeFecha, d.fecha);
        const dd = dv.hastaValorARS - base.desdeValorARS + flujo;
        d.variacion.sinRentaFijaSemanal = {
          desdeFecha: base.desdeFecha,
          hastaFecha: d.fecha,
          desdeValorARS: base.desdeValorARS,
          hastaValorARS: dv.hastaValorARS,
          diffARS: dd,
          diffPct: sem.semanal.desdeValorARS > 0 ? dd / sem.semanal.desdeValorARS : null,
        };
      }
    }
  }

  // Serie de valor del sleeve largo en las fechas con snapshot (para atribuir
  // su parte de la ganancia del periodo en el detalle de renta variable).
  const fechasSerieLargo = Array.from(new Set([
    ...snapshots.map((s) => s.fecha).filter((f) => !fechaCorteSleeves || f >= fechaCorteSleeves),
    hoyISO,
  ])).sort();
  const preciosHoySleeves = new Map();
  for (const [tk, cot] of preciosDisponibles) {
    // En rueda al ask más bajo, fuera de rueda al cierre.
    const p = precioVivo(cot, null) ?? cot.ultimo ?? cot.precio;
    if (p) preciosHoySleeves.set(tk, p);
  }
  const serieLargo = serieValorSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.LARGO,
    fechas: fechasSerieLargo,
    portafolioHistorial,
    cierres,
    preciosHoy: preciosHoySleeves,
    overrides,
  });
  const serieTrading = serieValorSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.TRADING,
    fechas: fechasSerieLargo,
    portafolioHistorial,
    cierres,
    preciosHoy: preciosHoySleeves,
    overrides,
  });
  const serieEfectivoTrading = serieEfectivoSleeve({
    apertura: efectivoAperturaSleeves,
    fondos: movimientosFondos,
    transacciones: transaccionesResueltas,
    traspasos: traspasosEfectivo,
    overrides,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.TRADING,
    fechas: fechasSerieLargo,
  });
  const serieEfectivoLargo = serieEfectivoSleeve({
    apertura: efectivoAperturaSleeves,
    fondos: movimientosFondos,
    transacciones: transaccionesResueltas,
    traspasos: traspasosEfectivo,
    overrides,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.LARGO,
    fechas: fechasSerieLargo,
  });
  const serieRentaFija = serieValorSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.RENTA_FIJA,
    fechas: fechasSerieLargo,
    portafolioHistorial,
    cierres,
    preciosHoy: preciosHoySleeves,
    overrides,
  });
  const serieEfectivoRentaFija = serieEfectivoSleeve({
    apertura: efectivoAperturaSleeves,
    fondos: movimientosFondos,
    transacciones: transaccionesResueltas,
    traspasos: traspasosEfectivo,
    overrides,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.RENTA_FIJA,
    fechas: fechasSerieLargo,
  });
  const serieCostoTrading = serieCostoSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.TRADING,
    fechas: fechasSerieLargo,
    overrides,
  });
  const serieCostoLargo = serieCostoSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.LARGO,
    fechas: fechasSerieLargo,
    overrides,
  });
  const serieCostoRentaFija = serieCostoSleeve({
    transacciones: transaccionesResueltas,
    aperturaLotes: aperturaSleeves.lotes,
    fechaCorte: fechaCorteSleeves,
    sleeve: SLEEVES.RENTA_FIJA,
    fechas: fechasSerieLargo,
    overrides,
  });

  return {
    vacio: false,
    fuentePosiciones,
    proyeccionOperaciones,
    proyeccionDesdeFecha,
    preciosEnVivo,
    tipoCambioCCL,
    resumen,
    porSector,
    snapshots,
    evolucionPatrimonio,
    evolucionSemana,
    semanasEvolucion,
    serieEvolucion,
    nuevasEnCartera,
    tenencias: tenenciasConPeso,
    ventasRealizadas,
    transacciones: transaccionesResueltas,
    resultadosDia,
    diasOperados: fechasOperadas,
    dia,
    diasTenencia,
    diaTenencia,
    tenenciasCierre,
    movimientosFondos,
    traspasosEfectivo,
    fechaCorteSleeves,
    sleeveLotes: [...mapaLotesSleeves.values()],
    efectivoSleeves,
    serieLargo,
    serieTrading,
    serieEfectivoTrading,
    serieEfectivoLargo,
    serieRentaFija,
    serieEfectivoRentaFija,
    serieCostoTrading,
    serieCostoLargo,
    serieCostoRentaFija,
  };
});

/**
 * Caché cross-request del resultado completo (el "shell de datos" de la app):
 * las aperturas y cambios de pestaña repetidos dentro del TTL no recalculan
 * nada — el HTML sale en ms, y el JS/CSS ya cacheado por el SW hace el resto.
 * Solo quedan por cargar los refrescos vivos del cliente (/api/precios).
 * La clave incluye fecha ART, estado de sesión y versión de escrituras:
 * cualquier edición por UI/cron invalida al instante, y el cruce de las 10:30
 * (apertura de rueda) genera otra clave. TTL 20 s, coherente con precios
 * (15 s) y Blob (30 s). Los auto-guardados que hace el cálculo (cierres,
 * patrimonio) pasan a correr como máximo una vez por TTL: suficiente.
 */
const TTL_DATOS_MS = 20 * 1000;
const cacheDatosCartera = new Map(); // clave -> { v, t }

function claveDatosCartera(diaSeleccionado, diaTenenciaSeleccionado) {
  return [
    diaSeleccionado ?? "",
    diaTenenciaSeleccionado ?? "",
    hoyArgentina(),
    sesionAbiertaHoy(new Date()) ? "1" : "0",
    versionDatos(),
  ].join("|");
}

export async function obtenerDatosCartera(diaSeleccionado = null, diaTenenciaSeleccionado = null) {
  const clave = claveDatosCartera(diaSeleccionado, diaTenenciaSeleccionado);
  const e = cacheDatosCartera.get(clave);
  if (e && Date.now() - e.t < TTL_DATOS_MS) return e.v;
  const v = await obtenerDatosCarteraInterna(diaSeleccionado, diaTenenciaSeleccionado);
  // El cómputo escribe (auto-saves) y bumptea la versión: la clave de
  // guardado se deriva DESPUÉS, si no la entrada quedaría con clave vieja y
  // no matchearía nunca.
  const claveFinal = claveDatosCartera(diaSeleccionado, diaTenenciaSeleccionado);
  if (cacheDatosCartera.size > 20) cacheDatosCartera.clear();
  cacheDatosCartera.set(claveFinal, { v, t: Date.now() });
  return v;
}
