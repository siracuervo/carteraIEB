import { CLASES, clasificar, claveActivo, aplicarOverride, esCaucion } from "./clasificacion.js";
import { construirTenenciasDesdePortafolio, factorPrecioPorClase, importeConDerechos } from "./calculos.js";

/**
 * Modelo autónomo por estrategias ("sleeves"): la cartera ya no depende del
 * Portafolio de IEB para moverse — los cambios entran por compras/ventas,
 * ingresos/retiros y traspasos internos de efectivo.
 *
 * Sleeves: trading y largo plazo (renta variable) + renta fija (bonos).
 * El sleeve se asigna al momento de cargar la compra (a nivel lote: el mismo
 * ticker puede estar en trading y en largo a la vez). Los bonos siempre van a
 * renta fija. Todo lo histórico (sin sleeve cargado) se considera trading,
 * salvo bonos.
 */
export const SLEEVES = {
  TRADING: "trading",
  LARGO: "largo",
  RENTA_FIJA: "rentaFija",
};

export const ETIQUETAS_SLEEVE = {
  [SLEEVES.TRADING]: "Trading",
  [SLEEVES.LARGO]: "Largo plazo",
  [SLEEVES.RENTA_FIJA]: "Renta fija",
};

export function esSleeveValido(s) {
  return s === SLEEVES.TRADING || s === SLEEVES.LARGO || s === SLEEVES.RENTA_FIJA;
}

/** Clase efectiva (con override del usuario) para decidir el sleeve por defecto. */
function claseDe(t, overrides) {
  const base = clasificar({ activo: t?.activo, ticker: t?.ticker, operacion: t?.operacion });
  if (!overrides) return base.claseActivo;
  try {
    return aplicarOverride(claveActivo(t), base, overrides).claseActivo;
  } catch {
    return base.claseActivo;
  }
}

/** Sleeve por defecto cuando la operación no lo trae (histórico/imports). */
export function sleevePorDefecto({ activo, ticker, operacion } = {}, overrides = null) {
  const claseActivo = claseDe({ activo, ticker, operacion }, overrides);
  return claseActivo === CLASES.BONO_SOBERANO ? SLEEVES.RENTA_FIJA : SLEEVES.TRADING;
}

/** Sleeve efectivo de una transacción de compra/venta. */
export function sleeveDeTransaccion(t, overrides = null) {
  if (esSleeveValido(t?.sleeve)) return t.sleeve;
  return sleevePorDefecto({ activo: t?.activo, ticker: t?.ticker, operacion: t?.operacion }, overrides);
}

/**
 * Destino de un movimiento de fondos. Los ingresos/retiros nuevos lo traen
 * obligatorio; el histórico (ej. el ingreso de 09/2026, que terminó en bonos)
 * se asume de renta fija, igual que hacía el modelo anterior.
 */
export function destinoDeFondo(f) {
  if (esSleeveValido(f?.destino)) return f.destino;
  return SLEEVES.RENTA_FIJA;
}

function esCompraOp(op) {
  return (op || "").toUpperCase().includes("COMPRA");
}

function esVentaOp(op) {
  return (op || "").toUpperCase().includes("VENTA");
}

/** Costo ARS de una compra para abrir lote (importe real o estimado). null si no se puede saber. */
function costoDeCompra(t, claseActivo, divisa) {
  const cant = Math.abs(t.cantidad ?? 0);
  if (!(cant > 0)) return null;
  if (t.importeARS != null) return Math.abs(t.importeARS);
  const op = (t.operacion || "").toUpperCase();
  if (op.includes("PARIDAD")) return null;
  if ((divisa || "ARS") !== "ARS" || t.precio == null) return null;
  return importeConDerechos(t.precio * cant * factorPrecioPorClase(claseActivo), true);
}

/**
 * Efecto en caja (ARS, firmado) de un ticket: compras restan, ventas suman.
 * Mismo criterio que la proyección sobre Portafolio (importe real con gastos,
 * o estimado Precio × Cantidad solo en ARS sin paridad).
 */
