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
  INFO_POR_TICKER,
} from "./clasificacion.js";
import { obtenerTipoCambioHistorico } from "./precios.js";
import { fechaLocal, hoyArgentina } from "./fechas.js";
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
  // Sin hora van al cierre del día (después de las que sí tienen hora): asumir
  // 00:00 ponía, por ejemplo, una venta sin hora antes de una compra de las 11:46
  // del mismo día. El nro de operación desempatas al final (los no numéricos como
  // "manual-…" o "dup-…" empatan y conservan el orden del archivo: NaN rompería
  // la estabilidad del sort).
  const horaA = a.hora || "24:00";
  const horaB = b.hora || "24:00";
  if (horaA !== horaB) return horaA.localeCompare(horaB);
  const nroA = Number(a.nroOperacion ?? 0);
  const nroB = Number(b.nroOperacion ?? 0);
  if (!Number.isFinite(nroA) || !Number.isFinite(nroB)) return 0;
  return nroA - nroB;
}

/**
 * Orden cronológico reconstruido para instrumentos del export "histórico de
 * tenencia". Ese archivo no trae hora y su Nro. de operación no siempre es
 * correlativo al momento de ejecución (ej. GOOGL 07/08: la compra de 476 tiene un
 * nro MÁS ALTO que la venta de 180 que vino después). Lo que sí publica IEB es el
 * `saldoTenencia` resultante de cada movimiento, así que dentro de cada fecha
 * reconstruimos la secuencia real encadenando saldos: desde el saldo de cierre del
 * día anterior, el próximo movimiento es el que deja exactamente el saldo anotado.
 * Si falta el saldo (operaciones manuales / del día) cae al criterio viejo
 * (`compararCronologico`).
 */
function ordenarCronologico(transacciones) {
  const porFecha = new Map();
  for (const t of transacciones) {
    const fecha = t.fecha || "";
    if (!porFecha.has(fecha)) porFecha.set(fecha, []);
    porFecha.get(fecha).push(t);
  }

  const resultado = [];
  let saldoFinal = null;
  for (const fecha of [...porFecha.keys()].sort()) {
    const ordenadas = ordenarDiaPorSaldo(porFecha.get(fecha), saldoFinal);
    resultado.push(...ordenadas);
    const ultimo = ordenadas[ordenadas.length - 1];
    if (ultimo?.saldoTenencia != null) saldoFinal = ultimo.saldoTenencia;
  }
  return resultado;
}

function ordenarDiaPorSaldo(ops, saldoInicial) {
  if (!ops.every((t) => t.saldoTenencia != null && Number.isFinite(t.saldoTenencia))) {
    return [...ops].sort(compararCronologico);
  }
  const iguales = (a, b) => Math.abs(a - b) < 1e-6;
  // El punto de partida es el saldo de cierre del día anterior; si es el primer día
  // del historial (arranca mid-folio), probamos con el saldo previo implícito de cada
  // operación (`saldo − cantidad`). Como el saldo puede volver a pasar por el mismo
  // valor (compra → venta → compra), no alcanza con elegir el primero que encaje:
  // hay que explorar con backtracking hasta cerrar la secuencia completa.
  const candidatos = saldoInicial != null
    ? [saldoInicial]
    : Array.from(new Set(ops.map((t) => t.saldoTenencia - (t.cantidad ?? 0)))).sort((a, b) => {
        // Preferir arranque desde 0 (sin posición previa): si el archivo trae
        // primero la venta de un par trading intradiario, el orden de aparición
        // haría arrancar desde el saldo post-venta y dejaría un residuo fantasma
        // que contamina todo el FIFO posterior.
        if (iguales(a, 0)) return -1;
        if (iguales(b, 0)) return 1;
        return a - b;
      });

  for (const inicio of candidatos) {
    const usados = new Array(ops.length).fill(false);
    const orden = [];
    const reconstruir = (actual) => {
      if (orden.length === ops.length) return true;
      for (let i = 0; i < ops.length; i++) {
        if (usados[i] || !iguales(actual + (ops[i].cantidad ?? 0), ops[i].saldoTenencia)) continue;
        usados[i] = true;
        orden.push(ops[i]);
        if (reconstruir(ops[i].saldoTenencia)) return true;
        usados[i] = false;
        orden.pop();
      }
      return false;
    };
    if (reconstruir(inicio)) return orden;
  }
  return [...ops].sort(compararCronologico);
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
    if (ticker) return { ...t, ticker };
    // Cargas manuales donde el "nombre" ya es el ticker (ej. activo "NBIS").
    const upper = t.activo.trim().toUpperCase();
    if (INFO_POR_TICKER[upper]) return { ...t, ticker: upper };
    // Fallback genérico para tickers nuevos que todavía no están en la tabla
    // curada (ej. activo "MOS", "TEAM"): siglas cortas en mayúsculas, sin
    // números ni espacios. Se excluyen divisas sueltas (ARS/USD).
    if (/^[A-Z]{2,5}$/.test(upper) && upper !== "ARS" && upper !== "USD") return { ...t, ticker: upper };
    return t;
  });
}

/**
 * Efectivo apartado para renta fija a una fecha: los ingresos (sueldo, aportes)
 * NUNCA van a renta variable, siempre terminan en bonos. Se netean con las
 * compras de RF posteriores (FIFO aproximado con piso en cero por paso): lo que
 * ya se usó para comprar deja de estar apartado.
 */
export function efectivoParaRentaFija(transacciones, fondos, fechaISO) {
  const eventos = [];
  for (const f of fondos || []) {
    if ((f.tipo || "ingreso") !== "ingreso") continue;
    if (!f.fecha || f.fecha > fechaISO || !(f.monto > 0)) continue;
    eventos.push({ fecha: f.fecha, monto: f.monto, orden: 0 });
  }
  for (const t of transacciones || []) {
    if (!t.fecha || t.fecha > fechaISO) continue;
    const op = (t.operacion || "").toUpperCase();
    if (!op.includes("COMPRA")) continue;
    const { claseActivo } = clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion });
    if (claseActivo !== CLASES.BONO_SOBERANO) continue;
    const monto = t.importeARS != null
      ? Math.abs(t.importeARS)
      : (t.divisa || "ARS") === "ARS" && t.precio != null && t.cantidad != null
        ? importeConDerechos(Math.abs(t.cantidad * t.precio) * factorPrecioPorClase(claseActivo), true)
        : null;
    if (monto == null) continue;
    eventos.push({ fecha: t.fecha, monto: -monto, orden: 1 });
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden));
  let apartado = 0;
  for (const e of eventos) apartado = Math.max(0, apartado + e.monto);
  return apartado;
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
  const filtradas = resolverTickers(transacciones).filter(
    (t) => claveActivo(t) === clave && !esMovimiento(t.operacion)
  );
  return ordenarCronologico(filtradas);
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

/**
 * "Días de tenencia" de la posición actual de cada instrumento, según el LOTE
 * ABIERTO MÁS ANTIGUO. En vez de reconstruir el pasado a ciegas con FIFO sobre los
 * movimientos (los exports de IEB pueden arrancar mid-folio y vender posición previa
 * sin compra registrada, descarrilando cualquier simulación desde cero), camina la
 * serie DIARIA de cantidades del historial de Portafolios: cada aumento es un lote
 * datado ese día y cada baja consume (FIFO) los lotes más viejos primero. Así una
 * venta de hoy consume lo que se venía holdeando y las compras de hoy quedan datadas
 * hoy (GOOGL comprado hoy → 0 días; TMF27 con compras del 07-09 → 9 días).
 *
 * Devuelve Map clave -> { cantidad, fechaMasAntigua, dias }, con `dias` medidos
 * desde el lote abierto más antiguo hasta `fechaReferencia`.
 */
