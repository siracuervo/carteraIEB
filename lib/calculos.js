import {
  CLASES,
  claveActivo,
  clasificar,
  aplicarOverride,
  nombreLimpio,
  nombrePersonalizado,
  esCaucion,
  esDivisaEfectivo,
  esMovimiento,
  esTickerBonoSoberano,
  TICKER_POR_NOMBRE_SIN_TICKER,
} from "./clasificacion.js";
import { obtenerTipoCambioHistorico } from "./precios.js";
import { fechaLocal } from "./fechas.js";
import { aISO } from "./accesosRapidosFecha.js";

// "PARIDAD" es una compra/venta de bonos a la par (poco frecuente) — el export de
// IEB además la escribe con espacios inconsistentes ("VENTA  PARIDAD", doble
// espacio), así que además de sumarla acá, el operación se normaliza antes de
// compararla contra estas listas.
const OPS_COMPRA = ["COMPRA NORMAL", "COMPRA TRADING", "COMPRA PARIDAD"];
const OPS_VENTA = ["VENTA", "VENTA TRADING", "VENTA PARIDAD"];

/**
 * La fecha del export no trae hora, así que dos operaciones del mismo día (típico
 * en compra/venta trading intradiaria) quedan "empatadas" por fecha. El orden en
 * que aparecen en el archivo no garantiza que sea el orden real de ejecución — y si
 * una venta queda ordenada antes que la compra que la financió, el motor la cuenta
 * como "sin costo conocido" por error. El número de operación sí es correlativo al
 * momento real de ejecución, así que lo usamos como desempate.
 */
function compararCronologico(a, b) {
  const porFecha = (a.fecha || "").localeCompare(b.fecha || "");
  if (porFecha !== 0) return porFecha;
  const horaA = a.hora || "";
  const horaB = b.hora || "";
  if (horaA && horaB && horaA !== horaB) return horaA.localeCompare(horaB);
  return Number(a.nroOperacion ?? 0) - Number(b.nroOperacion ?? 0);
}

/**
 * No todas las transacciones tienen ticker: el export "histórico de tenencia" solo
 * trae el nombre completo del activo, y solo se le suma el ticker cuando esa misma
 * operación (por Nro. de operación) también aparece en "toda la actividad". Si un
 * activo tiene operaciones que nunca se cruzaron con ese otro archivo, quedarían sin
 * ticker y claveActivo() las agruparía aparte del resto de sus propias operaciones
 * (mismo activo, "duplicado" en la cartera). Antes de agrupar, propagamos el ticker
 * a todas las transacciones que comparten el mismo nombre de activo.
 *
 * Excepción: nombres de cuenta genéricos como "DOLARES USA ESP 7000" no identifican
 * una especie — son la cuenta compartida donde caen dividendos en dólares de
 * cualquier CEDEAR que los pague. Si una de esas filas trae ticker (porque la cruzó
 * con otro archivo), cruzarlo por nombre le pegaría ESE ticker a los dividendos de
 * TODAS las demás especies que también paguen en dólares — mejor dejarlas sin
 * ticker (se agrupan por nombre y se clasifican como Efectivo igual).
 */
/**
 * Diccionario nombre→ticker extra para `resolverTickers`: los exports de IEB que
 * no traen "Referencia" (el histórico de tenencia) nombran al activo por su nombre
 * largo; el Portafolio sí trae el ticker para ESE MISMO nombre, así que el historial
 * de Portafolios sirve para completar los tickers que faltan en los movimientos.
 */
export function semillasTickersDesdePortafolio(portafolioHistorial) {
  const mapa = new Map();
  for (const h of portafolioHistorial || []) {
    for (const t of h.tenencias || []) {
      if (t.ticker && t.nombre) mapa.set(t.nombre, t.ticker);
    }
  }
  return mapa;
}

export function resolverTickers(transacciones, semillasExtras = null) {
  const activoATicker = new Map(Object.entries(TICKER_POR_NOMBRE_SIN_TICKER));
  if (semillasExtras) {
    for (const [nombre, ticker] of semillasExtras) {
      if (ticker && !activoATicker.has(nombre)) activoATicker.set(nombre, ticker);
    }
  }
  for (const t of transacciones) {
    if (t.activo && t.ticker && !activoATicker.has(t.activo) && !esDivisaEfectivo(t.activo)) activoATicker.set(t.activo, t.ticker);
  }
  return transacciones.map((t) => {
    if (t.ticker || !t.activo || esDivisaEfectivo(t.activo)) return t;
    const ticker = activoATicker.get(t.activo);
    return ticker ? { ...t, ticker } : t;
  });
}

/** Igual que `resolverTickers`, pero además usa el historial de Portafolios como diccionario. */
export function resolverTickersConPortafolio(transacciones, portafolioHistorial) {
  return resolverTickers(transacciones, semillasTickersDesdePortafolio(portafolioHistorial));
}

/**
 * Historial de operaciones (compras, ventas, dividendos) de un solo activo, en orden
 * cronológico. Se excluyen créditos/gastos/notas de débito: aunque vengan atados a
 * este activo puntual, no son una operación en sí y son montos poco significativos.
 */
export function transaccionesDeActivo(transacciones, clave) {
  return resolverTickers(transacciones)
    .filter((t) => claveActivo(t) === clave && !esMovimiento(t.operacion))
    .sort(compararCronologico);
}

function agruparTransacciones(transaccionesOriginales) {
  const transacciones = resolverTickers(transaccionesOriginales);
  const grupos = new Map();
  for (const t of transacciones) {
    const clave = claveActivo(t);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(t);
  }
  return grupos;
}

function nombreMasDescriptivo(transacciones) {
  const nombres = transacciones.map((t) => t.activo).filter(Boolean);
  if (!nombres.length) return null;
  return nombres.reduce((a, b) => (b.length > a.length ? b : a));
}

function tickerDelGrupo(transacciones) {
  return transacciones.find((t) => t.ticker)?.ticker || null;
}

function divisaDelGrupo(transacciones) {
  return transacciones.find((t) => t.divisa)?.divisa || "ARS";
}

/**
 * Los bonos (y en general la renta fija argentina) cotizan "cada 100 de valor
 * nominal": si tenés 500 de nominal y el precio en pantalla es 143.663, no pagaste
 * 500 × 143.663 sino (500/100) × 143.663. Las acciones y CEDEARs cotizan por unidad.
 */
export function factorPrecioPorClase(claseActivo) {
  return claseActivo === CLASES.BONO_SOBERANO ? 0.01 : 1;
}

/**
 * Calcula tenencia neta y costo promedio de un instrumento a partir de su historial
 * de operaciones (orden cronológico), usando el método de costo promedio ponderado.
 */
