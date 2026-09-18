"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Input de ticker con desplegable buscable de los tickers ya operados. Al elegir
 * uno, completa también el nombre del activo (si el campo está vacío o fue el
 * autocompletado anterior), para no tener que tipearlo.
 */
function SelectorTicker({ opciones, valor, onCambiar, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const contenedorRef = useRef(null);

  useEffect(() => {
    function alClickFuera(evento) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  const filtradas = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => `${o.ticker} ${o.activo || ""}`.toLowerCase().includes(q));
  }, [opciones, consulta]);

  return (
    <div ref={contenedorRef} className="relative">
      <input
        name="ticker"
        value={valor}
        onChange={(e) => {
          onCambiar(e.target.value);
          setConsulta(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => {
          setConsulta("");
          setAbierto(true);
        }}
        autoComplete="off"
        placeholder="Ej. NVDA — o elegí uno de la lista"
        className="w-full rounded border px-2 py-1 text-sm"
        style={estiloInput}
      />
      {abierto && filtradas.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border py-1 shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        >
          {filtradas.map((o) => (
            <li key={o.ticker}>
              <button
                type="button"
                onClick={() => {
                  onElegir(o);
                  setAbierto(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="font-medium">{o.ticker}</span>
                {o.activo && (
                  <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{o.activo}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Formulario para cargar una operación (compra o venta) a mano, sin depender del export de IEB. */
export default function FormularioOperacionManual({ activos = [] }) {
  const [estado, formAction, pendiente] = useActionState(agregarOperacionManual, estadoInicial);
  const [ticker, setTicker] = useState("");
  const [activo, setActivo] = useState("");
  // Fecha por defecto: hoy (se recalcula en cada render del servidor, que es
  // dinámico, así que siempre coincide con el día de la request).
  const [fecha, setFecha] = useState(hoyISO);

  function elegirTicker(o) {
    setTicker(o.ticker);
    // Solo pisa el nombre si está vacío o si era el autocompletado del ticker anterior.
    setActivo((actual) => (!actual || actual === ticker ? o.activo : actual));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Nombre del activo *
          <input
            name="activo"
            required
            value={activo}
            onChange={(e) => setActivo(e.target.value)}
            placeholder="Ej. CEDEAR NVIDIA CORPORATION"
            className="rounded border px-2 py-1 text-sm"
            style={estiloInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Ticker (opcional)
          <SelectorTicker opciones={activos} valor={ticker} onCambiar={setTicker} onElegir={elegirTicker} />
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
            placeholder="Si lo dejás vacío se estima Precio × Cantidad + derechos"
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
