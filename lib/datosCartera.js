import { cache } from "react";
import { leerTransacciones, leerClasificaciones, leerPortafolioHistorial } from "./storage.js";
import {
  calcularTenencias,
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
import { obtenerPrecios, obtenerTipoCambioCCL } from "./precios.js";
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

/**
 * Junta todo lo que necesitan las pestañas del dashboard. La fuente de verdad de
 * "qué tengo hoy" es el último import de Portafolio (ya viene calculado por IEB,
 * sin que tengamos que reconstruir nada). Si todavía no se importó ningún
 * Portafolio, caemos al motor viejo que reconstruye la posición a partir de las
 * transacciones — menos confiable, pero mejor que nada mientras tanto. Las
 * transacciones siguen siendo la única fuente para el historial de "Ventas realizadas".
 */
export const obtenerDatosCartera = cache(async function obtenerDatosCartera() {
  const [transacciones, overrides, portafolioHistorial] = await Promise.all([
    leerTransacciones(),
    leerClasificaciones(),
    leerPortafolioHistorial(),
  ]);

  if (!transacciones.length && !portafolioHistorial.length) {
    return { vacio: true };
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
    // Si ya se importaron compras/ventas posteriores a la fecha del último
    // Portafolio (típicamente el export de "Operaciones del día" del día siguiente),
    // se aplican ENCIMA de las posiciones — así la pantalla refleja la actividad del
    // día sin esperar a que se reimporte el Portafolio de hoy.
    const base = construirTenenciasDesdePortafolio(ultimoPortafolio, overrides);
    const proyeccion = proyectarOperacionesSobrePortafolio(ultimoPortafolio, transaccionesResueltas, overrides);
    if (proyeccion.hubo && firmaTenencias(proyeccion.tenencias) !== firmaTenencias(base)) {
      tenencias = proyeccion.tenencias;
      proyeccionOperaciones = true;
      proyeccionDesdeFecha = ultimoPortafolio.fecha;
    } else {
      tenencias = base;
    }
    fuentePosiciones = "portafolio";
    tipoCambioCCL = tenencias.find((t) => t.ticker === "DOLARUSA")?.precioActual ?? null;

    // Cantidad y costo promedio siguen viniendo del Portfolio (incluyen
    // comisiones, es lo más confiable) — pero el precio ahí queda congelado a
    // la fecha del último import. Se refresca con cotización en vivo cuando
    // hay disponible, para que "Valor actual"/"Retorno" no se atrasen.
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
  // (no el actual): derivamos un CCL efectivo ponderado por monto por activo y lo
  // aplicamos sobre el mismo costo promedio ARS que muestra la columna en pesos,
  // sin importar si la posición viene del Portafolio de IEB o de las transacciones.
  if (transacciones.length) {
    const cclHistoricoPorClave = await calcularCCLHistoricoPorClave(transaccionesResueltas);
    tenencias = tenencias.map((t) => {
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
    });
  }

  // "Días de tenencia" de cada posición vigente: camina la serie diaria de
  // cantidades del historial de Portafolios (los aumentos son lotes, las bajas
  // consumen los más viejos) y le aplica FIFO solo a las operaciones posteriores
  // a la última foto. Así una venta de hoy consume lo que se venía holdeando y
  // las compras de hoy quedan datadas hoy — los exports de IEB pueden arrancar
  // mid-folio y vender posición previa sin compra registrada, así que reconstruir
  // los lotes desde cero desde los movimientos "mantiene" acciones que ya se vendieron.
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
    // El total que reporta IEB es más confiable que la suma de nuestras filas
    // (incluye cualquier detalle que no hayamos modelado) — pero solo mientras
    // no hayamos refrescado precios en vivo, porque ahí sí conviene que el
    // total coincida con lo que muestra la tabla, no con la foto vieja del import.
    resumen.valorTotalARS = ultimoPortafolio.patrimonioTotal;
  }

  const ventasRealizadas = transaccionesResueltas.length ? await calcularVentasRealizadas(transaccionesResueltas, overrides) : [];

  const hoyISO = aISO(new Date());

  // "Resultados del día": por defecto hoy; si todavía no hubo operaciones hoy
  // (mercado cerrado / día sin movimientos) se muestra el último día operado.
  let resultadosDia = null;
  if (transaccionesResueltas.length) {
    const fechasOperadas = transaccionesResueltas.map((t) => t.fecha).filter(Boolean);
    const dia = fechasOperadas.includes(hoyISO) ? hoyISO : fechasOperadas.reduce((a, b) => (b > a ? b : a), "");
    if (dia) {
      resultadosDia = await calcularResultadosDelDia(transaccionesResueltas, dia, preciosDisponibles, overrides);
      resultadosDia.esHoy = dia === hoyISO;
      // "Resultado del día" se arma desde las operaciones (realizado + no realizado de
      // las compras de hoy). A las posiciones que ya se tenían y hoy no se operaron
      // (renta fija, etc.) les sumamos su variación del día — precio de ayer → hoy —
      // para que el total refleje el rendimiento de toda la tenencia vigente. Las
      // cantidades compradas ese día quedan afuera (su resultado ya se cuenta en "a
      // mercado"). Vale tanto para hoy como cuando el panel cae al último día operado
      // (ej. de madrugada o mercado cerrado): el porcentaje en vivo es el de la última
      // rueda, que es justo el día que se está mostrando.
      if (tenencias.length) {
        // Cantidad comprada hoy que sigue abierta, por clave (ya valuada por calcularResultadosDelDia).
        const pendienteHoy = new Map();
        for (const tr of resultadosDia.trades || []) {
          if (tr.tipo !== "compra") continue;
          pendienteHoy.set(tr.clave, (pendienteHoy.get(tr.clave) ?? 0) + (tr.cantidadPendiente ?? 0));
        }
        let rendimientoTenencia = 0;
        const rendimientosTenencia = [];
        for (const t of tenencias) {
          if (t.esCash || t.cantidad == null) continue;
          const pct = t.variacionDiariaPct ?? null;
          if (pct == null || t.precioActual == null || t.precioActual <= 0) continue;
          const pendiente = pendienteHoy.get(t.clave) ?? 0;
          const cantidadBase = Math.max(0, t.cantidad - pendiente);
          if (cantidadBase <= 0) continue;
          // precioAyer = precioHoy / (1 + pct); variación = (precioHoy − precioAyer) × qty × factor.
          const factor = factorPrecioPorClase(t.claseActivo);
          const precioAyer = t.precioActual / (1 + pct);
          const resultado = (t.precioActual - precioAyer) * cantidadBase * factor;
          // La renta fija se lista a modo informativo pero NO se suma al "Resultado
          // del día" (mosaico): su cotización diaria no es comparable con la de
          // acciones/CEDEARs. Queda visible en la tabla con `computa: false`.
          const esRentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
          if (!esRentaFija) rendimientoTenencia += resultado;
          rendimientosTenencia.push({
            clave: t.clave,
            ticker: t.ticker,
            activo: t.activo,
            claseActivo: t.claseActivo,
            divisa: t.divisa,
            cantidad: cantidadBase,
            precioAyer,
            precioActual: t.precioActual,
            variacionDiariaPct: pct,
            resultado,
            computa: !esRentaFija,
          });
        }
        rendimientosTenencia.sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado));
        resultadosDia.totals.rendimientoTenencia = rendimientoTenencia;
        resultadosDia.rendimientosTenencia = rendimientosTenencia;
      }
    }
  }

  const tenenciasConPeso = tenencias.map((t) => ({
    ...t,
    pctCartera: resumen.valorTotalARS > 0 && t.valorActualARS != null ? t.valorActualARS / resumen.valorTotalARS : null,
  }));

  const porSector = calcularDistribucion(tenencias, "sector");
  const nuevasEnCartera = calcularNuevasEnCartera(portafolioHistorial, tenenciasConPeso);

  const snapshots = portafolioHistorial.map((h) => ({ fecha: h.fecha, valorTotalARS: h.patrimonioTotal }));

  // Fecha a la que corresponde la posición viva que valuamos arriba: si se
  // proyectaron operaciones posteriores al último Portafolio, es el día del último
  // movimiento; si no, el día del import. El visor de evolución necesita ese día como
  // snapshot (ej. operaste el 16/09 y todavía no importaste el Portafolio del 16: sin
  // esto queda un hueco y el día no se puede seleccionar).
  const fechaPosicionViva = ultimoPortafolio
    ? proyeccionOperaciones
      ? transaccionesResueltas
          .map((t) => t.fecha)
          .filter((f) => f && f > ultimoPortafolio.fecha)
          .reduce((a, b) => (b > a ? b : a), ultimoPortafolio.fecha)
      : ultimoPortafolio.fecha
    : null;

  // El total en vivo reemplaza el del Portafolio importado hoy (quedó congelado a
  // media rueda) y, si la posición es de un día sin Portafolio importado, agrega ese
  // día y el de hoy para que ambos queden seleccionables en la evolución. No se
  // persiste en portafolioHistorial.json: no es un cierre confirmado.
  if (preciosEnVivo && ultimoPortafolio) {
    const valorVivo = resumen.valorTotalARS;
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
  };
});