function calcularPosicionInstrumento(transacciones, factorPrecio = 1, tipoCambioPorFecha = null) {
  const ordenadas = [...transacciones].sort(compararCronologico);
  let cantidad = 0;
  let costoTotal = 0;
  let gananciaRealizada = 0;
  let dividendosCobrados = 0;
  let costoVendidoAcumulado = 0;
  let importeVendidoAcumulado = 0;
  let cantidadVendidaAcumulada = 0;
  let cantidadSinCostoAcumulada = 0;
  let fechaPrimeraOperacion = null;
  let fechaUltimaOperacion = null;
  let fechaUltimaVenta = null;
  // Un evento por cada venta (parcial o total): permite mostrar y filtrar por fecha
  // el resultado realizado de cada operación puntual, en vez de solo el acumulado
  // de toda la vida del instrumento.
  const ventas = [];
  // Los bonos soberanos cotizan "cada 100 de nominal" (factorPrecio 0.01) — en ese
  // contexto específico, una operación "paridad" está pactada y liquidada en dólares
  // (son bonos en USD), y el precio es el % del valor técnico en esa moneda, no en
  // pesos. Para cualquier otro instrumento no asumimos esa convención: no la
  // validamos y un precio "paridad" ahí puede significar otra cosa.
  const esBonoConParidadEnUsd = factorPrecio === 0.01;

  /** Importe real en pesos de una operación, o null si no hay forma confiable de saberlo. */
  function montoEnARS(t, cantidadUsada, esParidad) {
    if (t.importeARS != null) return { monto: Math.abs(t.importeARS), estimado: false };
    if (!esParidad) {
      return t.precio != null ? { monto: t.precio * cantidadUsada * factorPrecio, estimado: false } : { monto: null, estimado: false };
    }
    if (!esBonoConParidadEnUsd || t.precio == null || !t.fecha) return { monto: null, estimado: false };
    const montoUSD = t.precio * cantidadUsada * factorPrecio;
    const tc = tipoCambioPorFecha?.get(t.fecha);
    if (tc == null) return { monto: null, estimado: false };
    return { monto: montoUSD * tc, estimado: true };
  }

  for (const t of ordenadas) {
    const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (t.fecha) {
      if (!fechaPrimeraOperacion) fechaPrimeraOperacion = t.fecha;
      fechaUltimaOperacion = t.fecha;
      if (OPS_VENTA.includes(op)) fechaUltimaVenta = t.fecha;
    }
    const esParidad = op.includes("PARIDAD");

    if (OPS_COMPRA.includes(op)) {
      const cant = Math.abs(t.cantidad ?? 0);
      const { monto: costo } = montoEnARS(t, cant, esParidad);
      // Si no hay forma confiable de saber cuánto costó, no la sumamos al pool de
      // costo promedio: mejor que una venta futura de esas unidades quede marcada
      // como "sin origen" a que inventemos un costo y desvirtuemos el promedio de
      // todo lo demás que tenés de este activo.
      if (costo != null) {
        cantidad += cant;
        costoTotal += costo;
      }
    } else if (OPS_VENTA.includes(op)) {
      // Si se vende más de lo que tenemos registrado como comprado (activos que ya
      // estaban en la cuenta antes del historial importado, o traspasados de otro
      // broker), igual contamos toda la cantidad operada — pero el costo/resultado
      // solo se puede calcular sobre la parte de la que sí conocemos el costo.
      const cantidadSolicitada = Math.abs(t.cantidad ?? 0);
      const cantConCosto = Math.min(cantidadSolicitada, cantidad);
      const cantSinCosto = cantidadSolicitada - cantConCosto;
      const costoPromedio = cantidad > 0 ? costoTotal / cantidad : 0;
      const { monto: ingresoTotal, estimado: ingresoEstimado } = montoEnARS(t, cantidadSolicitada, esParidad);

      let gananciaEvento = null;
      let costoVendidoEvento = 0;
      if (ingresoTotal != null) importeVendidoAcumulado += ingresoTotal;
      if (cantConCosto > 0) {
        costoVendidoEvento = costoPromedio * cantConCosto;
        costoVendidoAcumulado += costoVendidoEvento;
        // Si no sabemos qué recibiste a cambio (operación "paridad" sin importe real
        // informado ni tipo de cambio histórico disponible), igual descontamos la
        // cantidad y el costo del pool — pero no inventamos un resultado.
        if (ingresoTotal != null) {
          const ingresoConCosto = ingresoTotal * (cantConCosto / cantidadSolicitada);
          gananciaEvento = ingresoConCosto - costoVendidoEvento;
          gananciaRealizada += gananciaEvento;
        }
      }

      cantidadVendidaAcumulada += cantidadSolicitada;
      cantidadSinCostoAcumulada += cantSinCosto;
      costoTotal -= costoPromedio * cantConCosto;
      cantidad -= cantConCosto;
      if (cantidad < 1e-9) {
        cantidad = 0;
        costoTotal = 0;
      }

      ventas.push({
        fecha: t.fecha,
        nroOperacion: t.nroOperacion ?? null,
        cantidadOperada: cantidadSolicitada,
        cantidadSinCosto: cantSinCosto,
        costoTotal: costoVendidoEvento,
        estimadoTipoCambio: ingresoEstimado,
        importeVenta: ingresoTotal,
        gananciaRealizada: gananciaEvento,
        pnlDesconocido: cantConCosto > 0 && ingresoTotal == null,
        cantidadRestante: cantidad,
      });
    } else if (op === "DIVIDENDOS") {
      dividendosCobrados += Math.abs(t.importeARS ?? t.importeDivisas ?? 0);
    }
  }

  return {
    cantidad,
    costoTotal,
    gananciaRealizada,
    dividendosCobrados,
    costoVendidoAcumulado,
    importeVendidoAcumulado,
    cantidadSinCostoAcumulada,
    cantidadVendidaAcumulada,
    fechaPrimeraOperacion,
    fechaUltimaOperacion,
    fechaUltimaVenta,
    ventas,
  };
}

/** Para cauciones no hay "cantidad" de instrumento: usamos el neto de flujos de caja. */
function calcularMontoCauciones(transacciones) {
  const monto = -transacciones.reduce((acc, t) => acc + (t.importeARS ?? 0), 0);
  return Math.max(monto, 0);
}

/**
 * Pool de costos de una posición vigente: total en ARS, total en USD (cada compra
 * convertida con el CCL de su propio día) y cantidad. Las ventas consumen los lotes
 * más viejos (FIFO), así el pool final es solo de las compras que todavía se mantienen
 * — no un promedio de TODO el historial del ticker. Cada lote conserva su propio CCL
 * (el registrado a mano, o el histórico de su día), así el total ARS/USD del pool
 * refleja el dólar CCL de los activos que quedan en cartera.
 */