export function efectoCajaTicket(t, claseActivo, divisa) {
  if (t.importeARS != null) return t.importeARS;
  const op = (t.operacion || "").toUpperCase();
  const esCompra = esCompraOp(op);
  const esVenta = esVentaOp(op);
  if ((!esCompra && !esVenta) || op.includes("PARIDAD") || t.precio == null) return 0;
  if (divisa != null && divisa !== "ARS") return 0;
  if (claseActivo === CLASES.EFECTIVO) return 0;
  const monto = Math.abs(t.cantidad ?? 0) * t.precio * factorPrecioPorClase(claseActivo);
  if (!(monto > 0)) return 0;
  return esCompra ? -importeConDerechos(monto, true) : importeConDerechos(monto, false);
}

function claveSleeve(clave, sleeve) {
  return `${clave}||${sleeve}`;
}

/**
 * Apertura inicial de lotes desde el último Portafolio de IEB (punto de corte
 * a partir del cual la cartera se mueve sola). Toda la RV existente va a
 * trading, los bonos a renta fija.
 * Devuelve { fecha, lotes: [{ clave, sleeve, cantidad, costoTotal }] }.
 */
export function aperturaDesdePortafolio(portafolio, overrides) {
  if (!portafolio) return { fecha: null, lotes: [] };
  const tenencias = construirTenenciasDesdePortafolio(portafolio, overrides);
  const lotes = [];
  for (const t of tenencias) {
    if (t.esCash || t.claseActivo === CLASES.EFECTIVO) continue;
    if (!(t.cantidad > 0)) continue;
    lotes.push({
      clave: t.clave,
      ticker: t.ticker ?? null,
      claseActivo: t.claseActivo,
      sleeve: t.claseActivo === CLASES.BONO_SOBERANO ? SLEEVES.RENTA_FIJA : SLEEVES.TRADING,
      cantidad: t.cantidad,
      costoTotal: t.costoTotal ?? null,
    });
  }
  return { fecha: portafolio.fecha, lotes };
}

/** Efectivo de apertura: todo el disponible del Portafolio va a trading. */
export function efectivoApertura(portafolio) {
  const ars = portafolio?.efectivo?.ARS ?? 0;
  // El USD en efectivo ya viene pesificado en la fila agregada; si el
  // Portafolio no trae DOLARUSA no se puede convertir acá (se resuelve en
  // datosCartera con la fila EFECTIVO_TOTAL ya valuada).
  return { trading: ars > 0 ? ars : 0, largo: 0, rentaFija: 0 };
}

/**
 * Camina compras/ventas posteriores al corte y arma lotes FIFO por
 * (clave, sleeve). Las ventas con sleeve explícito consumen ese sleeve
 * primero (y derraman al otro si falta); sin sleeve, trading primero.
 * Devuelve Map claveSleeve -> { clave, sleeve, cantidad, costoTotal|null, realizado, sinCosto }.
 */
