"use client";

import { useActionState } from "react";
import { agregarOperacionManual } from "@/app/actions";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/** Formulario para cargar una operación (compra o venta) a mano, sin depender del export de IEB. */
export default function FormularioOperacionManual() {
  const [estado, formAction, pendiente] = useActionState(agregarOperacionManual, estadoInicial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Nombre del activo *
          <input
            name="activo"
            required
            placeholder="Ej. CEDEAR NVIDIA CORPORATION"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Ticker (opcional)
          <input
            name="ticker"
            placeholder="Ej. NVDA"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Operación *
          <select name="operacion" defaultValue="compra" className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="compra">Compra</option>
            <option value="venta">Venta</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha *
          <input type="date" name="fecha" required className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Hora (opcional)
          <input type="time" name="hora" className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Cantidad *
          <input
            type="number"
            name="cantidad"
            required
            min="0"
            step="any"
            placeholder="Ej. 50"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Precio *
          <input
            type="number"
            name="precio"
            required
            min="0"
            step="any"
            placeholder="Ej. 15230.5"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Importe ARS (opcional)
          <input
            type="number"
            name="importe"
            min="0"
            step="any"
            placeholder="Si lo dejás vacío se estima Precio × Cantidad"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Divisa
          <select name="divisa" defaultValue="ARS" className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Dólar CCL del día (opcional)
          <input
            type="number"
            name="ccl"
            min="0"
            step="any"
            placeholder="Ej. 1594.6 — si lo cargás, se usa para esa compra"
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
          Listo — {estado.exito.operacion === "compra" ? "compra" : "venta"} de {estado.exito.activo} guardada. Si no
          cargaste el ticker, se enlaza sola con el activo correspondiente del Portafolio.
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--marca)" }}
      >
        {pendiente ? "Guardando…" : "Agregar operación"}
      </button>
    </form>
  );
}