function poolCostos(txs, tipoCambioPorFecha) {
  const ordenadas = [...txs].sort(compararCronologico);
  const lotes = []; // cada lote: { cant, montoARS, montoUSD }
  let cantidad = 0;
  let costoTotalARS = 0;
  let costoTotalUSD = 0;

  for (const t of ordenadas) {
    const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (OPS_COMPRA.includes(op)) {
      const cant = Math.abs(t.cantidad ?? 0);
      // CCL de esa compra: el registrado a mano (si lo cargó el usuario) tiene
      // prioridad; para el resto se usa el tipo histórico del propio día.
      const ccl = t.cclManual ?? (t.fecha ? tipoCambioPorFecha?.get(t.fecha) : null);
      let montoARS = null;
      let montoUSD = null;
      if (t.importeARS != null) {
        montoARS = Math.abs(t.importeARS);
        if (ccl) montoUSD = montoARS / ccl;
      } else if (t.importeDivisas != null) {
        montoUSD = Math.abs(t.importeDivisas);
        if (ccl) montoARS = montoUSD * ccl;
      } else if (t.precio != null) {
        montoARS = t.precio * cant;
        if (ccl) montoUSD = montoARS / ccl;
      }
      // Se necesita el monto en ambas monedas para poder derivar el CCL efectivo
      // ponderado por monto (ARS total / USD total).
      if (montoARS != null && montoUSD != null) {
        lotes.push({ cant, montoARS, montoUSD });
        cantidad += cant;
        costoTotalARS += montoARS;
        costoTotalUSD += montoUSD;
      }
    } else if (OPS_VENTA.includes(op)) {
      let aVender = Math.abs(t.cantidad ?? 0);
      // Consumimos primero los lotes más viejos (FIFO): son esas compras las que
      // se fueron, no un promedio de todas.
      while (aVender > 1e-9 && lotes.length) {
        const lote = lotes[0];
        const tramo = Math.min(aVender, lote.cant);
        const fraccion = tramo / lote.cant;
        const restARS = lote.montoARS * fraccion;
        const restUSD = lote.montoUSD * fraccion;
        lote.cant -= tramo;
        lote.montoARS -= restARS;
        lote.montoUSD -= restUSD;
        cantidad -= tramo;
        costoTotalARS -= restARS;
        costoTotalUSD -= restUSD;
        aVender -= tramo;
        if (lote.cant < 1e-9) lotes.shift();
      }
      if (cantidad < 1e-9) {
        cantidad = 0;
        costoTotalARS = 0;
        costoTotalUSD = 0;
        lotes.length = 0;
      }
    }
  }

  return { cantidad, costoTotalARS, costoTotalUSD };
}

/**
 * CCL efectivo por clave, ponderado por el monto de cada compra y usando el dólar
 * CCL de cada día puntual (obtenerTipoCambioHistorico) en vez del actual. Permite
 * convertir el costo promedio ARS de las tenencias vigentes a USD con los tipos de
 * cambio de sus fechas reales de compra. Devuelve Map clave -> CCL efectivo.
 */
export async function calcularCCLHistoricoPorClave(transacciones) {
  const grupos = agruparTransacciones(transacciones);

  const fechasNecesarias = new Set();
  for (const txs of grupos.values()) {
    for (const t of txs) {
      const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (OPS_COMPRA.includes(op) && t.fecha && t.cclManual == null) fechasNecesarias.add(t.fecha);
    }
  }
  const tipoCambioPorFecha = new Map();
  await Promise.all(
    Array.from(fechasNecesarias).map(async (fecha) => {
      const tc = await obtenerTipoCambioHistorico(fecha);
      if (tc != null) tipoCambioPorFecha.set(fecha, tc);
    })
  );

  const porClave = new Map();
  for (const [clave, txs] of grupos) {
    const { cantidad, costoTotalARS, costoTotalUSD } = poolCostos(txs, tipoCambioPorFecha);
    if (cantidad > 0 && costoTotalARS > 0 && costoTotalUSD > 0) {
      porClave.set(clave, costoTotalARS / costoTotalUSD);
    }
  }
  return porClave;
}

function convertirAARS(valor, divisa, tipoCambioCCL) {
  if (valor == null) return null;
  if (divisa === "ARS" || !divisa) return valor;
  if (tipoCambioCCL == null) return null;
  return valor * tipoCambioCCL;
}

/**
 * Arma la lista de tenencias vigentes a partir de las transacciones importadas.
 * precios: Map ticker -> { precio, moneda } | null (de lib/precios.js)
 * overrides: clasificaciones manuales guardadas por el usuario
 */
export function calcularTenencias(transacciones, overrides, precios, tipoCambioCCL) {
  const grupos = agruparTransacciones(transacciones);
  const tenencias = [];

  for (const [clave, txs] of grupos) {
    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const divisa = divisaDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;

    const base = clasificar({ activo, ticker, operacion: operacionRepresentativa });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);

    if (claseActivo === CLASES.MOVIMIENTO) continue; // no es una tenencia

    const precioManual = overrides?.[clave]?.precioManual ?? null;

    if (esCaucion(activo, operacionRepresentativa)) {
      const valorActual = calcularMontoCauciones(txs);
      if (valorActual === 0) continue; // caución vencida y ya cobrada, no queda tenencia
      tenencias.push({
        clave,
        activo: nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides),
        ticker,
        claseActivo,
        sector,
        divisa: "ARS",
        esCash: true,
        cantidad: null,
        costoPromedio: null,
        costoTotal: valorActual,
        precioActual: null,
        sinPrecio: false,
        usaPrecioManual: false,
        valorActual,
        valorActualARS: valorActual,
        gananciaNoRealizada: 0,
        gananciaRealizada: 0,
        dividendosCobrados: 0,
        retornoPct: 0,
      });
      continue;
    }

    const factorPrecio = factorPrecioPorClase(claseActivo);
    const { cantidad, costoTotal, gananciaRealizada, dividendosCobrados } = calcularPosicionInstrumento(txs, factorPrecio);
    if (cantidad <= 0) continue; // posición cerrada, no queda tenencia

    const costoPromedio = costoTotal / cantidad;

    let precioActual = null;
    let sinPrecio = true;
    let usaPrecioManual = false;
    let variacionDiariaPct = null;
    const cotizacion = ticker ? precios?.get(ticker) : null;
    if (esDivisaEfectivo(activo)) {
      precioActual = tipoCambioCCL;
      sinPrecio = precioActual == null;
    } else if (cotizacion && (!cotizacion.moneda || cotizacion.moneda === divisa)) {
      // si la cotización trae una moneda distinta a la de la transacción (ej. cayó
      // al ticker de NYSE en USD en vez del CEDEAR en ARS), la descartamos: es
      // preferible mostrar "sin precio" a mezclar monedas silenciosamente.
      precioActual = cotizacion.precio;
      sinPrecio = false;
      variacionDiariaPct = cotizacion.variacionDiariaPct ?? null;
    } else if (precioManual != null) {
      precioActual = precioManual;
      sinPrecio = false;
      usaPrecioManual = true;
    }

    const valorActual = sinPrecio ? costoTotal : cantidad * precioActual * factorPrecio;
    const gananciaNoRealizada = sinPrecio ? null : valorActual - costoTotal;
    const retornoPct = costoTotal > 0 && valorActual != null ? (valorActual - costoTotal) / costoTotal : null;

    tenencias.push({
      clave,
      activo: nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides),
      ticker,
      claseActivo,
      sector,
      divisa,
      esCash: false,
      cantidad,
      costoPromedio,
      costoTotal,
      precioActual,
      sinPrecio,
      usaPrecioManual,
      variacionDiariaPct,
      valorActual,
      valorActualARS: convertirAARS(valorActual, divisa, tipoCambioCCL),
      gananciaNoRealizada,
      gananciaRealizada,
      dividendosCobrados,
      retornoPct,
    });
  }

  return tenencias.sort((a, b) => (b.valorActualARS ?? 0) - (a.valorActualARS ?? 0));
}

