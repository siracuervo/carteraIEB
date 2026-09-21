"use client";

import { useActionState, useEffect, useState } from "react";
import { agregarMovimientoFondo } from "@/app/actions";
import InputFechaCalendario from "./InputFechaCalendario";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** Carga un ingreso o retiro de dinero (por fuera del mercado): entra a caja de inmediato. */
export default function FormularioFondos() {
  const [estado, formAction, pendiente] = useActionState(agregarMovimientoFondo, estadoInicial);
  const [fecha, setFecha] = useState("");
  useEffect(() => {
    if (estado?.exito) setFecha("");
  }, [estado?.exito]);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Tipo *
          <select name="tipo" defaultValue="ingreso" className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="ingreso">Ingreso (deposité / transferí a la cuenta)</option>
            <option value="retiro">Retiro (saqué plata de la cuenta)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Fecha *
          <InputFechaCalendario name="fecha" required value={fecha} onChange={setFecha} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Monto ARS *
          <input
            type="number"
            name="monto"
            required
            min="0"
            step="any"
            placeholder="Ej. 2000000"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Nota (opcional)
          <input
            name="nota"
            maxLength={120}
            placeholder="Ej. sueldo de octubre"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Estrategia *
          <select name="destino" required defaultValue="" className="rounded border px-2 py-1 text-sm" style={estiloInput}>
            <option value="" disabled>¿A qué estrategia va (o de cuál sale)?</option>
            <option value="trading">Trading</option>
            <option value="largo">Largo plazo</option>
            <option value="rentaFija">Renta fija</option>
          </select>
        </label>
      </div>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          Listo — {estado.exito.tipo === "ingreso" ? "ingreso" : "retiro"} de{" "}
          {formatoARS.format(estado.exito.monto)} guardado.
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--marca)" }}
      >
        {pendiente ? "Guardando…" : "Agregar movimiento"}
      </button>
    </form>
  );
}