export function calcularDiasTenencia(
  transacciones,
  { fechaReferenciaISO = aISO(new Date()), portafolioHistorial = null } = {}
) {
  const fechaBaseISO =
    portafolioHistorial?.length ? portafolioHistorial[portafolioHistorial.length - 1].fecha : null;
  const fechaBaseT = fechaBaseISO ? fechaLocal(fechaBaseISO).getTime() : null;
  const referencia = fechaLocal(fechaReferenciaISO).getTime();
  const MS_DIA = 86_400_000;

  // Serie diaria de cantidades por clave, desde el historial de Portafolios (la foto
  // real por día que importa IEB, no una reconstrucción con los movimientos).
  if (portafolioHistorial?.length) {
    const grupos = agruparTransacciones(transacciones);
    const fechaBase = portafolioHistorial[portafolioHistorial.length - 1].fecha;
    const fechasSnapshots = portafolioHistorial.map((s) => s.fecha).sort();
    const seriePorClave = new Map();
    for (const snap of portafolioHistorial) {
      for (const h of snap.tenencias ?? []) {
        const clave = h.ticker || h.nombre || "SIN_IDENTIFICAR";
        if (h.cantidad == null || h.cantidad <= 0) continue;
        if (!seriePorClave.has(clave)) seriePorClave.set(clave, new Map());
        seriePorClave.get(clave).set(snap.fecha, h.cantidad);
      }
    }

    const resultado = new Map();
    // Considerar también claves que nunca aparecieron en un Portafolio pero se
    // operaron después de la última foto (compradas hoy) — la cola arranca vacía.
    const clavesSerie = new Set([...seriePorClave.keys(), ...grupos.keys()]);
    for (const clave of clavesSerie) {
      const txs = grupos.get(clave) ?? [];
      if (
        clasificar({
          activo: txs.length ? nombreMasDescriptivo(txs) : "",
          ticker: clave,
          operacion: txs[0]?.operacion ?? null,
        }).claseActivo === CLASES.MOVIMIENTO
      ) continue;
      if (txs.length && esCaucion(nombreMasDescriptivo(txs), txs[0]?.operacion)) continue;

      // Lotes de lo que se tenía hasta la última foto del Portafolio, armados
      // caminando la serie diaria (los aumentos son lotes fechados, las bajas
      // consumen los más antiguos).
      const porFecha = seriePorClave.get(clave) ?? new Map();
      let qPrevia = 0;
      const cola = [];
      for (const f of fechasSnapshots) {
        // Al ver un día pasado, la serie se corta en la fecha de referencia:
        // ni snapshots ni operaciones posteriores a ese día pueden mover lotes.
        if (f > fechaBase || f > fechaReferenciaISO) break;
        const q = porFecha.get(f) ?? 0;
        const delta = q - qPrevia;
        if (Math.abs(delta) > 1e-9) {
          if (delta > 0) {
            cola.push({ fecha: f, cantidad: delta });
          } else {
            let porConsumir = -delta;
            while (porConsumir > 1e-9 && cola.length) {
              const lote = cola[0];
              const usar = Math.min(lote.cantidad, porConsumir);
              lote.cantidad -= usar;
              porConsumir -= usar;
              if (lote.cantidad < 1e-9) cola.shift();
            }
          }
        }
        qPrevia = q;
      }

      // Encima, FIFO de las transacciones POSTERIORES a la última foto (respeta el
      // orden real intra-día reconstruido con los saldos).
      for (const t of ordenarCronologico(txs)) {
        if (!t.fecha || t.fecha <= fechaBase || t.fecha > fechaReferenciaISO) continue;
        const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
        const cant = Math.abs(t.cantidad ?? 0);
        if (cant === 0) continue;
        if (OPS_COMPRA.includes(op)) {
          cola.push({ fecha: t.fecha, cantidad: cant });
        } else if (OPS_VENTA.includes(op)) {
          let porConsumir = cant;
          while (porConsumir > 1e-9 && cola.length) {
            const lote = cola[0];
            const usar = Math.min(lote.cantidad, porConsumir);
            lote.cantidad -= usar;
            porConsumir -= usar;
            if (lote.cantidad < 1e-9) cola.shift();
          }
        }
      }

      const restantes = cola.filter((l) => l.cantidad > 1e-9 && l.fecha);
      const total = restantes.reduce((acc, l) => acc + l.cantidad, 0);
      if (total <= 0) continue;
      const masAntiguo = restantes.reduce((a, b) => (a.fecha < b.fecha ? a : b));
      const dias = Math.max(0, Math.floor((referencia - fechaLocal(masAntiguo.fecha).getTime()) / MS_DIA));
      resultado.set(clave, { cantidad: total, fechaMasAntigua: masAntiguo.fecha, dias });
    }
    return resultado;
  }

  // Fallback sin historial de Portafolios: FIFO sobre los movimientos mismos.
  // Última línea de defensa; con Portafolios importados no se usa.
  return fallbackFIFODesdeTransacciones(transacciones, fechaReferenciaISO);
}

function fallbackFIFODesdeTransacciones(transacciones, fechaReferenciaISO) {
  const grupos = agruparTransacciones(transacciones);
  const resultado = new Map();
  const referencia = fechaLocal(fechaReferenciaISO).getTime();
  const MS_DIA = 86_400_000;

  for (const [clave, txs] of grupos) {
    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;
    if (clasificar({ activo, ticker, operacion: operacionRepresentativa }).claseActivo === CLASES.MOVIMIENTO) continue;
    if (esCaucion(activo, operacionRepresentativa)) continue;

    const cola = [];
    for (const t of ordenarCronologico(txs)) {
      if (t.fecha && t.fecha > fechaReferenciaISO) continue;
      const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
      const cant = Math.abs(t.cantidad ?? 0);
      if (cant === 0) continue;
      if (OPS_COMPRA.includes(op)) {
        cola.push({ fecha: t.fecha, cantidad: cant });
      } else if (OPS_VENTA.includes(op)) {
        let porConsumir = cant;
        while (porConsumir > 1e-9 && cola.length) {
          const lote = cola[0];
          const usar = Math.min(lote.cantidad, porConsumir);
          lote.cantidad -= usar;
          porConsumir -= usar;
          if (lote.cantidad < 1e-9) cola.shift();
        }
      }
    }

    const restantes = cola.filter((l) => l.cantidad > 1e-9 && l.fecha);
    const total = restantes.reduce((acc, l) => acc + l.cantidad, 0);
    if (total <= 0) continue;

    const masAntiguo = restantes.reduce((a, b) => (a.fecha < b.fecha ? a : b));
    const dias = Math.max(0, Math.floor((referencia - fechaLocal(masAntiguo.fecha).getTime()) / MS_DIA));
    resultado.set(clave, { cantidad: total, fechaMasAntigua: masAntiguo.fecha, dias });
  }

  return resultado;
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
 * Derechos de mercado BYMA (0,05% + IVA = 0,0605%) que IEB cobra en cada
 * boleto: la compra paga de más y la venta recibe de menos. El importe real
 * que informa IEB ya los trae; solo se aplican al ESTIMAR un importe
 * (cargas manuales sin importe), con el signo de caja correspondiente.
 */
export const TASA_DERECHOS_MERCADO = 0.000605;
export function importeConDerechos(montoAbsoluto, esCompra) {
  if (!(montoAbsoluto > 0)) return montoAbsoluto;
  return esCompra ? montoAbsoluto * (1 + TASA_DERECHOS_MERCADO) : montoAbsoluto * (1 - TASA_DERECHOS_MERCADO);
}

/**
 * Ajuste por flujos con renta fija en (desde, hasta] para medir la parte
 * variable: lo que entró/salió por compras/ventas de bonos no es rendimiento.
 * Las compras se financian primero con el efectivo apartado a RF (sueldos) y
 * solo el resto sale de la parte variable; las ventas vuelven a caja.
 */
export function ajusteFlujosRentaFija(transacciones, fondos, desde, hasta) {
  let earmark = efectivoParaRentaFija(transacciones, fondos, desde);
  const eventos = [];
  for (const f of fondos || []) {
    if ((f.tipo || "ingreso") !== "ingreso") continue;
    if (!f.fecha || f.fecha <= desde || f.fecha > hasta || !(f.monto > 0)) continue;
    eventos.push({ fecha: f.fecha, orden: 0, tipo: "ingreso", monto: f.monto });
  }
  for (const t of transacciones || []) {
    if (!t.fecha || t.fecha <= desde || t.fecha > hasta) continue;
    const op = (t.operacion || "").toUpperCase();
    const esCompra = op.includes("COMPRA");
    const esVenta = op.includes("VENTA");
    if (!esCompra && !esVenta) continue;
    const { claseActivo } = clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion });
    if (claseActivo !== CLASES.BONO_SOBERANO) continue;
    const monto = t.importeARS != null
      ? Math.abs(t.importeARS)
      : (t.divisa || "ARS") === "ARS" && t.precio != null && t.cantidad != null
        ? importeConDerechos(Math.abs(t.cantidad * t.precio) * factorPrecioPorClase(claseActivo), esCompra)
        : null;
    if (monto == null) continue;
    eventos.push({ fecha: t.fecha, orden: 1, tipo: esCompra ? "compra" : "venta", monto });
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden));
  let ajuste = 0;
  for (const e of eventos) {
    if (e.tipo === "ingreso") {
      earmark += e.monto;
    } else if (e.tipo === "compra") {
      const desdeEarmark = Math.min(e.monto, earmark);
      earmark -= desdeEarmark;
      ajuste += e.monto - desdeEarmark;
    } else {
      ajuste -= e.monto;
    }
  }
  return ajuste;
}