/**
 * Reconstruye qué tenías abierto en una fecha pasada puntual y a qué precio
 * histórico. Misma lógica de costo promedio que calcularTenencias, pero
 * "cortando" cada instrumento a las operaciones de esa fecha para atrás — así
 * una venta posterior a esa fecha no afecta la cantidad/costo reconstruidos.
 * No incluye efectivo ni cauciones: no hay forma confiable de reconstruir un
 * ledger de caja histórico (los movimientos no discriminan ingresos/retiros de
 * capital de la actividad de inversión).
 * precios: Map ticker -> { precio, moneda } | null, ya resuelto para esa fecha.
 */
export function calcularTenenciasAFecha(transacciones, overrides, fechaISO, precios, tipoCambioCCL) {
  const grupos = agruparTransacciones(transacciones);
  const tenencias = [];

  for (const [clave, txsCompletos] of grupos) {
    const txs = txsCompletos.filter((t) => t.fecha && t.fecha <= fechaISO);
    if (!txs.length) continue; // todavía no existía a esa fecha

    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const divisa = divisaDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;

    const base = clasificar({ activo, ticker, operacion: operacionRepresentativa });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);

    if (claseActivo === CLASES.MOVIMIENTO || claseActivo === CLASES.EFECTIVO || esCaucion(activo, operacionRepresentativa)) continue;

    const factorPrecio = factorPrecioPorClase(claseActivo);
    const { cantidad, costoTotal, dividendosCobrados } = calcularPosicionInstrumento(txs, factorPrecio);
    if (cantidad <= 0) continue; // ya estaba cerrada a esa fecha

    const costoPromedio = costoTotal / cantidad;

    let precioActual = null;
    let sinPrecio = true;
    const cotizacion = ticker ? precios?.get(ticker) : null;
    if (cotizacion && (!cotizacion.moneda || cotizacion.moneda === divisa)) {
      // mismo criterio que calcularTenencias: si la cotización trae otra moneda
      // (ej. cayó al ticker de NYSE en vez del CEDEAR en ARS), se descarta antes
      // que mezclar monedas silenciosamente.
      precioActual = cotizacion.precio;
      sinPrecio = false;
    }

    const valorActual = sinPrecio ? costoTotal : cantidad * precioActual * factorPrecio;
    const gananciaNoRealizada = sinPrecio ? null : valorActual - costoTotal;
    const retornoPct = costoTotal > 0 && valorActual != null ? (valorActual - costoTotal) / costoTotal : null;

    tenencias.push({
      clave,
      activo: nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides),
      ticker,
      claseActivo,
      sector,
      divisa,
      esCash: false,
      cantidad,
      costoPromedio,
      costoTotal,
      precioActual,
      sinPrecio,
      usaPrecioManual: false,
      valorActual,
      valorActualARS: convertirAARS(valorActual, divisa, tipoCambioCCL),
      gananciaNoRealizada,
      gananciaRealizada: 0,
      dividendosCobrados,
      retornoPct,
    });
  }

  return tenencias.sort((a, b) => (b.valorActualARS ?? 0) - (a.valorActualARS ?? 0));
}

/**
 * Una fila por cada venta (parcial o total) de cualquier activo que alguna vez
 * operaste, tenga o no todavía posición abierta — a diferencia de una posición
 * "cerrada" (cantidad final = 0), una venta parcial de un activo que seguís
 * teniendo en cartera también es un resultado ya realizado y debe contar. Cada
 * fila usa el costo promedio vigente en el momento de esa venta puntual, así que
 * filtrar por fecha filtra el resultado real de ese rango, no el acumulado de
 * toda la vida del activo.
 */
export async function calcularVentasRealizadas(transacciones, overrides) {
  const grupos = agruparTransacciones(transacciones);

  // Operaciones "paridad" de bonos soberanos sin importe real informado por IEB:
  // necesitamos el dólar MEP/CCL histórico de esos días puntuales para poder
  // pesificarlas (ver montoEnARS en calcularPosicionInstrumento).
  const fechasNecesarias = new Set();
  for (const t of transacciones) {
    if (t.importeARS != null || !t.fecha) continue;
    const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (!op.includes("PARIDAD") || !esTickerBonoSoberano(t.ticker)) continue;
    fechasNecesarias.add(t.fecha);
  }
  const tipoCambioPorFecha = new Map();
  await Promise.all(
    Array.from(fechasNecesarias).map(async (fecha) => {
      const tc = await obtenerTipoCambioHistorico(fecha);
      if (tc != null) tipoCambioPorFecha.set(fecha, tc);
    })
  );

  const filas = [];

  for (const [clave, txs] of grupos) {
    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const divisa = divisaDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;

    const base = clasificar({ activo, ticker, operacion: operacionRepresentativa });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);
    if (claseActivo === CLASES.MOVIMIENTO || esCaucion(activo, operacionRepresentativa)) continue;

    const { cantidad, ventas } = calcularPosicionInstrumento(txs, factorPrecioPorClase(claseActivo), tipoCambioPorFecha);
    if (!ventas.length) continue;

    const posicionAbiertaActualmente = cantidad > 0;
    const nombreMostrado = nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides);

    ventas.forEach((v, i) => {
      filas.push({
        id: `${clave}__${v.nroOperacion ?? `${v.fecha}-${i}`}`,
        clave,
        activo: nombreMostrado,
        ticker,
        claseActivo,
        sector,
        divisa,
        cantidadOperada: v.cantidadOperada,
        cantidadSinCosto: v.cantidadSinCosto,
        costoTotal: v.costoTotal,
        importeVenta: v.importeVenta,
        gananciaRealizada: v.gananciaRealizada,
        retornoPct: v.costoTotal > 0 && v.gananciaRealizada != null ? v.gananciaRealizada / v.costoTotal : null,
        pnlDesconocido: v.pnlDesconocido,
        estimadoTipoCambio: v.estimadoTipoCambio,
        fecha: v.fecha,
        nroOperacion: v.nroOperacion,
        posicionAbiertaActualmente,
      });
    });
  }

  return filas.sort((a, b) => compararCronologico(b, a));
}

/**
 * "Resultados del día": todas las operaciones (compras y ventas) de una fecha,
 * aunque la posición no esté cerrada. Por activo, simula el historial completo en
 * orden FIFO (las ventas consumen primero las compras más viejas) para saber
 * cuántas unidades de cada compra del día siguen abiertas:
 *   - COMPRA: resultado no realizado = (precioActual − precioOp) × pendiente × factor.
 *   - VENTA:  resultado realizado = importe de la venta − costo FIFO consumido.
 * El resultado de las compras abiertas se marca a mercado con `precios` (Map
 * ticker → { precio, ... }), igual que el resto del dashboard. Es un cálculo aparte
 * del costo promedio ponderado del resto de la app: acá importa la atribución
 * por-operación, y FIFO se entiende mejor para eso.
 */
