"use client";

import { fechaLocal } from "@/lib/fechas";
import ValorSensible from "./ValorSensible";
import { ajusteFlujosRentaFija } from "@/lib/calculos";

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

/** Última foto a la fecha o anterior (igual que desde): en días sin mercado
    (finde/feriado) vale el cierre previo, nunca una foto futura. Así una misma
    fecha siempre vale lo mismo esté en "desde" o en "hasta". */
function indiceHasta(puntos, iso) {
  let idx = -1;
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].fecha <= iso) idx = i;
  }
  return idx === -1 ? 0 : idx;
}

function puntosDe(snapshots) {
  return (snapshots || []).filter((p) => p.fecha && p.valorTotalARS != null);
}

/**
 * Medidor de ganancia total entre dos periodos elegidos (las fechas las maneja
 * el Panel). Usa los Portfolios importados con todo el historial: para cada
 * fecha elegida toma la última foto a esa fecha o anterior.
 */
export default function MedidorGanancia({ snapshots, desde, hasta }) {
  const puntos = puntosDe(snapshots);

  if (!puntos.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Ganancia entre periodos</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
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

  return (
    <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {periodoInvalido ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
        </p>
      ) : delta != null ? (
        <div>
          <div className="flex items-baseline gap-2" style={{ color }}>
            <span className="text-2xl font-semibold tabular-nums">
              {pct != null ? `${signo}${(pct || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              {delta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(delta))}`}
              {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
            </span>
          </div>

          <div className="mt-3">
            <div className="relative h-2 w-full rounded-full" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div
                className="absolute bottom-0 top-0 rounded-full"
                style={{ left: `${minPct}%`, width: `${Math.max(1, maxPct - minPct)}%`, background: color, opacity: 0.7 }}
              />
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>
                {formatoFecha.format(fechaLocal(puntos[idxDesde].fecha))} · {formatoARS.format(puntos[idxDesde].valorTotalARS)}
              </span>
              <span>
                {formatoFecha.format(fechaLocal(puntos[idxHasta].fecha))} · {formatoARS.format(puntos[idxHasta].valorTotalARS)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Elegí el periodo para ver la ganancia.</p>
      )}
    </div>
  );
}

/**
 * Ganancia de renta variable (CON efectivo: la fija está inmovilizada en bonos
 * y la caja sobró de trades) en el mismo periodo elegido. Netea los flujos
 * hacia renta fija para no leer una compra de bonos como pérdida.
 */
export function GananciaVariable({ snapshots, transacciones, fondos, desde, hasta }) {
  const puntos = puntosDe(snapshots);

  if (puntos.length < 1) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
  }

  const periodoInvalido = desde && hasta && hasta < desde;

  let varD = null;
  let varH = null;
  let varDelta = null;
  let varPct = null;
  let dias = null;
  if (!periodoInvalido && desde && hasta) {
    const idxDesde = indiceDesde(puntos, desde);
    const idxHasta = Math.max(indiceHasta(puntos, hasta), idxDesde);
    const pD = puntos[idxDesde];
    const pH = puntos[idxHasta];
    if (pD.rentaFijaARS != null && pH.rentaFijaARS != null) {
      const vD = pD.valorTotalARS;
      varD = vD - pD.rentaFijaARS - (pD.efectivoParaRF ?? 0);
      varH = pH.valorTotalARS - pH.rentaFijaARS - (pH.efectivoParaRF ?? 0);
      const flujo = ajusteFlujosRentaFija(transacciones, fondos, pD.fecha, pH.fecha);
      varDelta = (varH - varD) + flujo;
      varPct = varD > 0 ? varDelta / varD : null;
      const f1 = fechaLocal(pD.fecha);
      const f2 = fechaLocal(pH.fecha);
      dias = Math.round((f2 - f1) / 86400000);
    }
  }

  const color = varDelta == null ? "var(--text-muted)" : varDelta >= 0 ? "var(--good)" : "var(--bad)";
  const signo = varDelta != null && varDelta > 0 ? "+" : "";

  return (
    <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {periodoInvalido ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
        </p>
      ) : varDelta != null ? (
        <div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Renta variable <span style={{ color: "var(--text-muted)" }}>(con efectivo)</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2" style={{ color }}>
            <span className="text-2xl font-semibold tabular-nums">
              {varPct != null ? `${signo}${(varPct * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              {varDelta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(varDelta))}`}
              {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            <ValorSensible>{formatoARS.format(varD)}</ValorSensible>
            <span aria-hidden="true">→</span>
            <ValorSensible>{formatoARS.format(varH)}</ValorSensible>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {puntos.some((p) => p.rentaFijaARS == null)
            ? "Faltan datos de renta fija para este periodo."
            : "Elegí el periodo para ver la ganancia."}
        </p>
      )}
    </div>
  );
}