export function lotesPorSleeve(transacciones, { aperturaLotes = [], fechaCorte = null, hastaFecha = null, overrides = null } = {}) {
  const mapa = new Map();
  const colas = new Map(); // claveSleeve -> [{ cantidad, costoUnit|null, fecha }]
  const metas = new Map(); // claveSleeve -> { ticker, clase } (para valuar después)

  function colaDe(clave, sleeve) {
    const k = claveSleeve(clave, sleeve);
    if (!colas.has(k)) colas.set(k, []);
    return colas.get(k);
  }

  for (const a of aperturaLotes) {
    if (!(a.cantidad > 0)) continue;
    const k = claveSleeve(a.clave, a.sleeve);
    if (!metas.has(k)) metas.set(k, { ticker: a.ticker ?? null, clase: a.claseActivo ?? null });
    colaDe(a.clave, a.sleeve).push({
      cantidad: a.cantidad,
      costoUnit: a.costoTotal != null && a.cantidad > 0 ? a.costoTotal / a.cantidad : null,
      fecha: fechaCorte,
    });
  }

  const ordenadas = [...(transacciones || [])]
    .filter((t) => t.fecha && (!fechaCorte || t.fecha > fechaCorte) && (!hastaFecha || t.fecha <= hastaFecha))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      const ha = a.hora || "";
      const hb = b.hora || "";
      if (ha !== hb) return ha < hb ? -1 : 1;
      const aCompra = esCompraOp((a.operacion || "").toUpperCase());
      const bCompra = esCompraOp((b.operacion || "").toUpperCase());
      if (aCompra !== bCompra) return aCompra ? -1 : 1;
      return 0;
    });

  for (const t of ordenadas) {
    const op = (t.operacion || "").toUpperCase();
    const esCompra = esCompraOp(op);
    const esVenta = esVentaOp(op);
    if (!esCompra && !esVenta) continue;
    if ((t.cantidad ?? 0) === 0) continue;
    const { claseActivo } = clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion });
    if (claseActivo === CLASES.MOVIMIENTO || claseActivo === CLASES.EFECTIVO) continue;
    const clave = claveActivo(t);
    const cant = Math.abs(t.cantidad ?? 0);
    if (!(cant > 0)) continue;

    if (esCompra) {
      const sleeve = sleeveDeTransaccion(t, overrides);
      const costo = costoDeCompra(t, claseActivo, t.divisa);
      const k = claveSleeve(clave, sleeve);
      if (!metas.has(k)) metas.set(k, { ticker: t.ticker ?? null, clase: claseActivo });
      colaDe(clave, sleeve).push({
        cantidad: cant,
        costoUnit: costo != null && cant > 0 ? costo / cant : null,
        fecha: t.fecha,
      });
    } else {
      // Venta: sleeve pedido primero, después el resto (trading antes que largo).
      const pedido = esSleeveValido(t.sleeve) ? t.sleeve : null;
      const orden = pedido
        ? [pedido, ...Object.values(SLEEVES).filter((s) => s !== pedido)]
        : [SLEEVES.TRADING, SLEEVES.LARGO, SLEEVES.RENTA_FIJA];
      let porConsumir = cant;
      for (const sleeve of orden) {
        if (porConsumir <= 1e-9) break;
        const cola = colaDe(clave, sleeve);
        while (porConsumir > 1e-9 && cola.length) {
          const lote = cola[0];
          const usar = Math.min(lote.cantidad, porConsumir);
          lote.cantidad -= usar;
          porConsumir -= usar;
          if (lote.cantidad < 1e-9) cola.shift();
        }
      }
    }
  }

  for (const [k, cola] of colas) {
    const [clave, sleeve] = k.split("||");
    const cantidad = cola.reduce((acc, l) => acc + l.cantidad, 0);
    if (cantidad <= 1e-9) continue;
    const sinCosto = cola.some((l) => l.costoUnit == null);
    const costoTotal = sinCosto ? null : cola.reduce((acc, l) => acc + l.cantidad * l.costoUnit, 0);
    const meta = metas.get(k) || {};
    mapa.set(k, { clave, ticker: meta.ticker ?? null, claseActivo: meta.clase ?? null, sleeve, cantidad, costoTotal, sinCosto });
  }
  return mapa;
}

/**
 * Efectivo por sleeve desde la apertura: fondos con destino, tickets por
 * sleeve y traspasos internos. `costoTotal` de apertura y tickets sin importe
 * usan el mismo criterio de estimación que la proyección.
 */