export async function calcularResultadosDelDia(transaccionesResueltas, diaISO, precios, overrides) {
  const grupos = agruparTransacciones(transaccionesResueltas);
  const trades = [];
  let totalRealizado = 0;
  let totalNoRealizado = 0;
  let montoOperado = 0;
  let conPnlParcial = false;

  for (const [clave, txs] of grupos) {
    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const divisa = divisaDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;

    const base = clasificar({ activo, ticker, operacion: operacionRepresentativa });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);
    if (claseActivo === CLASES.MOVIMIENTO || esCaucion(activo, operacionRepresentativa)) continue;

    const factorPrecio = factorPrecioPorClase(claseActivo);
    const esBonoParidadUsd = factorPrecio === 0.01;

    // Tipo de cambio histórico solo para operaciones "paridad" de bonos sin importe
    // informado (misma lógica que en calcularPosicionInstrumento).
    const tipoCambioPorFecha = new Map();
    for (const t of txs) {
      const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
      if (t.importeARS != null || !t.fecha || !op.includes("PARIDAD") || !esTickerBonoSoberano(ticker)) continue;
      if (!tipoCambioPorFecha.has(t.fecha)) {
        const tc = await obtenerTipoCambioHistorico(t.fecha);
        tipoCambioPorFecha.set(t.fecha, tc);
      }
    }

    function importeOperacion(t, cantidadUsada, esParidad) {
      if (t.importeARS != null) return { monto: Math.abs(t.importeARS), estimado: false };
      if (!esParidad) {
        return t.precio != null ? { monto: t.precio * cantidadUsada * factorPrecio, estimado: false } : { monto: null, estimado: false };
      }
      if (!esBonoParidadUsd || t.precio == null || !t.fecha) return { monto: null, estimado: false };
      const tc = tipoCambioPorFecha.get(t.fecha);
      if (tc == null) return { monto: null, estimado: false };
      return { monto: t.precio * cantidadUsada * factorPrecio * tc, estimado: true };
    }

    const filaBase = {
      clave,
      activo: nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides),
      ticker,
      claseActivo,
      sector,
      divisa: divisa || "ARS",
    };

    const ordenadas = [...txs].sort(compararCronologico);
    // Cola FIFO de compras. Las compras del día guardan el mismo objeto (referencia)
    // en `comprasDia`, así al final leemos `cantidadRestante` como "cuánto sigue abierto".
    const cola = [];
    const comprasDia = new Map();

    for (const t of ordenadas) {
      const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
      const esHoy = t.fecha === diaISO;
      const esParidad = op.includes("PARIDAD");
      const cant = Math.abs(t.cantidad ?? 0);
      if (cant === 0) continue;

      if (OPS_COMPRA.includes(op)) {
        const costo = importeOperacion(t, cant, esParidad);
        const nro = t.nroOperacion ?? `c-${t.fecha}-${t.precio}-${cant}`;
        const lote = {
          nro,
          fecha: t.fecha,
          precio: t.precio,
          cantidad: cant,
          cantidadRestante: cant,
          costoUnitario: costo.monto != null && cant > 0 ? costo.monto / cant : null,
        };
        cola.push(lote);
        if (esHoy) {
          comprasDia.set(nro, lote);
          trades.push({
            id: `${clave}__${nro}`,
            ...filaBase,
            tipo: "compra",
            operacion: "Compra",
            fecha: t.fecha,
            nroOperacion: t.nroOperacion ?? null,
            cantidad: cant,
            precio: t.precio,
            importe: costo.monto,
            factorPrecio,
          });
        }
      } else if (OPS_VENTA.includes(op)) {
        const ingreso = importeOperacion(t, cant, esParidad);
        let porConsumir = cant;
        let costoConsumido = 0;
        let cantConCosto = 0;
        let sinCosto = 0;
        const origenes = [];
        while (porConsumir > 1e-9 && cola.length) {
          const lote = cola[0];
          const usar = Math.min(lote.cantidadRestante, porConsumir);
          if (lote.costoUnitario != null) {
            costoConsumido += lote.costoUnitario * usar;
            cantConCosto += usar;
          } else sinCosto += usar;
          // Registramos qué compra original (día y precio) dio origen a estas
          // unidades, para poder mostrarlo cuando la venta no se financió con una
          // compra del mismo día.
          if (lote.precio != null) origenes.push({ fecha: lote.fecha, precio: lote.precio, cantidad: usar });
          lote.cantidadRestante -= usar;
          porConsumir -= usar;
          if (lote.cantidadRestante < 1e-9) cola.shift();
        }
        const sinCostoFinal = porConsumir + sinCosto;
        const ganancia = ingreso.monto != null && costoConsumido > 0 ? ingreso.monto - costoConsumido : null;
        if (esHoy) {
          trades.push({
            id: `${clave}__${t.nroOperacion ?? `v-${t.fecha}-${t.precio}-${cant}`}`,
            ...filaBase,
            tipo: "venta",
            operacion: "Venta",
            fecha: t.fecha,
            nroOperacion: t.nroOperacion ?? null,
            cantidad: cant,
            precio: t.precio,
            importe: ingreso.monto,
            gananciaRealizada: ganancia,
            // Precio (costo) al que se compró lo que se está vendiendo: el FIFO de
            // la tenencia previa cuando no se compró hoy, o el de las compras de
            // hoy que se consumieron. Puede ser un mix de ambos.
            precioCompra: cantConCosto > 0 ? costoConsumido / cantConCosto : null,
            // Las compras originales (fecha + precio) que dieron origen a estas
            // unidades — solo las de días anteriores al día en cuestión, porque las
            // del propio día ya se muestran en el grupo.
            origenes: origenes.filter((o) => o.fecha !== diaISO),
            pnlDesconocido: sinCostoFinal > 1e-9,
          });
        }
      }
    }

    for (const lote of comprasDia.values()) {
      const fila = trades.find((tr) => tr.id === `${clave}__${lote.nro}`);
      if (!fila) continue;
      const pendiente = Math.max(0, lote.cantidadRestante);
      const precioVivo = ticker ? precios?.get(ticker)?.precio ?? null : null;
      fila.cantidadPendiente = pendiente;
      fila.precioActual = precioVivo;
      fila.sinPrecio = pendiente > 1e-9 && precioVivo == null;
      if (pendiente < 1e-9) {
        fila.estado = "cerrada";
        fila.resultado = 0;
      } else if (precioVivo != null && lote.precio != null) {
        fila.estado = "abierta";
        fila.resultado = (precioVivo - lote.precio) * pendiente * factorPrecio;
      } else {
        fila.estado = "abierta";
        fila.resultado = null;
      }
    }
  }

  for (const t of trades) {
    if (t.importe != null) montoOperado += Math.abs(t.importe);
    if (t.tipo === "venta") {
      if (t.gananciaRealizada != null) totalRealizado += t.gananciaRealizada;
      else if (t.pnlDesconocido) conPnlParcial = true;
    } else if (t.resultado != null) {
      totalNoRealizado += t.resultado;
    }
  }

  return {
    dia: diaISO,
    hayOperaciones: trades.length > 0,
    trades,
    totals: {
      realizado: totalRealizado,
      noRealizado: totalNoRealizado,
      total: totalRealizado + totalNoRealizado,
      montoOperado,
      conPnlParcial,
    },
  };
}

