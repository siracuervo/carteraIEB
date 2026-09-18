"use client";

import { useMemo, useState } from "react";
import ValorSensible from "./ValorSensible";
import { CLASES } from "@/lib/clasificacion";
import { factorPrecioPorClase } from "@/lib/calculos";
import { fechaLocal } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoPrecioARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 6 });
const formatoPrecioARSsinDecimales = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatoMoneda(valor, divisa) {
  if (valor == null) return "—";
  return divisa === "USD" ? formatoUSD.format(valor) : formatoARS.format(valor);
}

function formatoPrecio(valor, divisa, claseActivo) {
  if (valor == null) return "—";
  if (divisa === "USD") return formatoUSD.format(valor);
  return claseActivo === CLASES.CEDEAR ? formatoPrecioARSsinDecimales.format(valor) : formatoPrecioARS.format(valor);
}

function aPartes(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function diasEntre(desde, hasta) {
  const a = aPartes(desde);
  const b = aPartes(hasta);
  return Math.round((new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d)) / 86400000);
}

/** Precio unitario en la escala del activo (bonos cada 100 de nominal). */
function precioDe(p, factorPrecio) {
  if (p.precio != null) return p.precio;
  if (p.cantidad > 0 && p.valor != null && factorPrecio > 0) return p.valor / p.cantidad / factorPrecio;
  return null;
}

/** Valor más cercano con fecha <= a la pedida, o el primero si no hay ninguno. */
function indiceDesde(puntos, iso) {
  let idx = -1;
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].fecha <= iso) idx = i;
  }
  return idx === -1 ? 0 : idx;
}

/** Valor más cercano con fecha >= a la pedida, o el último si no hay ninguno. */
function indiceHasta(puntos, iso) {
  const idx = puntos.findIndex((p) => p.fecha >= iso);
  return idx === -1 ? puntos.length - 1 : idx;
}

/**
 * Tenencia actual del ticker + ganancia entre dos fechas a elección. Usa los
 * Portfolios importados (foto más cercana a cada fecha elegida) y cierra con el
 * valor actual en vivo.
 */
