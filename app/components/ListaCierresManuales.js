"use client";

import { useActionState, useState } from "react";
import { eliminarCierreManualAction, actualizarCierreManualAction } from "@/app/actions";

const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function fechaLocal(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function FilaEditable({ fecha, ticker, precio }) {
  const [editando, setEditando] = useState(false);
  const [estadoEdit, accionEdit, pendingEdit] = useActionState(actualizarCierreManualAction, { error: null, exito: null });
  const [estadoDel, accionDel, pendingDel] = useActionState(eliminarCierreManualAction, { error: null, exito: null });

  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {formatoFecha.format(fechaLocal(fecha))}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 font-medium" style={{ color: "var(--marca)" }}>
        {ticker}
      </td>
      <td className="px-3 py-1.5" style={{ minWidth: 220 }}>
        <form action={async (formData) => {
          await accionEdit(formData);
          setEditando(false);
        }} className="flex items-center justify-end gap-1.5">
          <input type="hidden" name="fecha" value={fecha} />
          <input type="hidden" name="ticker" value={ticker} />
          <input
            name="precio"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={String(precio)}
            disabled={!editando || pendingEdit}
            className="w-28 rounded-md border px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60"
            style={{
              borderColor: editando ? "var(--marca)" : "var(--border)",
              background: editando ? "var(--surface-1)" : "transparent",
              color: "var(--text-primary)",
            }}
          />
          {editando ? (
            <>
              <button
                type="submit"
                disabled={pendingEdit}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: "var(--marca)" }}
              >
                {pendingEdit ? "…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              Editar
            </button>
          )}
        </form>
        {estadoEdit?.error && <div className="mt-1 text-right text-xs" style={{ color: "var(--bad)" }}>{estadoEdit.error}</div>}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right">
        <form action={accionDel}>
          <input type="hidden" name="fecha" value={fecha} />
          <input type="hidden" name="ticker" value={ticker} />
          <button
            type="submit"
            disabled={pendingDel}
            className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
            style={{ borderColor: "var(--bad)", color: "var(--bad)" }}
          >
            Eliminar
          </button>
        </form>
        {estadoDel?.error && <div className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{estadoDel.error}</div>}
      </td>
    </tr>
  );
}

export default function ListaCierresManuales({ cierres }) {
  if (!cierres || typeof cierres !== "object" || !Object.keys(cierres).length) {
    return <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no guardaste cierres manuales.</p>;
  }
  const filas = [];
  for (const fecha of Object.keys(cierres).sort().reverse()) {
    const porTicker = cierres[fecha] || {};
    for (const ticker of Object.keys(porTicker).sort()) {
      filas.push({ fecha, ticker, precio: porTicker[ticker] });
    }
  }
  if (!filas.length) return <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no guardaste cierres manuales.</p>;
  return (
    <div className="mt-4 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div className="max-h-[280px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-1.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>Fecha</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ticker</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium" style={{ color: "var(--text-muted)" }}>Cierre</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium" style={{ color: "var(--text-muted)" }}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaEditable key={`${f.fecha}-${f.ticker}`} fecha={f.fecha} ticker={f.ticker} precio={f.precio} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
        {filas.length} cierres guardados
      </div>
    </div>
  );
}