/**
 * El retorno se calcula contra el costo de compra (PPC/PPP) de cada posición, no
 * contra el valor total de la cartera: el efectivo disponible no tiene "costo de
 * compra", y a veces IEB no informa el PPP de un activo (queda "-" en el archivo de
 * Portafolio) — en esos casos no inventamos un costo $0, los dejamos afuera del
 * cálculo de retorno y los mostramos aparte para que no se pierdan del total.
 */
export function calcularResumen(tenencias) {
  let valorTotalARS = 0;
  let invertidoTotalARS = 0;
  let valorConCostoARS = 0;
  let efectivoARS = 0;
  let dividendosTotalARS = 0;
  let conversionIncompleta = false;

  for (const t of tenencias) {
    if (t.valorActualARS == null) {
      conversionIncompleta = true;
      continue;
    }
    valorTotalARS += t.valorActualARS;
    dividendosTotalARS += t.divisa === "ARS" ? t.dividendosCobrados : 0;

    if (t.esCash) {
      efectivoARS += t.valorActualARS;
      continue;
    }
    const costoARS = convertirAARSInterno(t);
    if (costoARS == null) continue; // sin costo informado por IEB: no participa de Invertido/Resultado/Retorno

    invertidoTotalARS += costoARS;
    valorConCostoARS += t.valorActualARS;
  }

  const gananciaTotalARS = valorConCostoARS - invertidoTotalARS;
  const retornoTotalPct = invertidoTotalARS > 0 ? gananciaTotalARS / invertidoTotalARS : null;

  return {
    valorTotalARS,
    invertidoTotalARS,
    gananciaTotalARS,
    retornoTotalPct,
    dividendosTotalARS,
    conversionIncompleta,
    efectivoARS,
  };
}

function convertirAARSInterno(t) {
  if (t.costoTotal == null) return null;
  if (t.divisa === "ARS" || !t.divisa) return t.costoTotal;
  if (t.valorActualARS == null || t.valorActual === 0) return 0;
  const tasaImplicita = t.valorActualARS / t.valorActual;
  return t.costoTotal * tasaImplicita;
}

export function calcularDistribucion(tenencias, campo) {
  const totales = new Map();
  let totalGeneral = 0;

  for (const t of tenencias) {
    if (t.valorActualARS == null) continue;
    const etiqueta = t[campo] || "Sin clasificar";
    totales.set(etiqueta, (totales.get(etiqueta) || 0) + t.valorActualARS);
    totalGeneral += t.valorActualARS;
  }

  return Array.from(totales.entries())
    .map(([etiqueta, valorARS]) => ({
      etiqueta,
      valorARS,
      pct: totalGeneral > 0 ? valorARS / totalGeneral : 0,
    }))
    .sort((a, b) => b.valorARS - a.valorARS);
}

function efectivoATenencia(moneda, monto, valorActualARS) {
  return {
    clave: `EFECTIVO_${moneda}`,
    activo: `Efectivo disponible (${moneda})`,
    ticker: null,
    claseActivo: CLASES.EFECTIVO,
    sector: "Efectivo y equivalentes",
    divisa: moneda,
    esCash: true,
    // Para ARS, "cantidad" sería lo mismo que el valor — no aporta nada. Para USD
    // sí es útil (cuántos dólares) junto con el tipo de cambio implícito usado.
    cantidad: moneda === "ARS" ? null : monto,
    costoPromedio: null,
    costoTotal: valorActualARS,
    precioActual: moneda !== "ARS" && valorActualARS != null && monto ? valorActualARS / monto : null,
    sinPrecio: valorActualARS == null,
    usaPrecioManual: false,
    valorActual: valorActualARS ?? monto,
    valorActualARS,
    gananciaNoRealizada: 0,
    gananciaRealizada: 0,
    dividendosCobrados: 0,
    retornoPct: 0,
  };
}

/**
 * Arma la lista de tenencias a partir de un import de "Portafolio": ahí IEB ya
 * calculó cantidad, precio, PPP (costo promedio) y resultado, así que no hay nada
 * que reconstruir — solo clasificar cada activo y darle la forma que usa la UI.
 * "Posición total" y "Resultado" en ese archivo ya vienen expresados en ARS, sea
 * cual sea la moneda de emisión del instrumento.
 */