/**
 * ¿Opera BYMA ahora? Renta variable lunes a viernes 10:30–17:00 (hora
 * argentina, UTC−3 fijo). Fuera de rueda las puntas quedan colgadas y el
 * último operado es el precio válido.
 */
export function mercadoAbierto(ahora = new Date()) {
  const art = new Date(ahora.getTime() - 3 * 3600 * 1000);
  const dia = art.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  const minutos = art.getUTCHours() * 60 + art.getUTCMinutes();
  return minutos >= 10 * 60 + 30 && minutos < 17 * 60;
}

/**
 * ¿Ya abrió la rueda de hoy? Lunes a viernes desde las 10:30 ART (queda
 * habilitado el resto del día, incluido post-cierre). Antes de eso el día
 * todavía no existe para la app: gráficos, periodos y selectores muestran
 * hasta la última sesión.
 */
export function sesionAbiertaHoy(ahora = new Date()) {
  const art = new Date(ahora.getTime() - 3 * 3600 * 1000);
  const dia = art.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  const minutos = art.getUTCHours() * 60 + art.getUTCMinutes();
  return minutos >= 10 * 60 + 30;
}

/**
 * Precio vivo a usar: en rueda (mercado abierto) la punta vendedora más baja
 * (`precio`: ask si hay, si no el último) — SALVO renta fija, que va al último
 * operado (`ultimo`); fuera de rueda el cierre (último operado, las puntas
 * quedan colgadas). Sin operatoria hoy el ask es una punta vieja y también se
 * usa el último.
 */
export function precioVivo(dato, claseActivo, ahora = new Date()) {
  if (!dato) return null;
  if (dato.q_op != null && !(dato.q_op > 0)) return dato.ultimo ?? dato.precio;
  if (!mercadoAbierto(ahora)) return dato.ultimo ?? dato.precio;
  if (claseActivo === CLASES.BONO_SOBERANO) return dato.ultimo ?? dato.precio ?? null;
  return dato.precio ?? dato.ultimo ?? null;
}

/**
 * Cierre manual vigente para un ticker: fuera de rueda vale el último precio
 * fijado a mano (el más reciente hasta hoy, fecha argentina, ej. SPCX 4955 del
 * 22/9 sigue valiendo el 23/9 a las 9am); en rueda (BYMA 10:30–17:00 ART) manda
 * el vivo y se devuelve null. Los manuales de fechas futuras se ignoran.
 * Devuelve { precio, fecha } o null.
 */
export function cierreManualVigente(manuales, ticker, ahora = new Date()) {
  if (mercadoAbierto(ahora)) return null;
  if (!manuales || !ticker) return null;
  const tk = String(ticker).toUpperCase();
  const hoy = hoyArgentina(ahora);
  let mejorFecha = null;
  for (const f of Object.keys(manuales)) {
    if (f > hoy) continue;
    const p = manuales[f]?.[ticker] ?? manuales[f]?.[tk];
    if (p == null || !(p > 0)) continue;
    if (mejorFecha == null || f > mejorFecha) mejorFecha = f;
  }
  if (mejorFecha == null) return null;
  return { precio: manuales[mejorFecha][ticker] ?? manuales[mejorFecha][tk], fecha: mejorFecha };
}

/**
 * Calcula tenencia neta y costo promedio de un instrumento a partir de su historial
 * de operaciones (orden cronológico), usando el método de costo promedio ponderado.
 */
