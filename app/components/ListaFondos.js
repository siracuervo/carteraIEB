"use client";

import { useTransition } from "react";
import { quitarMovimientoFondo } from "@/app/actions";
import { fechaLocal } from "@/lib/fechas";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const ETIQUETA_DESTINO = { trading: "Trading", largo: "Largo plazo", rentaFija: "Renta fija" };

function BotonEliminar({ id }) {
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => start(async () => { await quitarMovimientoFondo(id); })}
      className="cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
      style={{ borderColor: "var(--marca)", color: "var(--marca)", background: "var(--surface-2)" }}
    >
      {pendiente ? "Quitando…" : "Eliminar"}
    </button>
  );
}

/** Movimientos de fondos cargados, con opción de eliminar. */
export default function ListaFondos({ fondos }) {
  if (!fondos?.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Todavía no hay movimientos de fondos.
      </p>
    );
  }
  const ordenados = [...fondos].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {ordenados.map((f) => {
            const esIngreso = f.tipo !== "retiro";
            return (
              <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {f.fecha ? formatoFecha.format(fechaLocal(f.fecha)) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
                    style={
                      esIngreso
                        ? { color: "var(--good)", background: "rgba(22, 163, 74, 0.08)" }
                        : { color: "var(--bad)", background: "rgba(220, 38, 38, 0.08)" }
                    }
                  >
                    {esIngreso ? "Ingreso" : "Retiro"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium" style={{ color: esIngreso ? "var(--good)" : "var(--bad)" }}>
                  {esIngreso ? "+" : "−"}{formatoARS.format(f.monto)}
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {ETIQUETA_DESTINO[f.destino] || (f.destino ? f.destino : "Renta fija")}
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {f.nota || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <BotonEliminar id={f.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
