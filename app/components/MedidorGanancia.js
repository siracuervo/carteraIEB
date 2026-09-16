"use client";

import { useState } from "react";
import { fechaLocal } from "@/lib/fechas";
import { ACCESOS_RAPIDOS_FECHA } from "@/lib/accesosRapidosFecha";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

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
 * Medidor de ganancia entre dos periodos elegidos por el usuario. Usa los
 * Portfolios importados (los mismos puntos del gráfico, con todo el historial,
 * no solo los 30 días): para cada fecha elegida toma la foto más cercana.
 */
export default function MedidorGanancia({ snapshots }) {
  const puntos = (snapshots || []).filter((p) => p.fecha && p.valorTotalARS != null);
  const [desde, setDesde] = useState(puntos[0]?.fecha || "");
  const [hasta, setHasta] = useState(puntos[puntos.length - 1]?.fecha || "");

  if (!puntos.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Ganancia entre periodos</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
  }

  const fechaInicio = puntos[0].fecha;
  const fechaFin = puntos[puntos.length - 1].fecha;

  function fijar(nuevoDesde, nuevoHasta) {
    const c = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
    setDesde(c(nuevoDesde));
    setHasta(c(nuevoHasta));
  }

  const periodoInvalido = desde && hasta && hasta < desde;

  let idxDesde = 0;
  let idxHasta = puntos.length - 1;
  let delta = null;
  let pct = null;
  let dias = null;
  if (!periodoInvalido && desde && hasta) {
    idxDesde = indiceDesde(puntos, desde);
    idxHasta = indiceHasta(puntos, hasta);
    if (idxDesde > idxHasta) idxHasta = idxDesde;
    const vDesde = puntos[idxDesde].valorTotalARS;
    const vHasta = puntos[idxHasta].valorTotalARS;
    delta = vHasta - vDesde;
    if (vDesde > 0) pct = (delta / vDesde) * 100;
    const f1 = fechaLocal(puntos[idxDesde].fecha);
    const f2 = fechaLocal(puntos[idxHasta].fecha);
    dias = Math.round((f2 - f1) / 86400000);
  }

  const color = delta == null ? "var(--text-muted)" : delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-muted)";
  const signo = delta != null && delta > 0 ? "+" : "";

  const baja = Math.min(puntos[idxDesde]?.valorTotalARS ?? 0, puntos[idxHasta]?.valorTotalARS ?? 0);
  const alta = Math.max(puntos[idxDesde]?.valorTotalARS ?? 0, puntos[idxHasta]?.valorTotalARS ?? 0);
  const span = alta - baja;
  const pctDesde = span === 0 ? 0 : ((puntos[idxDesde].valorTotalARS - baja) / span) * 100;
  const pctHasta = span === 0 ? 100 : ((puntos[idxHasta].valorTotalARS - baja) / span) * 100;
  const minPct = Math.min(pctDesde, pctHasta);
  const maxPct = Math.max(pctDesde, pctHasta);

  const estiloInput = {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
    color: "var(--text-primary)",
  };

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Ganancia entre periodos</h3>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Desde
          <input type="date" value={desde} min={fechaInicio} max={fechaFin} style={estiloInput} className="rounded border px-2 py-1 text-sm" onChange={(e) => fijar(e.target.value, hasta)} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Hasta
          <input type="date" value={hasta} min={fechaInicio} max={fechaFin} style={estiloInput} className="rounded border px-2 py-1 text-sm" onChange={(e) => fijar(desde, e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {ACCESOS_RAPIDOS_FECHA.map(({ etiqueta, calcular }) => {
          const rango = calcular(fechaInicio);
          const activo = desde === rango.desde && hasta === rango.hasta;
          return (
            <button
              key={etiqueta}
              type="button"
              onClick={() => fijar(rango.desde, rango.hasta)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: activo ? "var(--marca)" : "var(--border)",
                background: activo ? "var(--marca-suave)" : "var(--surface-1)",
                color: activo ? "var(--marca)" : "var(--text-secondary)",
              }}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>

      {periodoInvalido ? (
        <p className="mt-4 text-sm" style={{ color: "var(--bad)" }}>
          La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
        </p>
      ) : delta != null ? (
        <div className="mt-4">
          <div style={{ color }}>
            <span className="text-3xl font-semibold tabular-nums">
              {pct != null ? `${signo}${(pct || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
          </div>
          <div className="mt-1 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {delta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(delta))}`}
            {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
          </div>

          <div className="mt-4">
            <div className="relative h-3 w-full rounded-full" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div
                className="absolute bottom-0 top-0 rounded-full"
                style={{ left: `${minPct}%`, width: `${Math.max(1, maxPct - minPct)}%`, background: color, opacity: 0.7 }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>
                {formatoFecha.format(fechaLocal(puntos[idxDesde].fecha))} · {formatoARS.format(puntos[idxDesde].valorTotalARS)}
              </span>
              <span>
                {formatoFecha.format(fechaLocal(puntos[idxHasta].fecha))} · {formatoARS.format(puntos[idxHasta].valorTotalARS)}
              </span>
            </div>
          </div>

          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            Se usan tus Portfolios importados; para cada fecha se toma la foto más cercana. El del día de hoy, si todavía
            no importaste el cierre, se estima con la última cotización en vivo.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Elegí el periodo para ver la ganancia.</p>
      )}
    </div>
  );
}