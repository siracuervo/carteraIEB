"use client";

import { Fragment, useMemo, useState } from "react";
import { fechaLocal } from "@/lib/fechas";
import { clasificar, CLASES } from "@/lib/clasificacion";
import { factorPrecioPorClase } from "@/lib/calculos";
import FormEditarOperacion from "./FormEditarOperacion";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
// Los precios no son importes: los bonos cotizan con varios decimales (ej. 122,6),
// así que no se redondean a peso entero. Los CEDEARs sí se muestran sin decimales
// (son precios por unidad altos y la parte decimal agrega ruido).
const formatoPrecioARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 6 });
const formatoPrecioARSsinDecimales = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function esCompra(t) {
  return (t.operacion || "").toUpperCase().includes("COMPRA");
}

function esVenta(t) {
  return (t.operacion || "").toUpperCase().includes("VENTA");
}

function esEstimable(t) {
  const op = (t.operacion || "").toUpperCase();
  if (op.includes("PARIDAD")) return false;
  return op.includes("COMPRA") || op.includes("VENTA");
}

/** Igual que el formato de importes pero sin redondear los decimales del precio. */
function formatoPrecio(valor, divisa, claseActivo) {
  if (valor == null) return "—";
  if (divisa === "USD") return formatoUSD.format(valor);
  return claseActivo === CLASES.CEDEAR ? formatoPrecioARSsinDecimales.format(valor) : formatoPrecioARS.format(valor);
}

/** Importe en ARS a mostrar: el real si IEB lo trajo, si no Precio × Cantidad estimado (negativo para compras). */
function importeMostrado(t) {
  if (t.importeARS != null) return { texto: formatoARS.format(t.importeARS), estimado: false };
  if (!esEstimable(t) || t.precio == null || t.cantidad == null) return { texto: "—", estimado: false };
  const factor = factorPrecioPorClase(clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion }).claseActivo);
  return { texto: formatoARS.format(-(t.cantidad * t.precio * factor)), estimado: true };
}

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/** Lista completa de operaciones con filtros de búsqueda, tipo, rango de fechas y divisa. */
export default function ListaMovimientos({ transacciones }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [divisa, setDivisa] = useState("todas");
  const [editandoClave, setEditandoClave] = useState(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return transacciones.filter((t) => {
      const texto = `${t.ticker || ""} ${t.activo || ""} ${t.nroOperacion || ""} ${t.operacion || ""}`.toLowerCase();
      if (q && !texto.includes(q)) return false;
      if (tipo === "compras" && !esCompra(t)) return false;
      if (tipo === "ventas" && !esVenta(t)) return false;
      if (tipo === "otros" && (esCompra(t) || esVenta(t))) return false;
      if (t.fecha && desde && t.fecha < desde) return false;
      if (t.fecha && hasta && t.fecha > hasta) return false;
      if (divisa !== "todas" && (t.divisa || "ARS") !== divisa) return false;
      return true;
    });
  }, [transacciones, busqueda, tipo, desde, hasta, divisa]);

  const hayFiltro = Boolean(busqueda || tipo !== "todas" || desde || hasta || divisa !== "todas");

  function limpiar() {
    setBusqueda("");
    setTipo("todas");
    setDesde("");
    setHasta("");
    setDivisa("todas");
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="mt-3 rounded-lg border p-3 mx-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Buscar
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Activo, ticker u operación"
              className="rounded border px-2 py-1 text-sm"
              style={estiloInput}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
              <option value="todas">Todas</option>
              <option value="compras">Compras</option>
              <option value="ventas">Ventas</option>
              <option value="otros">Otros (dividendos, ajustes)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Divisa
            <select value={divisa} onChange={(e) => setDivisa(e.target.value)} className="rounded border px-2 py-1 text-sm" style={estiloInput}>
              <option value="todas">Todas</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Desde
            <input type="date" value={desde} style={estiloInput} className="rounded border px-2 py-1 text-sm" onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Hasta
            <input type="date" value={hasta} style={estiloInput} className="rounded border px-2 py-1 text-sm" onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        {hayFiltro && (
          <button type="button" onClick={limpiar} className="mt-3 text-xs underline" style={{ color: "var(--text-muted)" }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--gridline)" }}>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Activo</th>
              <th className="px-4 py-2 font-medium">Operación</th>
              <th className="px-4 py-2 text-right font-medium">Cantidad</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Importe ARS</th>
              <th
                className="px-4 py-2 text-right font-medium"
                style={{ position: "sticky", right: 0, background: "var(--surface-1)", zIndex: 1 }}
              >
                Editar
              </th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((t, i) => {
              const { texto: importe, estimado } = importeMostrado(t);
              const venta = esVenta(t);
              return (
                <Fragment key={t.clave ?? `${t.activo}-${t.nroOperacion}-${t.fecha}-${i}`}>
                <tr
                  style={{ borderBottom: i < filtradas.length - 1 ? "1px solid var(--gridline)" : "none" }}
                >
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {t.fecha
                      ? `${formatoFecha.format(fechaLocal(t.fecha))}${t.hora ? ` · ${t.hora}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--text-primary)" }}>
                    <span className="block">{t.ticker || t.activo || "Sin nombre"}</span>
                    {t.ticker && (
                      <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t.activo}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span style={{ color: venta ? "var(--bad)" : "var(--good)" }}>{t.operacion}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {t.cantidad != null ? t.cantidad.toLocaleString("es-AR") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {formatoPrecio(t.precio, t.divisa || "ARS", clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion }).claseActivo)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {importe}
                    {estimado && (
                      <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>(est.)</span>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-2 text-right"
                    style={{ position: "sticky", right: 0, background: "var(--surface-1)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setEditandoClave((actual) => (actual === t.clave ? null : t.clave))}
                      className="cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition-colors"
                      style={{ borderColor: "var(--marca)", color: "var(--marca)", background: "var(--surface-2)" }}
                    >
                      {editandoClave === t.clave ? "Cerrar" : "Editar"}
                    </button>
                  </td>
                </tr>
                  {editandoClave === t.clave && (
                    <tr style={{ borderBottom: i < filtradas.length - 1 ? "1px solid var(--gridline)" : "none" }}>
                      <td colSpan={7} className="px-4 py-2">
                        <FormEditarOperacion transaccion={t} onCancelar={() => setEditandoClave(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!filtradas.length && (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay operaciones que coincidan con los filtros.
          </p>
        )}
      </div>
    </div>
  );
}