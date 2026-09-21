"use client";

import { useActionState, useState } from "react";
import { agregarOperacionManual } from "@/app/actions";

const estadoInicial = { error: null, exito: null };

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/** Fecha de hoy en formato ISO (YYYY-MM-DD), en hora local. */
function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Carga manual de operaciones: renta variable, renta fija (bonos) o caución (tasa y plazo, sin precio ni cantidad). */
export default function FormularioOperacionManual() {
  const [estado, formAction, pendiente] = useActionState(agregarOperacionManual, estadoInicial);
  const [activo, setActivo] = useState("");
  // Fecha por defecto: hoy (se recalcula en cada render del servidor, que es
  // dinámico, así que siempre coincide con el día de la request).
  const [fecha, setFecha] = useState(hoyISO);
  const [tipo, setTipo] = useState("variable");
  const [tipoCaucion, setTipoCaucion] = useState("colocacion");

  const esCaucion = tipo === "caucion";

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "variable", etiqueta: "Renta variable" },
          { id: "rentaFija", etiqueta: "Renta fija (bono)" },
          { id: "caucion", etiqueta: "Caución" },
        ].map((o) => {
          const seleccionado = tipo === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setTipo(o.id)}
              className="cursor-pointer rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: seleccionado ? "var(--marca)" : "var(--border)",
                background: seleccionado ? "var(--marca-suave)" : "var(--surface-1)",
                color: seleccionado ? "var(--marca)" : "var(--text-secondary)",
              }}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>

      <div key={tipo} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {esCaucion ? (
          <>
            <input type="hidden" name="activo" value="Caución" />
            <input type="hidden" name="ticker" value="CAUCION" />
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Movimiento *
              <select name="tipoCaucion" value={tipoCaucion} onChange={(e) => setTipoCaucion(e.target.value)} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
                <option value="colocacion">Colocación (sale de caja)</option>
                <option value="vencimiento">Vencimiento (entra a caja con interés)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Fecha *
              <input
                type="date"
                name="fecha"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded border px-2 py-1 text-sm"
                style={estiloInput}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Monto ARS * {tipoCaucion === "vencimiento" && <span style={{ color: "var(--text-muted)" }}>(total cobrado)</span>}
              <input
                type="number"
                name="monto"
                required
                min="0"
                step="any"
                placeholder="Ej. 1500000"
                className="rounded border px-2 py-1 text-sm"
                style={estiloInput}
              />
            </label>
            {tipoCaucion === "colocacion" && (
              <>
                <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  Tasa TNA % anual *
                  <input
                    type="number"
                    name="tasa"
                    required
                    min="0"
                    step="any"
                    placeholder="Ej. 32.5"
                    className="rounded border px-2 py-1 text-sm"
                    style={estiloInput}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  Plazo (días) *
                  <input
                    type="number"
                    name="plazoDias"
                    required
                    min="1"
                    step="1"
                    placeholder="Ej. 7"
                    className="rounded border px-2 py-1 text-sm"
                    style={estiloInput}
                  />
                </label>
              </>
            )}
            <input type="hidden" name="sleeve" value="rentaFija" />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              La caución va siempre a renta fija — no hay estrategia para elegir.
            </p>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Nombre del activo *
              <input
                name="activo"
                required
                value={activo}
                onChange={(e) => setActivo(e.target.value)}
                placeholder={tipo === "rentaFija" ? "Ej. TMF27 o BONO TESORO NACIONAL TAMAR" : "Ej. MSFT o CEDEAR NVIDIA CORPORATION"}
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
              <input
                type="date"
                name="fecha"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded border px-2 py-1 text-sm"
                style={estiloInput}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Hora (opcional)
              <input type="time" name="hora" defaultValue="" className="rounded border px-2 py-1 text-sm" style={estiloInput} />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Cantidad * {tipo === "rentaFija" && <span style={{ color: "var(--text-muted)" }}>(nominal)</span>}
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
              Precio * {tipo === "rentaFija" && <span style={{ color: "var(--text-muted)" }}>(cada 100 nominal)</span>}
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
                placeholder="Si lo dejás vacío se estima Precio × Cantidad + derechos"
                className="rounded border px-2 py-1 text-sm"
                style={estiloInput}
              />
            </label>
            {tipo === "rentaFija" ? (
              <>
                <input type="hidden" name="sleeve" value="rentaFija" />
                <p className="text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>
                  Los bonos van siempre a renta fija — no hay estrategia para elegir.
                </p>
              </>
            ) : (
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }} title="En compras: a qué estrategia entra el lote. En ventas: de qué estrategia sale.">
                Estrategia * (lote)
                <select name="sleeve" defaultValue="trading" className="rounded border px-2 py-1 text-sm" style={estiloInput}>
                  <option value="trading">Trading</option>
                  <option value="largo">Largo plazo</option>
                </select>
              </label>
            )}
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
          </>
        )}
      </div>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          Listo — {estado.exito.operacion === "compra" ? "compra" : estado.exito.operacion === "colocacion" ? "colocación" : estado.exito.operacion === "vencimiento" ? "vencimiento" : "venta"} de {estado.exito.activo} guardada. Se enlaza
          sola con el activo correspondiente.
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