export function efectivoPorSleeve({ apertura = null, fondos = [], transacciones = [], traspasos = [], overrides = null, fechaCorte = null, hastaFecha = null } = {}) {
  const saldos = {
    [SLEEVES.TRADING]: apertura?.trading ?? 0,
    [SLEEVES.LARGO]: apertura?.largo ?? 0,
    [SLEEVES.RENTA_FIJA]: apertura?.rentaFija ?? 0,
  };

  for (const f of fondos || []) {
    if (!f.fecha || !(f.monto > 0)) continue;
    if (fechaCorte && f.fecha <= fechaCorte) continue;
    if (hastaFecha && f.fecha > hastaFecha) continue;
    const d = destinoDeFondo(f);
    saldos[d] += f.tipo === "retiro" ? -f.monto : f.monto;
  }

  const ordenadas = [...(transacciones || [])]
    .filter((t) => t.fecha && (!fechaCorte || t.fecha > fechaCorte) && (!hastaFecha || t.fecha <= hastaFecha))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      const ha = a.hora || "";
      const hb = b.hora || "";
      if (ha !== hb) return ha < hb ? -1 : 1;
      const aCompra = esCompraOp((a.operacion || "").toUpperCase());
      const bCompra = esCompraOp((b.operacion || "").toUpperCase());
      if (aCompra !== bCompra) return aCompra ? -1 : 1;
      return 0;
    });

  for (const t of ordenadas) {
    const op = (t.operacion || "").toUpperCase();
    // Caución (colocación/vencimiento): no son unidades sino movimientos de
    // caja del sleeve elegido — el importe firmado manda.
    if (esCaucion(t.activo, t.operacion)) {
      if (t.importeARS != null && t.importeARS !== 0) {
        saldos[sleeveDeTransaccion(t, overrides)] += t.importeARS;
      }
      continue;
    }
    if (esCompraOp(op) || esVentaOp(op)) {
      const claseActivo = claseDe(t, overrides);
      if (claseActivo === CLASES.MOVIMIENTO || claseActivo === CLASES.EFECTIVO) continue;
      const ef = efectoCajaTicket(t, claseActivo, t.divisa ?? "ARS");
      if (ef) saldos[sleeveDeTransaccion(t, overrides)] += ef;
    } else if (!/GASTOS|ORDEN\s*DE PAGO|CREDITO DER MERC|NOTA DE DEBITO|MEMBRESIA/i.test(op)) {
      // Dividendos y acreditaciones: a la caja del sleeve del activo.
      if (t.importeARS != null && t.importeARS !== 0) {
        saldos[sleeveDeTransaccion(t, overrides)] += t.importeARS;
      }
    }
  }

  for (const tr of traspasos || []) {
    if (!tr.fecha || !(tr.monto > 0)) continue;
    if (fechaCorte && tr.fecha <= fechaCorte) continue;
    if (hastaFecha && tr.fecha > hastaFecha) continue;
    if (!esSleeveValido(tr.desde) || !esSleeveValido(tr.hacia) || tr.desde === tr.hacia) continue;
    saldos[tr.desde] -= tr.monto;
    saldos[tr.hacia] += tr.monto;
  }

  return saldos;
}

/**
 * Caución colocada y todavía no cobrada a una fecha: −Σ de importes firmados
 * (colocación resta, vencimiento suma). Es plata que salió de caja pero sigue
 * siendo patrimonio — hay que sumarla a las fotos para medir bien la ganancia.
 */
export function balanceCaucion(transacciones, fechaISO) {
  let flujos = 0;
  for (const t of transacciones || []) {
    if (!t.fecha || (fechaISO && t.fecha > fechaISO)) continue;
    if (!esCaucion(t.activo, t.operacion)) continue;
    if (t.importeARS == null) continue;
    flujos += t.importeARS;
  }
  // Piso en cero: lo que excede lo colocado es interés ya ganado (rinde en las
  // fotos y la caja, no como saldo colocado).
  return Math.max(0, -flujos);
}

/**
 * Precio ARS de un ticker a una fecha: último Portafolio a esa fecha o
 * anterior, si no el cierre guardado más cercano anterior, si no el precio
 * vivo actual (mapa ticker->precio). null si no hay nada.
 */