export function construirTenenciasDesdePortafolio(portafolio, overrides) {
  const tenencias = [];

  for (const h of portafolio.tenencias) {
    const clave = h.ticker || h.nombre;
    const base = clasificar({ activo: h.nombre, ticker: h.ticker, operacion: null, seccion: h.seccion });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);

    const valorActualARS = h.posicionTotal;

    // IEB tarda ~1 día en calcular el PPP de una posición recién comprada o
    // transferida — mientras tanto viene null (y el resultado también). Si el
    // usuario ya cargó un PPP a mano para ese hueco, se usa acá para no dejar la
    // posición sin costo mientras se espera al import donde IEB ya lo tenga.
    const pppPendienteIEB = h.ppp == null;
    const pppManual = pppPendienteIEB ? overrides?.[clave]?.pppManual ?? null : null;
    const costoPromedio = h.ppp ?? pppManual;
    const costoManual = pppPendienteIEB && pppManual != null;

    let gananciaNoRealizada = h.resultado;
    let costoTotal = valorActualARS != null && gananciaNoRealizada != null ? valorActualARS - gananciaNoRealizada : null;
    if (costoManual && valorActualARS != null && h.cantidad != null) {
      costoTotal = pppManual * h.cantidad;
      gananciaNoRealizada = valorActualARS - costoTotal;
    }

    const retornoPct =
      costoTotal > 0 && gananciaNoRealizada != null
        ? gananciaNoRealizada / costoTotal
        : h.varPct != null
          ? h.varPct / 100
          : null;

    tenencias.push({
      clave,
      activo: nombrePersonalizado(clave, nombreLimpio(h.ticker, h.nombre) || clave, overrides),
      ticker: h.ticker,
      claseActivo,
      sector,
      divisa: h.moneda,
      esCash: false,
      cantidad: h.cantidad,
      costoPromedio,
      costoTotal,
      costoManual,
      pppPendienteIEB,
      precioActual: h.precio,
      sinPrecio: h.precio == null,
      usaPrecioManual: false,
      valorActual: valorActualARS,
      valorActualARS,
      gananciaNoRealizada,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct,
    });
  }

  // El efectivo en pesos ya está en ARS. El efectivo en dólares lo convertimos con
  // la cotización que el propio archivo usó para la tenencia de DOLARUSA (si la hay);
  // si no aparece, lo mostramos igual pero sin sumarlo al total en ARS.
  const tenenciaDolares = tenencias.find((t) => t.ticker === "DOLARUSA");
  const tipoCambioDelArchivo = tenenciaDolares?.precioActual ?? null;

  if (portafolio.efectivo?.ARS > 0) {
    tenencias.push(efectivoATenencia("ARS", portafolio.efectivo.ARS, portafolio.efectivo.ARS));
  }
  if (portafolio.efectivo?.USD > 0) {
    const valorARS = tipoCambioDelArchivo != null ? portafolio.efectivo.USD * tipoCambioDelArchivo : null;
    tenencias.push(efectivoATenencia("USD", portafolio.efectivo.USD, valorARS));
  }

  // Una vez pesificado, da lo mismo de qué "especie" venga cada peso (ARS
  // disponible, dólar MEP en efectivo, o DOLARUSA convertido al CCL) — se agrupan
  // en una sola fila, con el detalle de cada parte, en vez de una por especie.
  const efectivos = tenencias.filter((t) => t.claseActivo === CLASES.EFECTIVO);
  const resto = tenencias.filter((t) => t.claseActivo !== CLASES.EFECTIVO);
  const resultado = [...resto];

  if (efectivos.length) {
    const valorActualARS = efectivos.reduce((acc, t) => acc + (t.valorActualARS ?? 0), 0);
    const detalleEfectivo = efectivos
      .filter((t) => t.valorActualARS != null && t.valorActualARS > 0)
      .map((t) => ({
        etiqueta: t.activo,
        clave: t.clave,
        cantidad: t.cantidad,
        divisa: t.divisa,
        precioActual: t.precioActual,
        valorARS: t.valorActualARS,
      }))
      .sort((a, b) => b.valorARS - a.valorARS);

    resultado.push({
      clave: "EFECTIVO_TOTAL",
      activo: "Efectivo",
      ticker: null,
      claseActivo: CLASES.EFECTIVO,
      sector: "Efectivo y equivalentes",
      divisa: "ARS",
      esCash: true,
      cantidad: null,
      costoPromedio: null,
      costoTotal: valorActualARS,
      precioActual: null,
      sinPrecio: false,
      usaPrecioManual: false,
      valorActual: valorActualARS,
      valorActualARS,
      gananciaNoRealizada: 0,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct: 0,
      detalleEfectivo,
    });
  }

  return resultado.sort((a, b) => (b.valorActualARS ?? 0) - (a.valorActualARS ?? 0));
}

/**
 * Refresca el precio (y valor/resultado/retorno derivados) de las tenencias
 * armadas desde el Portfolio con una cotización en vivo — la cantidad y el costo
 * promedio siguen viniendo de IEB (incluyen comisiones, es la fuente más
 * confiable), pero el precio del Portfolio queda congelado a la fecha del
 * último import. Si no hay cotización en vivo para un ticker, o viene en una
 * moneda distinta a la del instrumento (mismo criterio de seguridad que en
 * calcularTenencias: mejor no actualizar que mezclar monedas), se deja el
 * precio del Portfolio sin tocar.
 */
export function actualizarConPreciosVivos(tenencias, precios) {
  return tenencias.map((t) => {
    if (t.esCash || !t.ticker) return t;
    const cotizacion = precios?.get(t.ticker);
    if (!cotizacion || (cotizacion.moneda && cotizacion.moneda !== t.divisa)) return t;

    const factorPrecio = factorPrecioPorClase(t.claseActivo);
    const valorActual = t.cantidad * cotizacion.precio * factorPrecio;
    const gananciaNoRealizada = t.costoTotal != null ? valorActual - t.costoTotal : t.gananciaNoRealizada;
    const retornoPct = t.costoTotal > 0 ? gananciaNoRealizada / t.costoTotal : t.retornoPct;

    return {
      ...t,
      precioActual: cotizacion.precio,
      sinPrecio: false,
      precioEnVivo: true,
      variacionDiariaPct: cotizacion.variacionDiariaPct ?? null,
      valorActual,
      valorActualARS: valorActual,
      gananciaNoRealizada,
      retornoPct,
    };
  });
}

/** Lunes (fecha ISO) de la semana calendario a la que pertenece fechaISO. */
function lunesDeSemana(fechaISO) {
  const d = fechaLocal(fechaISO);
  const diaSemana = d.getDay();
  const diffALunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diffALunes);
  return aISO(d);
}

function variacion(desde, hasta) {
  const diffARS = hasta.valorTotalARS - desde.valorTotalARS;
  return {
    desdeFecha: desde.fecha,
    hastaFecha: hasta.fecha,
    desdeValorARS: desde.valorTotalARS,
    hastaValorARS: hasta.valorTotalARS,
    diffARS,
    diffPct: desde.valorTotalARS > 0 ? diffARS / desde.valorTotalARS : null,
    // Si el punto de llegada es el snapshot "de hoy" armado en memoria (todavía no
    // se importó el Portfolio del día), esto lleva la fecha real de las posiciones
    // usadas — la UI lo muestra como "cartera basada en las posiciones de esa fecha".
    basadoEnFecha: hasta.basadoEnFecha ?? null,
  };
}

/**
 * Evolución del patrimonio total entre los Portfolios importados. `snapshots` viene
 * de `portafolioHistorial` (un import ya pisa cualquier otro de la misma fecha, así
 * que acá siempre hay como máximo un valor por día). "Diaria" compara los últimos dos
 * snapshots disponibles (no necesariamente días de calendario consecutivos, por
 * fines de semana/feriados sin import).
 *
 * "Semanal" es el acumulado de la semana calendario en curso: la base tiene que ser
 * el ÚLTIMO CIERRE DE LA SEMANA ANTERIOR (viernes), no el cierre del lunes de esta
 * semana — si se usara el cierre del lunes como base quedaría afuera el propio
 * movimiento del lunes (viernes→lunes), que sí es parte de "lo que pasó esta
 * semana". Para que el rango se siga leyendo como "lunes → hoy" (más claro que
 * mostrar la fecha del viernes anterior), se muestra el lunes como fecha de inicio
 * aunque el valor de comparación sea el del viernes. Si todavía no hay ningún
 * snapshot de una semana anterior, no hay semanal para mostrar.
 */
export function calcularEvolucionPatrimonio(snapshots) {
  if (!snapshots?.length) return null;
  const ordenados = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ultimo = ordenados[ordenados.length - 1];

  const diaria = ordenados.length >= 2 ? variacion(ordenados[ordenados.length - 2], ultimo) : null;

  const lunes = lunesDeSemana(ultimo.fecha);
  const semanaAnterior = ordenados.filter((s) => s.fecha < lunes);
  const cierreSemanaAnterior = semanaAnterior[semanaAnterior.length - 1] || null;
  const semanal = cierreSemanaAnterior ? { ...variacion(cierreSemanaAnterior, ultimo), desdeFecha: lunes } : null;

  return { ultimo, diaria, semanal, snapshots: ordenados };
}

