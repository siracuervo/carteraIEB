"use client";

import { useActionState } from "react";
import { editarOperacion } from "@/app/actions";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

function esCompra(t) {
  return (t.operacion || "").toUpperCase().includes("COMPRA");
}

/** Formulario para corregir a mano una operación ya guardada (fecha, cantidad, precio, importe, divisa, CCL). */
export default function FormEditarOperacion({ transaccion, onCancelar }) {
  const [estado, formAction, pendiente] = useActionState(editarOperacion, estadoInicial);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <input type="hidden" name="clave" value={transaccion.clave} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          Editar operación
          {transaccion.ticker || transaccion.activo ? ` · ${transaccion.ticker || transaccion.activo}` : ""}
        </p>
        <button type="button" onClick={onCancelar} className="cursor-pointer text-xs underline" style={{ color: "var(--text-muted)" }}>
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha *
          <input type="date" name="fecha" required defaultValue={transaccion.fecha || ""} className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Hora (opcional)
          <input type="time" name="hora" defaultValue={transaccion.hora || ""} className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Operación *
          <select name="operacion" defaultValue={esCompra(transaccion) ? "compra" : "venta"} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="compra">Compra</option>
            <option value="venta">Venta</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Divisa
          <select name="divisa" defaultValue={transaccion.divisa || "ARS"} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Cantidad (absoluta) *
          <input type="number" name="cantidad" required min="0" step="any" defaultValue={Math.abs(transaccion.cantidad ?? 0)} className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Precio *
          <input type="number" name="precio" required min="0" step="any" defaultValue={transaccion.precio ?? ""} className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Importe ARS (opcional)
          <input
            type="number"
            name="importe"
            min="0"
            step="any"
            defaultValue={transaccion.importeARS != null ? Math.abs(transaccion.importeARS) : ""}
            placeholder={transaccion.importeARS == null ? "Sin importe — se estima Precio × Cantidad" : ""}
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Dólar CCL del día (opcional)
          <input
            type="number"
            name="ccl"
            min="0"
            step="any"
            defaultValue={transaccion.cclManual ?? ""}
            placeholder="El CCL usado en esa compra, si lo querés fijar"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Precio en USA (USD, opcional)
          <input
            type="number"
            name="precioUSD"
            min="0"
            step="any"
            defaultValue={transaccion.precioUSD ?? ""}
            placeholder="Cotización del subyacente en NYSE, en dólares"
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
          Listo — operación de {estado.exito.activo} actualizada.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--marca)" }}
        >
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}