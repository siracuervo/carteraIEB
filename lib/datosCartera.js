import { cache } from "react";
import { leerTransacciones, leerClasificaciones, leerPortafolioHistorial } from "./storage.js";
import {
  calcularTenencias,
  calcularResumen,
  calcularDistribucion,
  calcularVentasRealizadas,
  construirTenenciasDesdePortafolio,
  actualizarConPreciosVivos,
  calcularEvolucionPatrimonio,
  calcularEvolucionSemana,
  calcularSemanas,
  calcularSerieEvolucion,
  calcularNuevasEnCartera,
  resolverTickersConPortafolio,
  calcularCCLHistoricoPorClave,
  calcularResultadosDelDia,
} from "./calculos.js";
import { obtenerPrecios, obtenerTipoCambioCCL } from "./precios.js";
import { TICKERS_NO_MERCADO, CLASES } from "./clasificacion.js";
import { aISO } from "./accesosRapidosFecha.js";

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
  let tipoCambioCCL = null;
  let preciosEnVivo = false;
  let preciosDisponibles = new Map();
  if (ultimoPortafolio) {
    tenencias = construirTenenciasDesdePortafolio(ultimoPortafolio, overrides);
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
    }
  }

  const tenenciasConPeso = tenencias.map((t) => ({
    ...t,
    pctCartera: resumen.valorTotalARS > 0 && t.valorActualARS != null ? t.valorActualARS / resumen.valorTotalARS : null,
  }));

  const porSector = calcularDistribucion(tenencias, "sector");
  const nuevasEnCartera = calcularNuevasEnCartera(portafolioHistorial, tenenciasConPeso);

  const snapshots = portafolioHistorial.map((h) => ({ fecha: h.fecha, valorTotalARS: h.patrimonioTotal }));

  // Si el Portfolio de hoy ya se importó pero fue a media rueda, el patrimonioTotal
  // que trae el archivo queda congelado al precio de ese momento — no al cierre. En
  // vez de arrastrar ese número viejo en la evolución/histórico, el snapshot de hoy
  // se pisa con el mismo total en vivo que ya se usó para "Valor de cartera" arriba.
  if (preciosEnVivo && ultimoPortafolio && ultimoPortafolio.fecha === hoyISO) {
    snapshots[snapshots.length - 1] = { fecha: hoyISO, valorTotalARS: resumen.valorTotalARS };
  }

  // Todavía no se importó el Portfolio de hoy: en vez de dejar un agujero en la
  // evolución (que además ignoraría el movimiento del día que ya se está viendo en
  // "Valor de cartera"), sumamos un snapshot "de hoy" en memoria — misma posición de
  // `ultimoPortafolio` (la única que tenemos), revaluada con la cotización en vivo que
  // ya se usó para armar `resumen`. No se persiste en portafolioHistorial.json: no es
  // un cierre confirmado, solo lo mejor que se puede estimar hasta que llegue el import.
  if (preciosEnVivo && ultimoPortafolio && ultimoPortafolio.fecha !== hoyISO && !snapshots.some((s) => s.fecha === hoyISO)) {
    snapshots.push({ fecha: hoyISO, valorTotalARS: resumen.valorTotalARS, basadoEnFecha: ultimoPortafolio.fecha });
  }

  const evolucionPatrimonio = calcularEvolucionPatrimonio(snapshots);
  const evolucionSemana = calcularEvolucionSemana(snapshots);
  const semanasEvolucion = calcularSemanas(snapshots);
  const serieEvolucion = calcularSerieEvolucion(snapshots, 30);

  return {
    vacio: false,
    fuentePosiciones,
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
