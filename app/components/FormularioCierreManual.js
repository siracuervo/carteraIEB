"use client";

import { useActionState } from "react";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/** Cierre manual para tickers sin API (ej. TMF27): ticker + fecha + precio. */
export default function FormularioCierreManual({ accion }) {
  const [estado, formAction, pendiente] = useActionState(accion, estadoInicial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Ticker
          <input
            name="ticker"
            required
            placeholder="Ej. TMF27"
            className="rounded border px-2 py-1 text-sm uppercase"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha
          <input name="fecha" type="date" required className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Precio de cierre
          <input
            name="precio"
            type="number"
            min="0"
            step="any"
            required
            placeholder="Ej. 122.7"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
      </div>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          Listo — {estado.exito.ticker} al {estado.exito.fecha}: {estado.exito.precio}.
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--marca)" }}
      >
        {pendiente ? "Guardando…" : "Guardar cierre"}
      </button>
    </form>
  );
}