function calcularPosicionInstrumento(transacciones, factorPrecio = 1, tipoCambioPorFecha = null) {
  const ordenadas = ordenarCronologico(transacciones);
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
  function montoEnARS(t, cantidadUsada, esParidad, esCompra) {
    if (t.importeARS != null) return { monto: Math.abs(t.importeARS), estimado: false };
    if (!esParidad) {
      // Sin importe real (carga manual) se estima Precio × Cantidad MÁS derechos
      // de mercado, igual que los cobra IEB en el boleto.
      return t.precio != null
        ? { monto: importeConDerechos(t.precio * cantidadUsada * factorPrecio, esCompra), estimado: false }
        : { monto: null, estimado: false };
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
      const { monto: costo } = montoEnARS(t, cant, esParidad, true);
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
      const { monto: ingresoTotal, estimado: ingresoEstimado } = montoEnARS(t, cantidadSolicitada, esParidad, false);

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
  const ordenadas = ordenarCronologico(txs);
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
 * Sleeve efectivo de un lote de compra, mismo criterio que `sleeveDeTransaccion`
 * en lib/sleeves.js (se duplica acá para no crear un import circular
 * calculos↔sleeves): sleeve explícito del ticket, si no bonos a renta fija y el
 * resto a trading.
 */
function sleeveDeLote(t) {
  const s = t?.sleeve;
  if (s === "trading" || s === "largo" || s === "rentaFija") return s;
  const { claseActivo } = clasificar({ activo: t?.activo, ticker: t?.ticker, operacion: t?.operacion });
  return claseActivo === CLASES.BONO_SOBERANO ? "rentaFija" : "trading";
}

/**
 * Trades cerrados por apareo FIFO compra→venta, uno por cada venta: cada venta
 * consume las compras más viejas y genera un único trade con el precio promedio
 * ponderado de las compras apareadas (una venta sobre dos compras cuenta como
 * un trade). Los lotes comprados que siguen sin vender salen en `abiertos`.
 * Los montos usan el importe real prorrateado cuando IEB lo informa (incluye
 * gastos) y si no Precio × Cantidad con derechos de mercado.
 * Con `sleeve` solo se aparean lotes de esa estrategia (ej. "trading"): las
 * compras de otros sleeves no entran a la cola y las ventas con sleeve
 * explícito distinto se ignoran.
 */
export function calcularTrades(transacciones, overrides, { sleeve = null, precios = null } = {}) {
  const grupos = agruparTransacciones(transacciones);
  const cerrados = [];
  const abiertos = [];
  let ventaSeq = 0;
  const hoy = aISO(new Date());
  const MS_DIA = 86_400_000;

  /** Costo/ingreso unitario efectivo en ARS de una operación, o null. */
  function unitario(t, cant, esCompra, factorPrecio) {
    if (!(cant > 0)) return null;
    if (t.importeARS != null) return Math.abs(t.importeARS) / cant;
    const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (op.includes("PARIDAD") || t.precio == null) return null;
    if ((t.divisa || "ARS") !== "ARS") return null;
    return importeConDerechos(t.precio * factorPrecio, esCompra);
  }

  for (const [clave, txs] of grupos) {
    const activo = nombreMasDescriptivo(txs);
    const ticker = tickerDelGrupo(txs);
    const operacionRepresentativa = txs[0]?.operacion;

    const base = clasificar({ activo, ticker, operacion: operacionRepresentativa });
    const { claseActivo, sector } = aplicarOverride(clave, base, overrides);
    if (claseActivo === CLASES.MOVIMIENTO || esCaucion(activo, operacionRepresentativa)) continue;

    const factorPrecio = factorPrecioPorClase(claseActivo);
    const nombreMostrado = nombrePersonalizado(clave, nombreLimpio(ticker, activo) || clave, overrides);
    const filaBase = { clave, activo: nombreMostrado, ticker, claseActivo, sector };

    const lotes = []; // compras pendientes: { fecha, precio, unitario, cantidad, nroOperacion }
    for (const t of ordenarCronologico(txs)) {
      const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
      const cant = Math.abs(t.cantidad ?? 0);
      if (cant === 0 || !t.fecha) continue;
      if (OPS_COMPRA.includes(op)) {
        if (sleeve && sleeveDeLote(t) !== sleeve) continue;
        lotes.push({
          fecha: t.fecha,
          precio: t.precio,
          unitario: unitario(t, cant, true, factorPrecio),
          cantidad: cant,
          nroOperacion: t.nroOperacion ?? null,
        });
      } else if (OPS_VENTA.includes(op)) {
        // Con filtro de sleeve, una venta marcada de otra estrategia no es un
        // trade de esta: se ignora por completo.
        if (sleeve && t.sleeve && t.sleeve !== sleeve) continue;
        const unitVenta = unitario(t, cant, false, factorPrecio);
        let porVender = cant;
        const vk = `v${ventaSeq++}`;
        while (porVender > 1e-9 && lotes.length) {
          const lote = lotes[0];
          const usar = Math.min(lote.cantidad, porVender);
          const costo = lote.unitario != null ? lote.unitario * usar : null;
          const ingreso = unitVenta != null ? unitVenta * usar : null;
          const resultado = costo != null && ingreso != null ? ingreso - costo : null;
          cerrados.push({
            ...filaBase,
            ventaKey: vk,
            cantidad: usar,
            fechaCompra: lote.fecha,
            precioCompra: lote.precio,
            costoTotal: costo,
            nroCompra: lote.nroOperacion,
            fechaVenta: t.fecha,
            precioVenta: t.precio,
            ingresoTotal: ingreso,
            nroVenta: t.nroOperacion ?? null,
            resultado,
            dias: lote.fecha && t.fecha
              ? Math.max(0, Math.round((fechaLocal(t.fecha).getTime() - fechaLocal(lote.fecha).getTime()) / MS_DIA))
              : null,
          });
          lote.cantidad -= usar;
          porVender -= usar;
          if (lote.cantidad < 1e-9) lotes.shift();
        }
        if (porVender > 1e-9 && !sleeve) {
          // Venta sin compra conocida (posición previa al historial): se lista
          // con ingreso pero sin costo ni resultado. Con filtro de sleeve el
          // remanente es de otra estrategia y se descarta.
          const ingreso = unitVenta != null ? unitVenta * porVender : null;
          cerrados.push({
            ...filaBase,
            ventaKey: `v${ventaSeq++}`,
            cantidad: porVender,
            fechaCompra: null,
            precioCompra: null,
            costoTotal: null,
            nroCompra: null,
            fechaVenta: t.fecha,
            precioVenta: t.precio,
            ingresoTotal: ingreso,
            nroVenta: t.nroOperacion ?? null,
            resultado: null,
            retornoPct: null,
            dias: null,
            sinCosto: true,
          });
        }
      }
    }

    for (const lote of lotes) {
      if (!(lote.cantidad > 1e-9)) continue;
      const costoTotal = lote.unitario != null ? lote.unitario * lote.cantidad : null;
      // Precio actual (vivo o cierre) para valuar la posición abierta como si se
      // cerrara ahora: mismos campos que un trade cerrado (precioVenta,
      // ingresoTotal, resultado, retornoPct).
      let precioActual = null;
      let sinPrecio = true;
      if (precios) {
        const cot = precios.get(ticker) ?? precios.get(clave) ?? null;
        if (cot != null) {
          if (typeof cot === "number") {
            precioActual = cot;
            sinPrecio = false;
          } else if (typeof cot === "object") {
            const vivo = precioVivo(cot, claseActivo);
            const raw = vivo ?? cot.ultimo ?? cot.precio ?? null;
            if (raw != null && raw > 0) {
              precioActual = raw;
              sinPrecio = false;
            }
          }
        }
      }
      if (sinPrecio) {
        const manual = overrides?.[clave]?.precioManual ?? null;
        if (manual != null && manual > 0) {
          precioActual = manual;
          sinPrecio = false;
        }
      }
      const ingresoTotal = !sinPrecio && precioActual != null ? lote.cantidad * precioActual * factorPrecio : null;
      const resultado = ingresoTotal != null && costoTotal != null ? ingresoTotal - costoTotal : null;
      const retornoPct = costoTotal > 0 && resultado != null ? resultado / costoTotal : null;
      abiertos.push({
        ...filaBase,
        id: `${clave}__abierto__${lote.fecha}__${lote.nroOperacion ?? ""}`,
        cantidad: lote.cantidad,
        fechaCompra: lote.fecha,
        precioCompra: lote.precio,
        costoTotal,
        nroCompra: lote.nroOperacion,
        // Campos valuados a mercado (precio actual = "precio de venta" simulado)
        precioActual,
        precioVenta: precioActual,
        fechaVenta: hoy,
        fechaValuacion: hoy,
        ingresoTotal,
        valorActual: ingresoTotal,
        resultado,
        retornoPct,
        sinPrecio,
        factorPrecio,
        dias: Math.max(0, Math.round((fechaLocal(hoy).getTime() - fechaLocal(lote.fecha).getTime()) / MS_DIA)),
      });
    }
  }

  // Los tramos de una misma venta se consolidan en un único trade con precio
  // promedio ponderado de las compras apareadas.
  const porVenta = new Map();
  for (const tramo of cerrados) {
    if (!porVenta.has(tramo.ventaKey)) porVenta.set(tramo.ventaKey, []);
    porVenta.get(tramo.ventaKey).push(tramo);
  }
  const trades = [];
  for (const tramos of porVenta.values()) {
    const primero = tramos[0];
    const cantidad = tramos.reduce((acc, x) => acc + x.cantidad, 0);
    const costoTotal = tramos.every((x) => x.costoTotal != null)
      ? tramos.reduce((acc, x) => acc + x.costoTotal, 0)
      : null;
    const ingresoTotal = tramos.every((x) => x.ingresoTotal != null)
      ? tramos.reduce((acc, x) => acc + x.ingresoTotal, 0)
      : null;
    const resultado = costoTotal != null && ingresoTotal != null ? ingresoTotal - costoTotal : null;
    const conPrecio = tramos.filter((x) => x.precioCompra != null);
    const precioCompra = conPrecio.length === tramos.length && cantidad > 0
      ? conPrecio.reduce((acc, x) => acc + x.precioCompra * x.cantidad, 0) / cantidad
      : null;
    const fechasCompra = tramos.map((x) => x.fechaCompra).filter(Boolean).sort();
    const diasPond = cantidad > 0
      ? tramos.reduce((acc, x) => acc + (x.dias ?? 0) * x.cantidad, 0) / cantidad
      : null;
    trades.push({
      ...primero,
      id: `${primero.clave}__${primero.nroVenta ?? primero.fechaVenta}__${primero.ventaKey}`,
      cantidad,
      fechaCompra: fechasCompra[0] ?? null,
      fechaCompraHasta: fechasCompra.length > 1 ? fechasCompra[fechasCompra.length - 1] : null,
      precioCompra,
      costoTotal,
      nroCompra: tramos.length === 1 ? primero.nroCompra : null,
      ingresoTotal,
      resultado,
      retornoPct: costoTotal > 0 && resultado != null ? resultado / costoTotal : null,
      dias: diasPond != null ? Math.max(0, Math.round(diasPond)) : null,
      lotes: tramos.length,
      sinCosto: costoTotal == null,
    });
  }

  trades.sort((a, b) =>
    (b.fechaVenta || "").localeCompare(a.fechaVenta || "") ||
    (b.fechaCompra || "").localeCompare(a.fechaCompra || "")
  );
  abiertos.sort((a, b) => (b.fechaCompra || "").localeCompare(a.fechaCompra || ""));

  const conResultado = trades.filter((t) => t.resultado != null);
  const abiertosConResultado = abiertos.filter((t) => t.resultado != null);
  return {
    cerrados: trades,
    abiertos,
    resumen: {
      cantidad: trades.length,
      resultadoTotal: conResultado.reduce((acc, t) => acc + t.resultado, 0),
      ganadores: conResultado.filter((t) => t.resultado > 0).length,
      perdedores: conResultado.filter((t) => t.resultado < 0).length,
      abiertas: new Set(abiertos.map((t) => t.ticker || t.clave)).size,
      lotesAbiertos: abiertos.length,
      costoAbierto: abiertos.reduce((acc, t) => acc + (t.costoTotal ?? 0), 0),
      valorAbierto: abiertos.reduce((acc, t) => acc + (t.ingresoTotal ?? 0), 0),
      resultadoAbierto: abiertosConResultado.reduce((acc, t) => acc + t.resultado, 0),
      abiertosGanadores: abiertosConResultado.filter((t) => t.resultado > 0).length,
      abiertosPerdedores: abiertosConResultado.filter((t) => t.resultado < 0).length,
    },
  };
}

/**
 * "Resultados del día": todas las operaciones (compras y ventas) de una fecha,
 * aunque la posición no esté cerrada. Por activo, simula el historial completo en
 * orden FIFO (las ventas consumen primero las compras más viejas) para saber
 * cuántas unidades de cada compra del día siguen abiertas:
 *   - COMPRA: resultado a mercado = (precioActual − precioCompra) × pendiente × factor.
 *   - VENTA:  resultado del día = (precioVenta − base) × cantidad × factor, donde la
 *     base es el precio de compra para lo comprado ese mismo día y el cierre del día
 *     anterior (`preciosCierre`) para lo que ya se tenía — así el total del día mide
 *     solo el movimiento de la rueda y reconcilia con la variación de la cartera, en
 *     vez de arrastrar ganancias/pérdidas de días previos.
 * El resultado se marca a mercado con `precios` (Map ticker → { precio, ... }), igual
 * que el resto del dashboard. Es un cálculo aparte del costo promedio ponderado del
 * resto de la app: acá importa la atribución por-operación, y FIFO se entiende mejor
 * para eso.
 */
export async function calcularResultadosDelDia(transaccionesResueltas, diaISO, precios, overrides, preciosCierre) {
  const grupos = agruparTransacciones(transaccionesResueltas);
  const trades = [];
  const posicionesCierre = [];
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

    function importeOperacion(t, cantidadUsada, esParidad, esCompra) {
      if (t.importeARS != null) return { monto: Math.abs(t.importeARS), estimado: false };
      if (!esParidad) {
        return t.precio != null ? { monto: importeConDerechos(t.precio * cantidadUsada * factorPrecio, esCompra), estimado: false } : { monto: null, estimado: false };
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

    const ordenadas = ordenarCronologico(txs);
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
        const costo = importeOperacion(t, cant, esParidad, true);
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
            hora: t.hora ?? null,
            nroOperacion: t.nroOperacion ?? null,
            cantidad: cant,
            precio: t.precio,
            importe: costo.monto,
            factorPrecio,
          });
        }
      } else if (OPS_VENTA.includes(op)) {
        const ingreso = importeOperacion(t, cant, esParidad, false);
        // Precio de venta unitario "de mercado" (sin comisión). Para las paridades
        // (bonos, sin precio ARS propio) usamos el importe pesificado por CCL.
        const ingresoUnit =
          cant > 0 && t.precio != null && !esParidad
            ? t.precio * factorPrecio
            : ingreso.monto != null && cant > 0
              ? ingreso.monto / cant
              : null;
        let porConsumir = cant;
        let costoConsumido = 0;
        let cantConCosto = 0;
        let sinCosto = 0;
        let resultadoDia = 0;
        let costoBase = 0;
        let cantConBase = 0;
        const origenes = [];
        while (porConsumir > 1e-9 && cola.length) {
          const lote = cola[0];
          const usar = Math.min(lote.cantidadRestante, porConsumir);
          if (lote.costoUnitario != null) {
            costoConsumido += lote.costoUnitario * usar;
            cantConCosto += usar;
          } else sinCosto += usar;
          // Base "a mercado" del resultado del día: lo comprado el propio día se mide
          // contra su precio de compra; lo que ya se tenía al cierre anterior, contra
          // ese cierre (si no lo conocemos caemos al precio de compra, el criterio
          // histórico que arrastraba resultados de días previos).
          const baseUnitaria =
            lote.fecha === diaISO
              ? lote.precio
              : (preciosCierre?.get(ticker) ?? preciosCierre?.get(clave) ?? lote.precio);
          if (ingresoUnit != null && baseUnitaria != null) {
            // ingresoUnit ya trae factorPrecio cuando viene de precio (no paridad);
            // la base va en escala cruda, así que se la lleva a la misma escala
            // antes de restar (con factor 1 es identidad). costoBase queda en escala
            // cruda a propósito: baseResultado se muestra como precio "cada 100".
            const baseEscalada = !esParidad ? baseUnitaria * factorPrecio : baseUnitaria;
            resultadoDia += (ingresoUnit - baseEscalada) * usar * (esParidad ? factorPrecio : 1);
            costoBase += baseUnitaria * usar;
            cantConBase += usar;
          }
          // Registramos qué compra original (día y precio) dio origen a estas
          // unidades, para poder mostrarlo cuando la venta no se financió con una
          // compra del mismo día.
          if (lote.precio != null) origenes.push({ fecha: lote.fecha, precio: lote.precio, cantidad: usar, cantidadLote: lote.cantidad });
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
            hora: t.hora ?? null,
            nroOperacion: t.nroOperacion ?? null,
            cantidad: cant,
            precio: t.precio,
            importe: ingreso.monto,
            factorPrecio,
            // Resultado del día (mark-to-market): venta − cierre anterior (o precio de
            // compra si se compró hoy). Es lo que suma al "Resultado del día".
            resultado: cantConBase > 0 ? resultadoDia : null,
            costoBase: cantConBase > 0 ? costoBase : null,
            baseResultado: cantConBase > 0 ? costoBase / cantConBase : null,
            // Resultado realizado "de verdad" (venta − costo FIFO de compra), que se
            // arrastra desde el día de compra. Queda disponible por si se quiere
            // mostrar aparte, pero no engrosa el total del día.
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
        // Una compra que ya se vendió por completo no deja tenencia pendiente, así
        // que no tiene "resultado": solo las ventas realizan resultado.
        fila.estado = "cerrada";
        fila.resultado = null;
      } else if (precioVivo != null && lote.precio != null) {
        fila.estado = "abierta";
        fila.resultado = (precioVivo - lote.precio) * pendiente * factorPrecio;
      } else {
        fila.estado = "abierta";
        fila.resultado = null;
      }
    }

    // Posición al cierre del día en clave "fecha de operación" (no de liquidación):
    // lo que queda abierto en la cola FIFO. `cantidadPrevia` son los lotes anteriores
    // al día que siguen abiertos — la base de la variación de la tenencia que ya se
    // tenía. No usamos el snapshot del Portafolio acá porque viene por fecha de
    // liquidación (T+1/T+2) y no refleja las operaciones del propio día.
    let cantidadCierre = 0;
    let cantidadPrevia = 0;
    for (const lote of cola) {
      cantidadCierre += lote.cantidadRestante;
      if (lote.fecha !== diaISO) cantidadPrevia += lote.cantidadRestante;
    }
    posicionesCierre.push({
      clave,
      ticker,
      activo: filaBase.activo,
      claseActivo,
      sector,
      divisa: filaBase.divisa,
      cantidad: cantidadCierre,
      cantidadPrevia,
    });
  }

  for (const t of trades) {
    if (t.importe != null) montoOperado += Math.abs(t.importe);
    // La renta fija se lista pero no engrosa el "Resultado del día" (mosaico): su
    // variación diaria no es comparable con la de acciones/CEDEARs. Las ventas
    // realizadas sí cuentan (es un resultado efectivo, no una variación de precio).
    const rentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
    if (t.tipo === "venta") {
      if (t.resultado != null) totalRealizado += t.resultado;
      else if (t.pnlDesconocido) conPnlParcial = true;
    } else if (t.resultado != null && !rentaFija) {
      totalNoRealizado += t.resultado;
    }
  }

  // Nota: acá solo llegan operaciones del propio día (las compras viejas nunca se
  // pushean). Una compra del día consumida por completo ese mismo día ("cerrada")
  // se muestra igual como fila informativa (sin resultado ni pendiente): es parte
  // de las operaciones del día.
  // Gastos del día (derechos de mercado): la foto de la cartera los descuenta vía
  // caja pero el resultado marca en bruto; sin restarlos, variable + RF no cierra
  // con la variación. Con importe real se toma la diferencia exacta, si no la tasa.
  // Tope 1% para no contabilizar escalas raras (ej. paridades).
  let gastos = 0;
  for (const t of trades) {
    if (t.tipo !== "compra" && t.tipo !== "venta") continue;
    if (t.precio == null || !(t.cantidad > 0)) continue;
    const bruto = t.precio * t.cantidad * (t.factorPrecio ?? 1);
    if (!(bruto > 0)) continue;
    let fee;
    if (t.importe != null) {
      const d = t.tipo === "compra" ? Math.abs(t.importe) - bruto : bruto - Math.abs(t.importe);
      fee = d >= 0 && d <= bruto * 0.01 ? d : 0;
    } else {
      fee = bruto * TASA_DERECHOS_MERCADO;
    }
    gastos += fee;
  }
  return {
    dia: diaISO,
    hayOperaciones: trades.length > 0,
    trades,
    posicionesCierre,
    totals: {
      realizado: totalRealizado,
      noRealizado: totalNoRealizado,
      gastos,
      total: totalRealizado + totalNoRealizado - gastos,
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
  const composicion = [
    { etiqueta: "Trading", valorARS: 0 },
    { etiqueta: "Largo plazo", valorARS: 0 },
    { etiqueta: "Renta fija", valorARS: 0 },
    { etiqueta: "Pesos", valorARS: 0 },
  ];

  for (const t of tenencias) {
    if (t.valorActualARS == null) {
      conversionIncompleta = true;
      continue;
    }
    valorTotalARS += t.valorActualARS;
    // Composición por estrategia; el efectivo es una estrategia más (no va
    // dentro de cada sleeve). Sin sleeve (histórico): RV a trading, bonos a
    // renta fija, efectivo a Efectivo.
    let grupo;
    if (t.esCash || (!t.sleeve && t.claseActivo === CLASES.EFECTIVO)) grupo = 3;
    else if (t.sleeve === "largo") grupo = 1;
    else if (t.sleeve === "rentaFija" || (!t.sleeve && t.claseActivo === CLASES.BONO_SOBERANO)) grupo = 2;
    else grupo = 0;
    composicion[grupo].valorARS += t.valorActualARS;
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
  const totalComposicion = composicion.reduce((acc, g) => acc + g.valorARS, 0);

  return {
    valorTotalARS,
    invertidoTotalARS,
    gananciaTotalARS,
    retornoTotalPct,
    dividendosTotalARS,
    conversionIncompleta,
    efectivoARS,
    composicion: composicion.map((g) => ({ ...g, pct: totalComposicion > 0 ? g.valorARS / totalComposicion : 0 })),
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
    // transferida — mientras tanto viene null (y el resultado también). Peor: a
    // veces en vez de null manda un número transitorio absurdo (ej. TMF27 con PPP
    // 4.04 el 09-10/09/26 tras una compra grande a 121.9). Para renta fija, un
    // retorno implícito de más de ±100% no es un dato accionable, así que se lo
    // trata igual que el null: PPP pendiente.
    const costoTotalH = valorActualARS != null && h.resultado != null ? valorActualARS - h.resultado : null;
    const pppBasura =
      claseActivo === CLASES.BONO_SOBERANO &&
      h.ppp != null &&
      costoTotalH != null &&
      costoTotalH > 0 &&
      Math.abs(h.resultado) > costoTotalH;
    const pppPendienteIEB = h.ppp == null || pppBasura;
    const pppManual = pppPendienteIEB ? overrides?.[clave]?.pppManual ?? null : null;
    const costoPromedio = pppBasura ? pppManual : (h.ppp ?? pppManual);
    const costoManual = pppPendienteIEB && pppManual != null;

    let gananciaNoRealizada = pppBasura && pppManual == null ? null : h.resultado;
    let costoTotal = valorActualARS != null && gananciaNoRealizada != null ? valorActualARS - gananciaNoRealizada : null;
    if (costoManual && valorActualARS != null && h.cantidad != null) {
      costoTotal = pppManual * h.cantidad * factorPrecioPorClase(claseActivo);
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
      activo: "Pesos",
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
 * Si el último Portafolio importado es de una fecha anterior (típicamente el día
 * previo) pero ya se importaron compras/ventas posteriores (ej. el export de
 * "Operaciones del día"), se aplican esas operaciones ENCIMA de las posiciones del
 * Portafolio. Así la pantalla refleja la actividad del día sin esperar el import del
 * Portafolio de hoy — la cantidad sigue el movimiento real, y el costo promedio de lo
 * que ya se tenía se conserva (viene de IEB, incluye comisiones). Las posiciones que
 * se vendan por completo desaparecen, y los tickers operados después que no estaban
 * en el Portafolio parten de cero (si no estaban en el último Portafolio es porque
 * en esa fecha no se tenía la posición — el útil histórico del motor viejo para
 * tickers fuera del Portafolio inventa unidades fantasma en ventas sin costo
 * conocido, así que acá se aplica el mismo delta cronológico desde cero).
 * La caja (efectivo) también se recalcula: se parte del disponible que traía el
 * Portafolio y se le suman/restan los importes reales (incluyen gastos y comisiones,
 * el importe global de cada boleto) de las compras y ventas posteriores, más los
 * movimientos de fondos (ingresos/retiros de dinero por fuera del mercado).
 * Devuelve { hubo, tenencias }: hubo es true solo si hubo compras/ventas posteriores.
 */
export function proyectarOperacionesSobrePortafolio(portafolio, transacciones, overrides, movimientosFondos = []) {
  const esCompraVenta = (t) => {
    const op = (t.operacion || "").toUpperCase();
    return op.startsWith("VENTA") || op.startsWith("COMPRA");
  };

  const posteriores = transacciones
    .filter((t) => t.fecha && t.fecha > portafolio.fecha && esCompraVenta(t) && (t.cantidad ?? 0) !== 0)
    .sort(compararCronologico);

  // Fondos posteriores al Portafolio (el snapshot ya incluye los anteriores):
  // ingresos suman a caja, retiros restan. Solo fecha y monto reales.
  const fondosPosteriores = (movimientosFondos || []).filter(
    (f) => f.fecha && f.fecha > portafolio.fecha && f.monto > 0 && (f.tipo === "ingreso" || f.tipo === "retiro")
  );

  if (!posteriores.length && !fondosPosteriores.length) return { hubo: false, tenencias: null };

  // El Portafolio crudo sirve de diccionario nombre→ticker para las pocas
  // transacciones que no traen ticker (como las del histórico de tenencia).
  const nombreATicker = new Map();
  for (const h of portafolio.tenencias || []) {
    if (h.ticker) nombreATicker.set(h.nombre, h.ticker);
  }

  // La base ya está valuada y clasificada; la mutamos en el delta.
  const base = construirTenenciasDesdePortafolio(portafolio, overrides);
  const porTicker = new Map();
  for (const t of base) {
    if (t.ticker) porTicker.set(t.ticker, t);
    if (!t.ticker && t.activo) porTicker.set(t.activo, t);
  }

  const tickerDe = (t) => t.ticker || nombreATicker.get(t.activo) || null;

  // Para los tickers que no estaban en el Portafolio se parte de una posición
  // sintética en cero, clasificada igual que el motor de transacciones.
  const syntheticas = new Map();
  function tenenciaPara(t) {
    const tk = tickerDe(t);
    if (!tk) return null;
    if (porTicker.has(tk)) return porTicker.get(tk);
    if (syntheticas.has(tk)) return syntheticas.get(tk);
    const activo = t.activo;
    const clasificada = clasificar({ activo, ticker: tk, operacion: t.operacion });
    const clave = claveActivo({ ...t, ticker: tk }) || tk || activo;
    const { claseActivo, sector } = aplicarOverride(clave, clasificada, overrides);
    const ten = {
      clave,
      activo: nombrePersonalizado(clave, nombreLimpio(tk, activo) || clave, overrides),
      ticker: tk,
      claseActivo,
      sector,
      divisa: t.divisa || "ARS",
      esCash: false,
      cantidad: 0,
      costoPromedio: null,
      costoTotal: 0,
      precioActual: null,
      sinPrecio: true,
      usaPrecioManual: false,
      valorActual: 0,
      valorActualARS: 0,
      gananciaNoRealizada: null,
      gananciaRealizada: 0,
      dividendosCobrados: 0,
      retornoPct: null,
    };
    syntheticas.set(tk, ten);
    porTicker.set(tk, ten);
    return ten;
  }

  function revaluar(ten) {
    const factorPrecio = factorPrecioPorClase(ten.claseActivo);
    const cantidad = ten.cantidad ?? 0;
    const sinPrecio = ten.precioActual == null;
    const valorActual = sinPrecio ? (ten.costoTotal ?? 0) : cantidad * ten.precioActual * factorPrecio;
    ten.valorActual = valorActual;
    ten.valorActualARS = valorActual; // las posiciones del Portafolio ya vienen en ARS
    ten.gananciaNoRealizada = sinPrecio ? null : valorActual - (ten.costoTotal ?? 0);
    ten.retornoPct = !sinPrecio && (ten.costoTotal ?? 0) > 0 ? (valorActual - (ten.costoTotal ?? 0)) / ten.costoTotal : null;
    return ten;
  }

  // Efecto en caja de un ticket: el importe real si lo trae (firmado: venta suma,
  // compra resta, ya va con gastos); si no, se estima Precio × Cantidad con el mismo
  // criterio que el costo de la posición (solo ARS con precio; paridades sin importe
  // no se estiman porque necesitan tipo de cambio).
  function efectoCajaTicket(t, op, ten) {
    if (t.importeARS != null) return t.importeARS;
    const esCompra = OPS_COMPRA.includes(op);
    const esVenta = OPS_VENTA.includes(op);
    if ((!esCompra && !esVenta) || op.includes("PARIDAD") || t.precio == null) return 0;
    const divisa = ten?.divisa ?? t.divisa;
    if (divisa != null && divisa !== "ARS") return 0;
    const clase = ten?.claseActivo ?? clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion }).claseActivo;
    if (clase === CLASES.EFECTIVO) return 0;
    const monto = Math.abs(t.cantidad ?? 0) * t.precio * factorPrecioPorClase(clase);
    if (!(monto > 0)) return 0;
    return esCompra ? -importeConDerechos(monto, true) : importeConDerechos(monto, false);
  }

  // Compra/venta sobre TODAS las posiciones (las del Portafolio y las sintéticas),
  // en orden cronológico: una venta consume primero lo que ya había, y una compra
  // posterior reabre la posición (o la engorda).
  const clavesCero = new Set();
  let deltaEfectivoARS = 0;
  for (const f of fondosPosteriores) {
    deltaEfectivoARS += f.tipo === "ingreso" ? f.monto : -f.monto;
  }
  for (const t of posteriores) {
    const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();

    const ten = tenenciaPara(t);
    deltaEfectivoARS += efectoCajaTicket(t, op, ten);
    if (!ten || ten.esCash || ten.claseActivo === CLASES.EFECTIVO) continue;

    const factorPrecio = factorPrecioPorClase(ten.claseActivo);
    if (OPS_COMPRA.includes(op)) {
      const cant = Math.abs(t.cantidad ?? 0);
      // El costo se toma del importe real (incluye gastos) o, si no hay, se estima
      // Precio × Cantidad solo cuando la divisa es ARS — para divisas sin importe
      // no se inventa (mismo criterio que el del motor de transacciones).
      const monto =
        t.importeARS != null
          ? Math.abs(t.importeARS)
          : ten.divisa === "ARS" && t.precio != null
            ? importeConDerechos(t.precio * cant * factorPrecio, true)
            : null;
      if (monto == null) continue;
      const nuevaCantidad = (ten.cantidad ?? 0) + cant;
      const nuevoCosto = (ten.costoTotal ?? 0) + monto;
      ten.cantidad = nuevaCantidad;
      ten.costoTotal = nuevoCosto;
      ten.costoPromedio = nuevaCantidad > 0 ? nuevoCosto / nuevaCantidad : null;
      ten.costoManual = false;
      ten.pppPendienteIEB = false;
      if (nuevaCantidad > 0) clavesCero.delete(ten.clave);
      revaluar(ten);
    } else if (OPS_VENTA.includes(op)) {
      const disponible = ten.cantidad ?? 0;
      const aConsumir = Math.min(Math.abs(t.cantidad ?? 0), disponible);
      if (aConsumir > 0 && (ten.costoTotal ?? 0) > 0 && disponible > 0) {
        const costoUnitario = ten.costoTotal / disponible;
        ten.cantidad = disponible - aConsumir;
        ten.costoTotal = ten.costoTotal - costoUnitario * aConsumir;
        if (ten.cantidad < 1e-9) {
          ten.cantidad = 0;
          ten.costoTotal = 0;
          clavesCero.add(ten.clave);
        }
        revaluar(ten);
      }
    }
  }

  // La caja disponible se recalcula con el neto de las operaciones posteriores
  // (el importe global de cada boleto ya incluye gastos y comisiones).
  if (deltaEfectivoARS !== 0) {
    let caja = base.find((t) => t.clave === "EFECTIVO_TOTAL");
    if (!caja) {
      // El Portafolio venía sin fila de efectivo (caja en cero): el saldo que dejan
      // las ventas del día se muestra igual, en una fila nueva.
      const nuevoARS = Math.max(0, deltaEfectivoARS);
      caja = {
        clave: "EFECTIVO_TOTAL",
        activo: "Efectivo",
        ticker: null,
        claseActivo: CLASES.EFECTIVO,
        sector: "Efectivo y equivalentes",
        divisa: "ARS",
        esCash: true,
        cantidad: null,
        costoPromedio: null,
        costoTotal: nuevoARS,
        precioActual: null,
        sinPrecio: false,
        usaPrecioManual: false,
        valorActual: nuevoARS,
        valorActualARS: nuevoARS,
        gananciaNoRealizada: 0,
        gananciaRealizada: 0,
        dividendosCobrados: 0,
        retornoPct: 0,
        detalleEfectivo: nuevoARS > 0
          ? [{ etiqueta: "Efectivo disponible (ARS)", clave: "EFECTIVO_ARS", cantidad: null, divisa: "ARS", precioActual: null, valorARS: nuevoARS }]
          : [],
      };
      base.push(caja);
    } else {
      const nuevoARS = (caja.costoTotal ?? 0) + deltaEfectivoARS;
      caja.costoTotal = nuevoARS;
      caja.valorActual = nuevoARS;
      caja.valorActualARS = nuevoARS;
      const detalle = caja.detalleEfectivo || [];
      const detARS = detalle.find((d) => d.divisa === "ARS");
      if (detARS) detARS.valorARS = Math.max(0, (detARS.valorARS ?? 0) + deltaEfectivoARS);
      if (detalle.length > 1) detalle.sort((a, b) => b.valorARS - a.valorARS);
    }
  }

  const resultado = [...base, ...syntheticas.values()].filter((t) => !clavesCero.has(t.clave));
  return { hubo: true, tenencias: resultado.sort((a, b) => (b.valorActualARS ?? 0) - (a.valorActualARS ?? 0)) };
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

    // En rueda al ask más bajo (renta fija al último operado), fuera de rueda al
    // cierre (ver `precioVivo`): el ask fuera de hora mete ruido y rompe la diaria.
    const precioVivoActual = precioVivo(cotizacion, t.claseActivo);
    if (precioVivoActual == null) return t;
    const factorPrecio = factorPrecioPorClase(t.claseActivo);
    const valorActual = t.cantidad * precioVivoActual * factorPrecio;
    const gananciaNoRealizada = t.costoTotal != null ? valorActual - t.costoTotal : t.gananciaNoRealizada;
    const retornoPct = t.costoTotal > 0 ? gananciaNoRealizada / t.costoTotal : t.retornoPct;

    return {
      ...t,
      precioActual: precioVivoActual,
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
  // Mismo cálculo sin renta fija (para ver cuánto rindió la parte de riesgo).
  // Siempre se calcula; si algún snapshot no trae desglose se asume que la
  // renta fija no cambió (usa el valor del otro) para no mostrar un salto
  // ficticio de -47% por un 0 vs 9M.
  let sinRentaFija = null;
  if (desde.valorTotalARS != null && hasta.valorTotalARS != null) {
    const rfDesde = desde.rentaFijaARS ?? hasta.rentaFijaARS ?? 0;
    const rfHasta = hasta.rentaFijaARS ?? desde.rentaFijaARS ?? 0;
    // El efectivo apartado a RF (ingresos) tampoco es variable.
    const apDesde = desde.efectivoParaRF ?? hasta.efectivoParaRF ?? 0;
    const apHasta = hasta.efectivoParaRF ?? desde.efectivoParaRF ?? 0;
    const dV = desde.valorTotalARS - rfDesde - apDesde;
    const hV = hasta.valorTotalARS - rfHasta - apHasta;
    const d = hV - dV;
    // El % va sobre el TOTAL (no sobre la parte variable): así la variación
    // total es la suma de este % más el aporte de la renta fija.
    sinRentaFija = {
      desdeFecha: desde.fecha,
      hastaFecha: hasta.fecha,
      desdeValorARS: dV,
      hastaValorARS: hV,
      diffARS: d,
      diffPct: desde.valorTotalARS > 0 ? d / desde.valorTotalARS : null,
    };
  }
  return {
    desdeFecha: desde.fecha,
    hastaFecha: hasta.fecha,
    desdeValorARS: desde.valorTotalARS,
    hastaValorARS: hasta.valorTotalARS,
    diffARS,
    diffPct: desde.valorTotalARS > 0 ? diffARS / desde.valorTotalARS : null,
    sinRentaFija,
  };
}

/**
 * Valor en ARS de la renta fija (clase BONO_SOBERANO, mismo criterio que
 * `construirTenenciasDesdePortafolio`) en un snapshot importado. null si algún
 * bono no tiene valor (no se puede afirmar el total).
 */
export function rentaFijaSnapshot(h) {
  let total = 0;
  for (const t of h.tenencias || []) {
    const { claseActivo } = clasificar({ activo: t.nombre, ticker: t.ticker, operacion: null, seccion: t.seccion });
    if (claseActivo !== CLASES.BONO_SOBERANO) continue;
    const v = t.posicionTotal
      ?? (t.cantidad != null && t.precio != null ? t.cantidad * t.precio * factorPrecioPorClase(claseActivo) : null);
    if (v == null) return null;
    total += v;
  }
  return total;
}

/**
 * Evolución del patrimonio total entre los Portfolios importados. `snapshots` viene
 * de `portafolioHistorial` (un import ya pisa cualquier otro de la misma fecha, así
 * que acá siempre hay como máximo un valor por día). "Diaria" compara los últimos dos
 * snapshots disponibles (no necesariamente días de calendario consecutivos, por
 * fines de semana/feriados sin import).
 *
 * "Semanal" es la diferencia dentro de la semana calendario en curso: desde el
 * LUNES (si ese día hay snapshot importado) hasta el último día con datos. Si
 * el lunes no tiene snapshot (feriado o día sin import), se usa el último
 * cierre previo disponible como base, pero la etiqueta sigue mostrando el
 * lunes. Si no hay ningún dato previo al último, no hay semanal para mostrar.
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
 * `semanal` compara el último snapshot de esta semana contra el del LUNES (si ese
 * día hay snapshot; si no, contra el último cierre previo), aunque el rango se
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
 * Activos nuevos o que aumentaron de cantidad respecto al último Portfolio
 * importado — posiciones totalmente nuevas (tipo "nueva") y aumentos sobre algo
 * que ya tenías (tipo "aumento", con `cantidadAgregada` = cuánto sumaste). Una
 * cantidad menor (venta parcial) o igual no cuenta como movimiento acá — esto es
 * específicamente "qué compraste", no cualquier cambio.
 *
 * Se compara la cartera VIVA contra el último Portfolio (no contra el Portfolio
 * anterior entre sí): los Portfolios son a fecha de liquidación (T+1/T+2) y suelen
 * quedar atrasados respecto a las operaciones cargadas del día, así que comparar
 * los dos últimos imports dejaría afuera las compras más recientes. El filtro por
 * `tenencias` además exige que la posición siga viva: lo que se compró y ya se
 * vendió no es una novedad de la cartera.
 */
export function calcularNuevasEnCartera(portafolioHistorial, tenencias) {
  if (!portafolioHistorial?.length) {
    return { movimientos: [], fechaAnterior: null, fechaUltimo: null };
  }
  const ultimo = portafolioHistorial[portafolioHistorial.length - 1];
  const cantidadAnteriorPorTicker = new Map(
    ultimo.tenencias.filter((h) => h.ticker).map((h) => [h.ticker, h.cantidad ?? 0])
  );

  // Una clave puede venir partida por sleeve (dos filas, mismo ticker): se
  // suma la cantidad por ticker antes de comparar y se devuelve una fila.
  const cantidadAhoraPorTicker = new Map();
  const filaPorTicker = new Map();
  for (const t of tenencias) {
    if (!t.ticker || t.esCash) continue;
    const cantidadAhora = t.cantidad ?? 0;
    if (cantidadAhora <= 0) continue;
    cantidadAhoraPorTicker.set(t.ticker, (cantidadAhoraPorTicker.get(t.ticker) || 0) + cantidadAhora);
    if (!filaPorTicker.has(t.ticker)) filaPorTicker.set(t.ticker, t);
  }

  const cambiosPorTicker = new Map();
  for (const [ticker, cantidadAhora] of cantidadAhoraPorTicker) {
    const cantidadAntes = cantidadAnteriorPorTicker.get(ticker);
    if (cantidadAntes === undefined) {
      cambiosPorTicker.set(ticker, { tipo: "nueva", cantidadAgregada: cantidadAhora, pctAgregado: null });
    } else if (cantidadAhora > cantidadAntes) {
      const cantidadAgregada = cantidadAhora - cantidadAntes;
      cambiosPorTicker.set(ticker, {
        tipo: "aumento",
        cantidadAgregada,
        pctAgregado: cantidadAntes > 0 ? cantidadAgregada / cantidadAntes : null,
      });
    }
  }

  const movimientos = [...cambiosPorTicker.keys()]
    .map((ticker) => ({ ...filaPorTicker.get(ticker), ...cambiosPorTicker.get(ticker) }));

  return { movimientos, fechaAnterior: ultimo.fecha, fechaUltimo: ultimo.fecha };
}