export function precioEnFecha(ticker, fechaISO, { portafolioHistorial = [], cierres = {}, preciosHoy = null } = {}) {
  if (!ticker) return null;
  const tk = String(ticker).toUpperCase();
  let snap = null;
  let snapPrecio = null;
  for (const h of portafolioHistorial || []) {
    if (!h.fecha || h.fecha > fechaISO) continue;
    if (!snap || h.fecha > snap.fecha) snap = h;
  }
  if (snap) {
    for (const t of snap.tenencias || []) {
      if ((t.ticker || "").toUpperCase() === tk && t.precio != null) {
        snapPrecio = t.precio;
        break;
      }
    }
  }
  let mejorFecha = null;
  let cierrePrecio = null;
  for (const f of Object.keys(cierres || {})) {
    if (f > fechaISO) continue;
    const px = cierres[f]?.[ticker] ?? cierres[f]?.[tk];
    if (px == null) continue;
    if (!mejorFecha || f > mejorFecha) {
      mejorFecha = f;
      cierrePrecio = px;
    }
  }
  // El cierre para la fecha pedida manda si es más reciente que el snapshot
  // (ej. hoy 2026-09-20 con TMF27 123.2 vs snapshot 2026-09-15 con 122.6).
  if (snapPrecio != null && cierrePrecio != null) {
    if (mejorFecha > snap.fecha) return cierrePrecio;
    if (mejorFecha === snap.fecha) return cierrePrecio;
    return snapPrecio;
  }
  if (cierrePrecio != null) return cierrePrecio;
  if (snapPrecio != null) return snapPrecio;
  const hoy = preciosHoy?.get?.(ticker) ?? preciosHoy?.get?.(tk);
  if (typeof hoy === "number") return hoy;
  return hoy?.precio ?? hoy?.ultimo ?? null;
}

/**
 * Serie de caja (PESOS) por sleeve en fechas dadas, caminando el ledger
 * autónomo (fondos con destino + tickets por sleeve + traspasos internos).
 */
export function serieEfectivoSleeve({ apertura, fondos, transacciones, traspasos, overrides, fechaCorte, sleeve, fechas }) {
  return (fechas || []).map((fecha) => ({
    fecha,
    valor: efectivoPorSleeve({ apertura, fondos, transacciones, traspasos, overrides, fechaCorte, hastaFecha: fecha })[sleeve] ?? 0,
  }));
}

/**
 * Serie de valor ARS de un sleeve en fechas dadas: camina los lotes hasta
 * cada fecha y valúa con precioEnFecha. Para el largo plazo (que nace en el
 * corte) permite atribuir su ganancia del periodo sin historia previa.
 * Devuelve [{ fecha, valor }] (valor null si nada valuado y sin cantidad).
 */
export function serieValorSleeve({ transacciones, aperturaLotes, fechaCorte, sleeve, fechas, portafolioHistorial, cierres, preciosHoy, overrides }) {
  const out = [];
  for (const fecha of fechas || []) {
    const mapa = lotesPorSleeve(transacciones, { aperturaLotes, fechaCorte, hastaFecha: fecha, overrides });
    let valor = 0;
    let hayCantidad = false;
    for (const l of mapa.values()) {
      if (l.sleeve !== sleeve || !(l.cantidad > 0)) continue;
      hayCantidad = true;
      const px = precioEnFecha(l.ticker || l.clave, fecha, { portafolioHistorial, cierres, preciosHoy });
      if (px == null) continue;
      const factor = l.claseActivo ? factorPrecioPorClase(l.claseActivo) : 1;
      valor += l.cantidad * px * factor;
    }
    out.push({ fecha, valor: hayCantidad ? valor : 0 });
  }
  return out;
}

export function serieCostoSleeve({ transacciones, aperturaLotes, fechaCorte, sleeve, fechas, overrides }) {
  const out = [];
  for (const fecha of fechas || []) {
    const mapa = lotesPorSleeve(transacciones, { aperturaLotes, fechaCorte, hastaFecha: fecha, overrides });
    let costo = 0;
    let hay = false;
    for (const l of mapa.values()) {
      if (l.sleeve !== sleeve || l.costoTotal == null) continue;
      hay = true;
      costo += l.costoTotal;
    }
    out.push({ fecha, valor: hay ? costo : 0 });
  }
  return out;
}

