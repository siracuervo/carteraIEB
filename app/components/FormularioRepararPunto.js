"use client";

import { useActionState } from "react";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/** Elimina el punto auto-guardado de una fecha: el gráfico vuelve a
 * reconstruirlo desde cierres/imports. Para reparar un día pisado por un
 * valor vivo (ej. la mañana siguiente superpuesta). */
export default function FormularioRepararPunto({ accion }) {
  const [estado, formAction, pendiente] = useActionState(accion, estadoInicial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha del punto a reparar
          <input name="fecha" type="date" required defaultValue="2026-09-22" className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pendiente}
            className="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--marca)" }}
          >
            {pendiente ? "Reparando…" : "Eliminar punto y reconstruir"}
          </button>
        </div>
      </div>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          Punto del {estado.exito.fecha} eliminado — recargá la home para ver el gráfico corregido.
        </p>
      )}
    </form>
  );
}