export default function GananciaTenencia({ ticker, cantidad, precioActual, valorActual, costoPromedio, gananciaNoRealizada, retornoPct, divisa, claseActivo, puntos, fechaActual, movimientos }) {
  const factor = factorPrecioPorClase(claseActivo);

  const trades = useMemo(() => [...(movimientos || [])]
    .filter((m) => m.fecha && m.cantidad != null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha)), [movimientos]);

  /**
   * Inicio de la tenencia VIGENTE: último momento en que la cantidad pasó de
   * cero (o menos) a positiva sin volver a cortarse después. Vale tener una
   * parte (ej. 246k de 7,4M): lo que no vale es pedir una fecha donde la
   * cantidad era cero. Los tramos viejos ya cerrados no cuentan. null si los
   * movimientos no alcanzan para determinarlo.
   */
  const inicioVigente = useMemo(() => {
    let acum = 0;
    let inicio = null;
    for (const m of trades) {
      const antes = acum;
      acum += m.cantidad;
      if (antes <= 0 && acum > 0) inicio = m.fecha;
      else if (antes > 0 && acum <= 0) inicio = null;
    }
    return acum > 0 ? inicio : null;
  }, [trades]);

  const serie = useMemo(() => {
    const base = [...(puntos || [])]
      .filter((p) => p.fecha && p.valor != null && (inicioVigente == null || p.fecha >= inicioVigente))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (fechaActual && valorActual != null && (!base.length || fechaActual >= base[base.length - 1].fecha)) {
      const sinUltimo = base.length && base[base.length - 1].fecha === fechaActual ? base.slice(0, -1) : base;
      return [...sinUltimo, { fecha: fechaActual, valor: valorActual, precio: precioActual, cantidad }];
    }
    return base;
  }, [puntos, fechaActual, valorActual, precioActual, cantidad, inicioVigente]);

  const fechaInicio = serie[0]?.fecha || "";
  const fechaFin = serie[serie.length - 1]?.fecha || "";

  const inicioTenencia = inicioVigente || fechaInicio;
  const [desde, setDesde] = useState(inicioTenencia);
  const [hasta, setHasta] = useState(fechaFin);

  function fijar(nuevoDesde, nuevoHasta) {
    const c = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
    setDesde(c(nuevoDesde));
    setHasta(c(nuevoHasta));
  }

  function irAlInicio() {
    fijar(inicioTenencia, fechaFin);
  }

  /** ¿La tenencia vigente existía en esa fecha? null si no se puede afirmar. */
  function teniaEn(fecha) {
    if (!trades.length || inicioVigente == null) return null;
    return fecha >= inicioVigente;
  }

  const periodoInvalido = desde && hasta && hasta < desde;
  const faltaDesde = !periodoInvalido && desde && teniaEn(desde) === false;
  const faltaHasta = !periodoInvalido && !faltaDesde && hasta && teniaEn(hasta) === false;
  const fechaFaltante = faltaDesde ? desde : faltaHasta ? hasta : null;

  let idxDesde = 0;
  let idxHasta = serie.length - 1;
  let delta = null;
  let pct = null;
  let dias = null;
  let precioDesde = null;
  let precioHasta = null;
  let sinPrecio = false;
  let esCostoBase = false;
  // Desde el inicio de la tenencia vigente contra el costo promedio (lo mismo
  // que muestra la pantalla principal): así el número coincide con el Retorno
  // de la cartera en vez de compararse con una foto vieja de otro tramo.
  // Para periodos personalizados se usa el precio de la foto más cercana, que
  // no cuenta las compras como ganancia.
  if (!periodoInvalido && !fechaFaltante && desde && hasta && serie.length) {
    if (inicioVigente != null && desde <= inicioVigente && hasta === fechaFin && costoPromedio != null) {
      esCostoBase = true;
      precioDesde = costoPromedio;
      precioHasta = precioActual;
      pct = retornoPct;
      delta = gananciaNoRealizada;
      if (pct == null && precioDesde > 0 && precioHasta != null) pct = precioHasta / precioDesde - 1;
      dias = diasEntre(inicioVigente, fechaFin);
    } else {
      idxDesde = indiceDesde(serie, desde);
      idxHasta = indiceHasta(serie, hasta);
      if (idxDesde > idxHasta) idxHasta = idxDesde;
      precioDesde = precioDe(serie[idxDesde], factor);
      precioHasta = precioDe(serie[idxHasta], factor);
      if (precioDesde != null && precioHasta != null) {
        if (precioDesde > 0) pct = precioHasta / precioDesde - 1;
        if (cantidad > 0) delta = (precioHasta - precioDesde) * cantidad * factor;
      } else {
        sinPrecio = true;
      }
      dias = diasEntre(serie[idxDesde].fecha, serie[idxHasta].fecha);
    }
  }

  const color = delta == null ? "var(--text-muted)" : delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-muted)";

  const estiloInput = {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
    color: "var(--text-primary)",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded px-2 py-0.5 text-xs font-bold"
          style={{ background: "var(--marca-suave)", color: "var(--marca)" }}
        >
          EN TENENCIA ACTUAL
        </span>
        {inicioVigente && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            desde el {formatoFecha.format(fechaLocal(inicioVigente))}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Cantidad actual</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            <ValorSensible>{(cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Precio actual</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatoPrecio(precioActual, divisa, claseActivo)}
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Valor actual</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            <ValorSensible>{formatoMoneda(valorActual, "ARS")}</ValorSensible>
          </div>
        </div>
      </div>

      {serie.length > 1 ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Desde
              <input type="date" value={desde} min={fechaInicio} max={fechaFin} style={estiloInput} className="w-full min-w-0 rounded border px-2 py-0.5 text-sm" onChange={(e) => fijar(e.target.value, hasta)} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Hasta
              <input type="date" value={hasta} min={fechaInicio} max={fechaFin} style={estiloInput} className="w-full min-w-0 rounded border px-2 py-0.5 text-sm" onChange={(e) => fijar(desde, e.target.value)} />
            </label>
            <div className="flex min-w-0 flex-1 items-end pb-0.5">
              <button
                type="button"
                onClick={irAlInicio}
                className="shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
              >
                Desde el inicio
              </button>
            </div>
          </div>

          {fechaFaltante ? (
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
              El {formatoFecha.format(fechaLocal(fechaFaltante))} esta tenencia de {ticker} no existía. La tenés desde el {formatoFecha.format(fechaLocal(inicioVigente))}.
            </p>
          ) : periodoInvalido ? (
            <p className="mt-3 text-sm" style={{ color: "var(--bad)" }}>
              La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
            </p>
          ) : sinPrecio ? (
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Sin precio registrado para una de las fechas elegidas.
            </p>
          ) : delta != null || pct != null ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  <ValorSensible>{formatoPrecio(precioDesde, divisa, claseActivo)}</ValorSensible>
                  <span aria-hidden="true">→</span>
                  <ValorSensible>{formatoPrecio(precioHasta, divisa, claseActivo)}</ValorSensible>
                  <span style={{ color: "var(--text-muted)" }}>
                    {esCostoBase && inicioVigente
                      ? `· desde el inicio (${formatoFecha.format(fechaLocal(inicioVigente))})`
                      : `· ${formatoFecha.format(fechaLocal(serie[idxDesde].fecha))} → ${formatoFecha.format(fechaLocal(serie[idxHasta].fecha))}`}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm tabular-nums" style={{ color }}>
                    {delta != null ? <ValorSensible>{formatoARS.format(delta)}</ValorSensible> : "—"}
                  </span>
                  <span className="text-xl font-semibold tabular-nums" style={{ color }}>
                    {pct != null ? formatoPct.format(pct) : "—"}
                  </span>
                </div>
              </div>
              {dias != null && (
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {dias} {dias === 1 ? "día" : "días"} · para cada fecha se toma el precio del Portfolio o cierre más cercano
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Elegí el periodo para ver la ganancia.</p>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no hay Portfolios importados con este activo para calcular ganancias por periodo.
        </p>
      )}
    </div>
  );
}