/**
 * Divide las tenencias vivas por sleeve para mostrarlas: una clave en dos
 * sleeves genera dos filas (misma clave para links, `sleeve` distinto y
 * `claveFila` única). La fila EFECTIVO_TOTAL se parte en las 3 cajas del
 * ledger. Devuelve { tenencias, totalARS } con pctCartera recalculado.
 */
export function dividirTenenciasPorSleeve(tenencias, mapaLotes, efectivoSleeves) {
  const porClave = new Map();
  for (const l of mapaLotes?.values?.() ?? []) {
    if (!(l.cantidad > 0)) continue;
    if (!porClave.has(l.clave)) porClave.set(l.clave, []);
    porClave.get(l.clave).push(l);
  }
  const filas = [];
  for (const t of tenencias || []) {
    if (t.clave === "EFECTIVO_TOTAL") continue;
    const lotes = porClave.get(t.clave) || [];
    const sleevesConPos = [...new Set(lotes.map((l) => l.sleeve))];
    if (!sleevesConPos.length) {
      // Sin lotes (sintéticas de proyección, o precio sin cantidad): sleeve
      // por defecto, fila intacta.
      const sleeve = t.claseActivo === CLASES.BONO_SOBERANO ? SLEEVES.RENTA_FIJA : SLEEVES.TRADING;
      filas.push({ ...t, sleeve, claveFila: `${t.clave}||${sleeve}` });
      continue;
    }
    if (sleevesConPos.length === 1) {
      filas.push({ ...t, sleeve: sleevesConPos[0], claveFila: `${t.clave}||${sleevesConPos[0]}` });
      continue;
    }
    for (const sleeve of sleevesConPos) {
      const deSleeve = lotes.filter((l) => l.sleeve === sleeve);
      const cantidad = deSleeve.reduce((acc, l) => acc + l.cantidad, 0);
      const conCosto = deSleeve.filter((l) => l.costoTotal != null);
      const costoTotal = conCosto.length === deSleeve.length
        ? conCosto.reduce((acc, l) => acc + l.costoTotal, 0)
        : null;
      const factor = factorPrecioPorClase(t.claseActivo);
      const valor = t.precioActual != null ? cantidad * t.precioActual * factor : (costoTotal ?? t.valorActualARS ?? 0);
      filas.push({
        ...t,
        sleeve,
        claveFila: `${t.clave}||${sleeve}`,
        cantidad,
        costoTotal,
        costoPromedio: cantidad > 0 && costoTotal != null ? costoTotal / cantidad : null,
        valorActual: valor,
        valorActualARS: valor,
        gananciaNoRealizada: costoTotal != null ? valor - costoTotal : null,
        retornoPct: costoTotal > 0 ? (valor - costoTotal) / costoTotal : null,
      });
    }
  }
  // Caja por estrategia (siempre las 3, aunque sea cero: son las proporciones).
  for (const s of Object.values(SLEEVES)) {
    const v = efectivoSleeves?.[s] ?? 0;
    filas.push({
      clave: `EFECTIVO_${s.toUpperCase()}`,
      claveFila: `EFECTIVO_${s.toUpperCase()}`,
      activo: `Pesos · ${s === SLEEVES.TRADING ? "Trading" : s === SLEEVES.LARGO ? "Largo plazo" : "Renta fija"}`,
      ticker: null,
      claseActivo: CLASES.EFECTIVO,
      sector: "Efectivo y equivalentes",
      divisa: "ARS",
      esCash: true,
      sleeve: s,
      cantidad: null,
      costoPromedio: null,
      costoTotal: v,
      precioActual: null,
      sinPrecio: false,
      usaPrecioManual: false,
      valorActual: v,
      valorActualARS: v,
      gananciaNoRealizada: 0,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct: 0,
      diasTenencia: null,
    });
  }
  const totalARS = filas.reduce((acc, t) => acc + (t.valorActualARS ?? 0), 0);
  for (const f of filas) f.pctCartera = totalARS > 0 && f.valorActualARS != null ? f.valorActualARS / totalARS : null;
  return { tenencias: filas.sort((a, b) => (b.valorActualARS ?? 0) - (a.valorActualARS ?? 0)), totalARS };
}