const LETRAS_DIAS_HABILES = ["L", "M", "M", "J", "V"];

/**
 * Arma una semana completa (días hábiles L–V) para el selector de "Evolución de la
 * cartera". Cada día se compara contra el snapshot inmediatamente anterior disponible
 * (no necesariamente el día de calendario previo, por fines de semana/feriados) — igual
 * criterio que la diaria general. Si un día no tiene Portfolio importado (todavía no
 * llegó, o es un feriado), o es el primer snapshot que existe en todo el historial (no
 * hay contra qué compararlo), queda `disponible: false`.
 *
 * `semanal` replica el criterio de `calcularEvolucionPatrimonio`: compara el último
 * snapshot de esta semana contra el último de la semana anterior (aunque el rango se
 * muestre como "lunes → viernes").
 */
function construirSemana(ordenados, inicioISO) {
  const lunes = fechaLocal(inicioISO);
  const dias = LETRAS_DIAS_HABILES.map((letra, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    const fecha = aISO(d);
    const idx = ordenados.findIndex((s) => s.fecha === fecha);
    if (idx <= 0) return { letra, fecha, disponible: false, variacion: null };
    return { letra, fecha, disponible: true, variacion: variacion(ordenados[idx - 1], ordenados[idx]) };
  });

  const snapsDeLaSemana = ordenados.filter((s) => lunesDeSemana(s.fecha) === inicioISO);
  const ultimo = snapsDeLaSemana[snapsDeLaSemana.length - 1] || null;
  const anterior = ordenados.filter((s) => s.fecha < inicioISO);
  const cierreSemanaAnterior = anterior[anterior.length - 1] || null;
  const semanal =
    ultimo && cierreSemanaAnterior ? { ...variacion(cierreSemanaAnterior, ultimo), desdeFecha: inicioISO } : null;

  return { inicioISO, dias, semanal };
}

/**
 * Todos los snapshots agrupados en semanas calendario (de más vieja a más nueva),
 * para poder navegar el visor semanal de "Evolución de la cartera" hacia atrás.
 * Solo se incluyen semanas que tienen al menos un Portfolio importado — no hay
 * semanas vacías intermedias.
 */
export function calcularSemanas(snapshots) {
  if (!snapshots?.length) return [];
  const ordenados = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const semanasConDatos = new Set(ordenados.map((s) => lunesDeSemana(s.fecha)));
  return [...semanasConDatos]
    .sort()
    .map((inicioISO) => construirSemana(ordenados, inicioISO));
}

/**
 * Variación diaria de cada día hábil (lunes a viernes) de la semana calendario del
 * último snapshot, para el selector de días de "Evolución de la cartera". Es la
 * última semana de `calcularSemanas` (el criterio de cada día está en `construirSemana`).
 */
export function calcularEvolucionSemana(snapshots) {
  const semanas = calcularSemanas(snapshots);
  const ultima = semanas[semanas.length - 1];
  return ultima ? ultima.dias : [];
}

/**
 * Serie de los últimos `dias` días HÁBILES (lunes a viernes — sábado y domingo se
 * saltean directamente, ni como hueco) para el gráfico de evolución de la cartera.
 * Un día hábil sin snapshot importado se resuelve distinto según de qué lado del
 * primer dato conocido caiga: ANTES del primer snapshot va en 0 a propósito
 * (todavía no existía registro — sirve como señal visual de cuánto falta completar
 * subiendo Portfolios viejos); DENTRO del rango que ya tenemos pero sin dato puntual
 * (feriado, un día que no se importó) va en `null`, para que el gráfico lo salte con
 * una línea continua en vez de mostrar una caída falsa a cero.
 */
export function calcularSerieEvolucion(snapshots, dias = 30) {
  if (!snapshots?.length) return [];
  const ordenados = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porFecha = new Map(ordenados.map((s) => [s.fecha, s.valorTotalARS]));
  const primeraFecha = ordenados[0].fecha;

  const hoy = new Date();
  const cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const serie = [];
  while (serie.length < dias) {
    const diaSemana = cursor.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      const fecha = aISO(cursor);
      let valorTotalARS;
      if (porFecha.has(fecha)) valorTotalARS = porFecha.get(fecha);
      else if (fecha < primeraFecha) valorTotalARS = 0;
      else valorTotalARS = null;
      serie.push({ fecha, valorTotalARS });
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return serie.reverse();
}

/**
 * Activos que subieron de cantidad en el último Portfolio importado respecto al
 * anterior — tanto posiciones totalmente nuevas (tipo "nueva") como aumentos sobre
 * algo que ya tenías (tipo "aumento", con `cantidadAgregada` = cuánto sumaste). Una
 * cantidad menor (venta parcial) o igual no cuenta como movimiento acá — esto es
 * específicamente "qué compraste", no cualquier cambio. Los dos imports
 * comparados no son necesariamente "ayer y hoy" en sentido estricto si el último
 * import no es de hoy; se usan los dos más recientes que haya. Devuelve las
 * tenencias ya vivas (precio/variación en vivo) que correspondan, para no tener
 * que recalcular nada de nuevo acá.
 */
export function calcularNuevasEnCartera(portafolioHistorial, tenencias) {
  if (!portafolioHistorial || portafolioHistorial.length < 2) {
    return { movimientos: [], fechaAnterior: null, fechaUltimo: portafolioHistorial?.[0]?.fecha ?? null };
  }
  const ultimo = portafolioHistorial[portafolioHistorial.length - 1];
  const anterior = portafolioHistorial[portafolioHistorial.length - 2];
  const cantidadAnteriorPorTicker = new Map(
    anterior.tenencias.filter((h) => h.ticker).map((h) => [h.ticker, h.cantidad ?? 0])
  );

  const cambiosPorTicker = new Map();
  for (const h of ultimo.tenencias) {
    if (!h.ticker) continue;
    const cantidadAntes = cantidadAnteriorPorTicker.get(h.ticker);
    const cantidadAhora = h.cantidad ?? 0;
    if (cantidadAntes === undefined) {
      cambiosPorTicker.set(h.ticker, { tipo: "nueva", cantidadAgregada: cantidadAhora, pctAgregado: null });
    } else if (cantidadAhora > cantidadAntes) {
      const cantidadAgregada = cantidadAhora - cantidadAntes;
      cambiosPorTicker.set(h.ticker, {
        tipo: "aumento",
        cantidadAgregada,
        pctAgregado: cantidadAntes > 0 ? cantidadAgregada / cantidadAntes : null,
      });
    }
  }

  const movimientos = tenencias
    .filter((t) => t.ticker && cambiosPorTicker.has(t.ticker))
    .map((t) => ({ ...t, ...cambiosPorTicker.get(t.ticker) }));

  return { movimientos, fechaAnterior: anterior.fecha, fechaUltimo: ultimo.fecha };
}
