"use client";

import { useActionState, useState, useEffect } from "react";
import { editarMovimientoFondo } from "@/app/actions";
import InputFechaCalendario from "./InputFechaCalendario";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

export default function FormEditarFondo({ fondo, onCancelar }) {
  const [estado, formAction, pendiente] = useActionState(editarMovimientoFondo, estadoInicial);
  const [fecha, setFecha] = useState(fondo.fecha || "");
  const [tipo, setTipo] = useState(fondo.tipo || "ingreso");

  useEffect(() => {
    if (estado?.exito) {
      // No auto-cerrar, dejar que el usuario vea el éxito y cierre manual
    }
  }, [estado?.exito]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <input type="hidden" name="id" value={fondo.id} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          Editar movimiento — {fondo.tipo === "retiro" ? "Retiro" : "Ingreso"} {fondo.monto ? `· ${fondo.monto}` : ""}
        </p>
        <button type="button" onClick={onCancelar} className="cursor-pointer text-xs underline" style={{ color: "var(--text-muted)" }}>
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Tipo *
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="ingreso">Ingreso</option>
            <option value="retiro">Retiro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha *
          <InputFechaCalendario name="fecha" required value={fecha} onChange={setFecha} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Monto ARS *
          <input type="number" name="monto" required min="0" step="any" defaultValue={fondo.monto ?? ""} className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Estrategia *
          <select name="destino" required defaultValue={fondo.destino || ""} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="" disabled>¿A qué estrategia va (o de cuál sale)?</option>
            <option value="trading">Trading</option>
            <option value="largo">Largo plazo</option>
            <option value="rentaFija">Renta fija</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2" style={{ color: "var(--text-secondary)" }}>
          Nota
          <input name="nota" maxLength={120} defaultValue={fondo.nota || ""} placeholder="Ej. sueldo de octubre" className="rounded border px-2 py-1 text-sm" style={estiloInput} />
        </label>
      </div>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          Listo — movimiento actualizado.
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
