import { cache } from "react";
import { leerTransacciones, leerClasificaciones, leerPortafolioHistorial, leerCierresDiarios, mergeCierresDiarios, leerMovimientosFondos } from "./storage.js";
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
  calcularCCLHistoricoPorClave,
  calcularResultadosDelDia,
  calcularDiasTenencia,
  factorPrecioPorClase,
} from "./calculos.js";
import { obtenerPrecios, obtenerTipoCambioCCL, obtenerPreciosHistoricos } from "./precios.js";
import { TICKERS_NO_MERCADO, CLASES } from "./clasificacion.js";
import { aISO } from "./accesosRapidosFecha.js";

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
  const snap = portafolioHistorial.find((h) => h.fecha === fecha);
  if (snap) {
    for (const h of snap.tenencias || []) {
      if (h.precio == null) continue;
      if (h.ticker) mapa.set(h.ticker, h.precio);
      mapa.set(h.ticker || h.nombre, h.precio);
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
// viva ES esa fecha, caso en que lo vivo es el cierre).
function mapaPreciosDia(fecha, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva) {
  const mapa = new Map(preciosDeFecha(fecha, portafolioHistorial, cierres));
  const esSesionViva = fechaSesionViva && fechaSesionViva === fecha;
  for (const [tk, cot] of preciosDisponibles) {
    if (!cot?.precio) continue;
    if (esSesionViva || !mapa.has(tk)) mapa.set(tk, cot.precio);
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
      mapa.set(ticker, cot.precio);
      porFecha.set(fecha, mapa);
      if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    }
  }
  if (fechaMax) {
    const mapa = porFecha.get(fechaMax);
    for (const [ticker, cot] of preciosDisponibles) {
      if (!cot?.precio || cot.actualizado) continue;
      mapa.set(ticker, cot.precio);
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
    for (const [tk, cot] of hist) if (cot?.precio) mapa[tk] = cot.precio;
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
export const obtenerDatosCartera = cache(async function obtenerDatosCartera(diaSeleccionado = null, diaTenenciaSeleccionado = null) {
  const [transacciones, overrides, portafolioHistorial, movimientosFondos] = await Promise.all([
    leerTransacciones(),
    leerClasificaciones(),
    leerPortafolioHistorial(),
    leerMovimientosFondos(),
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

  const resumen = calcularResumen(tenencias);
  if (ultimoPortafolio?.patrimonioTotal != null && !preciosEnVivo) {
    resumen.valorTotalARS = ultimoPortafolio.patrimonioTotal;
  }

  const ventasRealizadas = transaccionesResueltas.length ? await calcularVentasRealizadas(transaccionesResueltas, overrides) : [];

  const hoyISO = aISO(new Date());

  // Captura/backfill de cierres diarios (solo en runtime, no en build)
  let cierres = await leerCierresDiarios();
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const detectado = detectarCierres(preciosDisponibles);
    if (detectado.cierres && Object.keys(detectado.cierres).length) {
      cierres = await mergeCierresDiarios(detectado.cierres);
    }
    const fechasOperadasTodas = Array.from(new Set(transaccionesResueltas.map((t) => t.fecha).filter(Boolean))).sort();
    const ultimaFechaPortafolio = ultimoPortafolio?.fecha ?? null;
    const faltantes = fechasOperadasTodas
      .filter((f) => f < hoyISO && f !== detectado.fechaSesion && (!ultimaFechaPortafolio || f > ultimaFechaPortafolio) && !cierres[f] && !portafolioHistorial.some((h) => h.fecha === f))
      .slice(-5);
    if (faltantes.length) {
      const backfill = await backfillCierres(faltantes, portafolioHistorial, transaccionesResueltas, cierres);
      if (Object.keys(backfill).length) cierres = await mergeCierresDiarios(backfill);
    }
  }

  // Selección de día
  const fechasOperadas = Array.from(new Set(transaccionesResueltas.map((t) => t.fecha).filter(Boolean))).sort();
  const diaPorDefecto = fechasOperadas.includes(hoyISO) ? hoyISO : (fechasOperadas[fechasOperadas.length - 1] ?? "");
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

  const tenenciasConPeso = tenencias.map((t) => ({
    ...t,
    pctCartera: resumen.valorTotalARS > 0 && t.valorActualARS != null ? t.valorActualARS / resumen.valorTotalARS : null,
  }));

  const porSector = calcularDistribucion(tenencias, "sector");
  const nuevasEnCartera = calcularNuevasEnCartera(portafolioHistorial, tenenciasConPeso);

  const snapshots = portafolioHistorial.map((h) => ({ fecha: h.fecha, valorTotalARS: h.patrimonioTotal }));

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
      const preciosDiaFalta = mapaPreciosDia(fecha, portafolioHistorial, cierres, preciosDisponibles, fechaSesionViva);
      const posicionesFalta = posicionesAlCierre(fecha, {
        portafolioHistorial,
        transaccionesResueltas,
        overrides,
        preciosDia: preciosDiaFalta,
        tipoCambioCCL,
        movimientosFondos,
      });
      const valor = posicionesFalta.reduce((acc, t) => acc + (t.valorActualARS ?? 0), 0);
      if (valor > 0) snapshots.push({ fecha, valorTotalARS: valor });
    }
    const fechas = new Set([fechaPosicionViva, hoyISO].filter(Boolean));
    for (const fecha of [...fechas].sort()) {
      const idx = snapshots.findIndex((s) => s.fecha === fecha);
      if (idx >= 0) {
        if (fecha === hoyISO && ultimoPortafolio.fecha === hoyISO) {
          snapshots[idx] = { fecha, valorTotalARS: valorVivo };
        }
        continue;
      }
      snapshots.push({ fecha, valorTotalARS: valorVivo });
    }
    snapshots.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  const evolucionPatrimonio = calcularEvolucionPatrimonio(snapshots);
  const evolucionSemana = calcularEvolucionSemana(snapshots);
  const semanasEvolucion = calcularSemanas(snapshots);
  const serieEvolucion = calcularSerieEvolucion(snapshots, 30);

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
  };
});
