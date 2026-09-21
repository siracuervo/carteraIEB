"use client";

import { useTransition } from "react";
import { quitarTraspasoEfectivo } from "@/app/actions";
import { fechaLocal } from "@/lib/fechas";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const ETIQUETA = { trading: "Trading", largo: "Largo plazo", rentaFija: "Renta fija" };

function BotonEliminar({ id }) {
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => start(async () => { await quitarTraspasoEfectivo(id); })}
      className="cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
      style={{ borderColor: "var(--marca)", color: "var(--marca)", background: "var(--surface-2)" }}
    >
      {pendiente ? "Quitando…" : "Eliminar"}
    </button>
  );
}

/** Traspasos internos de efectivo + saldos actuales por estrategia. */
export default function ListaTraspasos({ traspasos, saldos }) {
  const total = (saldos?.trading ?? 0) + (saldos?.largo ?? 0) + (saldos?.rentaFija ?? 0);
  const ordenados = [...(traspasos || [])].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {["trading", "largo", "rentaFija"].map((s) => {
          const v = saldos?.[s] ?? 0;
          const pct = total !== 0 ? v / total : 0;
          return (
            <div key={s} className="min-w-0 rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
              <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{ETIQUETA[s]}</div>
              <div className="mt-0.5 break-words text-xs sm:text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {formatoARS.format(v)}
              </div>
              <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {(pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
              </div>
            </div>
          );
        })}
      </div>

      {!ordenados.length ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no hay traspasos. El efectivo arranca 100% en trading.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {ordenados.map((t) => (
                <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap px-2 sm:px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.fecha ? formatoFecha.format(fechaLocal(t.fecha)) : "—"}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {ETIQUETA[t.desde] || t.desde} → {ETIQUETA[t.hacia] || t.hacia}
                  </td>
                  <td className="whitespace-nowrap px-2 sm:px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatoARS.format(t.monto)}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {t.nota || "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 sm:px-3 py-2 text-right">
                    <BotonEliminar id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
