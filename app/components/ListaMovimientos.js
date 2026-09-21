"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { fechaLocal } from "@/lib/fechas";
import { aISO } from "@/lib/accesosRapidosFecha";
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

/** Etiqueta corta para angostar la columna Operación (el nombre completo va en el tooltip). */
function operacionCorta(t) {
  const op = (t.operacion || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (op.includes("CAUCION") && op.includes("VENCIMIENTO")) return "Cauc. vto.";
  if (op.includes("CAUCION")) return "Cauc. coloc.";
  if (op.includes("COMPRA") && op.includes("TRADING")) return "Compra T.";
  if (op.includes("VENTA") && op.includes("TRADING")) return "Venta T.";
  if (op.includes("COMPRA") && op.includes("PARIDAD")) return "Compra P.";
  if (op.includes("VENTA") && op.includes("PARIDAD")) return "Venta P.";
  if (op.includes("COMPRA")) return "Compra";
  if (op.includes("VENTA")) return "Venta";
  return t.operacion || "—";
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
  // Cuando no hay rango (Desde/Hasta) la lista se acota a un día por vez: así no
  // crece sin límite hacia abajo. Por defecto es HOY (aunque no tenga
  // movimientos) y se navega hacia atrás con los botones.
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const hoyISO = aISO(new Date());

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

  // Días con operaciones (más reciente primero), para la navegación día a día.
  // Siempre se incluye hoy al principio para arrancar ahí aunque no tenga nada.
  const dias = useMemo(() => {
    const set = new Set();
    for (const t of filtradas) if (t.fecha) set.add(t.fecha);
    const lista = Array.from(set).sort((a, b) => b.localeCompare(a));
    if (!lista.includes(hoyISO)) lista.unshift(hoyISO);
    return lista;
  }, [filtradas, hoyISO]);

  const enRango = Boolean(desde || hasta);
  const indiceDia = useMemo(() => {
    if (enRango || !dias.length) return -1;
    const buscado = diaSeleccionado || hoyISO;
    const i = dias.indexOf(buscado);
    return i >= 0 ? i : 0;
  }, [dias, diaSeleccionado, enRango, hoyISO]);
  const diaEfectivo = indiceDia >= 0 ? dias[indiceDia] : null;

  // En modo día se muestra solo ese día (las operaciones sin fecha se dejan visibles);
  // con rango, todos los días del rango, agrupados por día.
  const visibles = useMemo(() => {
    if (enRango || !diaEfectivo) return filtradas;
    return filtradas.filter((t) => t.fecha === diaEfectivo || !t.fecha);
  }, [filtradas, enRango, diaEfectivo]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      const k = t.fecha || "";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(t);
    }
    return Array.from(mapa.entries());
  }, [visibles]);

  const hayFiltro = Boolean(busqueda || tipo !== "todas" || desde || hasta || divisa !== "todas");

  // El formulario de edición se muestra debajo de la tabla (a ancho completo)
  // en vez de adentro: adentro quedaría atrapado en el scroll horizontal en móvil.
  const editando = visibles.find((t) => t.clave === editandoClave) ?? null;

  useEffect(() => {
    if (editandoClave) {
      document.getElementById("editar-operacion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editandoClave]);

  function limpiar() {
    setBusqueda("");
    setTipo("todas");
    setDesde("");
    setHasta("");
    setDivisa("todas");
    setDiaSeleccionado(null);
  }

  /** Tarjeta compacta para móvil: mismos datos que la fila de la tabla. */
  function renderTarjeta(t, i) {
    const { texto: importe, estimado } = importeMostrado(t);
    const venta = esVenta(t);
    return (
      <div key={t.clave ?? `${t.activo}-${t.nroOperacion}-${t.fecha}-${i}`} className="border-b px-3 py-2.5 last:border-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t.ticker || t.activo || "Sin nombre"}
            </div>
            {t.ticker && (
              <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{t.activo}</div>
            )}
          </div>
          <span className="shrink-0 text-xs font-medium" style={{ color: venta ? "var(--bad)" : "var(--good)" }} title={t.operacion}>
            {operacionCorta(t)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          <span>{t.fecha ? `${formatoFecha.format(fechaLocal(t.fecha))}${t.hora ? ` · ${t.hora}` : ""}` : "Sin fecha"}</span>
          {t.sleeve === "largo" && (
            <span className="rounded px-1 py-0.5" style={{ background: "var(--marca-suave)", color: "var(--marca)" }} title="Lote de largo plazo">
              LP
            </span>
          )}
          {t.sleeve === "rentaFija" && (
            <span className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} title="Renta fija">
              RF
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
          <div className="min-w-0">
            <div style={{ color: "var(--text-muted)" }}>Cantidad</div>
            <div className="truncate tabular-nums" style={{ color: "var(--text-primary)" }}>
              {t.cantidad != null ? t.cantidad.toLocaleString("es-AR") : "—"}
            </div>
          </div>
          <div className="min-w-0">
            <div style={{ color: "var(--text-muted)" }}>Precio</div>
            <div className="truncate tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatoPrecio(t.precio, t.divisa || "ARS", clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion }).claseActivo)}
            </div>
          </div>
          <div className="min-w-0 text-right">
            <div style={{ color: "var(--text-muted)" }}>Importe ARS</div>
            <div className="truncate tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
              {importe}
              {estimado && (
                <span className="font-normal" style={{ color: "var(--text-muted)" }}> (est.)</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setEditandoClave((actual) => (actual === t.clave ? null : t.clave))}
            className="cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition-colors"
            style={{ borderColor: "var(--marca)", color: "var(--marca)", background: "var(--surface-2)" }}
          >
            {editandoClave === t.clave ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>
    );
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
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sin Desde/Hasta la lista se recorre día por día; completá ambos para ver un rango.
          </span>
          {hayFiltro && (
            <button type="button" onClick={limpiar} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {!enRango && dias.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => setDiaSeleccionado(dias[indiceDia + 1])}
            disabled={indiceDia >= dias.length - 1}
            className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-default disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
          >
            ← Día anterior
          </button>
          <select
            value={diaEfectivo ?? ""}
            onChange={(e) => setDiaSeleccionado(e.target.value)}
            className="min-w-0 max-w-full rounded border px-2 py-1 text-sm"
            style={estiloInput}
          >
            {dias.map((d) => (
              <option key={d} value={d}>{formatoFecha.format(fechaLocal(d))}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDiaSeleccionado(dias[indiceDia - 1])}
            disabled={indiceDia <= 0}
            className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-default disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
          >
            Día siguiente →
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Día {indiceDia + 1} de {dias.length} · {visibles.length} {visibles.length === 1 ? "operación" : "operaciones"}
          </span>
        </div>
      )}
      {enRango && (
        <p className="mt-3 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
          Mostrando {grupos.length} {grupos.length === 1 ? "día" : "días"} del rango · {visibles.length}{" "}
          {visibles.length === 1 ? "operación" : "operaciones"}. Para recorrer día por día, dejá Desde y Hasta vacíos.
        </p>
      )}

      {!!visibles.length && (
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--gridline)" }}>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Activo</th>
              <th className="px-3 py-2 font-medium">Operación</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Precio</th>
              <th className="px-3 py-2 text-right font-medium">Importe ARS</th>
              <th className="px-3 py-2 text-right font-medium">
                Editar
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([fecha, items], indiceGrupo) => (
              <Fragment key={fecha || "sin-fecha"}>
                {enRango && (
                  <tr style={{ background: "var(--surface-2)" }}>
                    <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {fecha ? formatoFecha.format(fechaLocal(fecha)) : "Sin fecha"} · {items.length}{" "}
                      {items.length === 1 ? "operación" : "operaciones"}
                    </td>
                  </tr>
                )}
                {items.map((t, i) => {
                  const { texto: importe, estimado } = importeMostrado(t);
                  const venta = esVenta(t);
                  const borde = indiceGrupo === grupos.length - 1 && i === items.length - 1 ? "none" : "1px solid var(--gridline)";
                  return (
                    <Fragment key={t.clave ?? `${t.activo}-${t.nroOperacion}-${t.fecha}-${i}`}>
                      <tr style={{ borderBottom: borde }}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {t.fecha
                            ? `${formatoFecha.format(fechaLocal(t.fecha))}${t.hora ? ` · ${t.hora}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-primary)", minWidth: 140 }}>
                          <span className="block">{t.ticker || t.activo || "Sin nombre"}</span>
                          {t.ticker && (
                            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t.activo}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span style={{ color: venta ? "var(--bad)" : "var(--good)" }} title={t.operacion}>{operacionCorta(t)}</span>
                          {t.sleeve === "largo" && (
                            <span className="ml-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--marca-suave)", color: "var(--marca)" }} title="Lote de largo plazo">
                              LP
                            </span>
                          )}
                          {t.sleeve === "rentaFija" && (
                            <span className="ml-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} title="Renta fija">
                              RF
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {t.cantidad != null ? t.cantidad.toLocaleString("es-AR") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {formatoPrecio(t.precio, t.divisa || "ARS", clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion }).claseActivo)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {importe}
                          {estimado && (
                            <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>(est.)</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
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
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          </table>
        </div>
      )}
      {!!visibles.length && (
        <div className="mt-3 md:hidden">
          {enRango ? (
            grupos.map(([fecha, items]) => (
              <div key={fecha || "sin-fecha"}>
                <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)", background: "var(--surface-2)" }}>
                  {fecha ? formatoFecha.format(fechaLocal(fecha)) : "Sin fecha"} · {items.length}{" "}
                  {items.length === 1 ? "operación" : "operaciones"}
                </div>
                <div>{items.map((t, i) => renderTarjeta(t, i))}</div>
              </div>
            ))
          ) : (
            <div>{visibles.map((t, i) => renderTarjeta(t, i))}</div>
          )}
        </div>
      )}
      {!visibles.length && (
        <p className="mt-3 px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {!enRango && !hayFiltro && diaEfectivo
            ? `Sin movimientos el ${formatoFecha.format(fechaLocal(diaEfectivo))}.`
            : "No hay operaciones que coincidan con los filtros."}
        </p>
      )}
      {editando && (
        <div id="editar-operacion" className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <FormEditarOperacion transaccion={editando} onCancelar={() => setEditandoClave(null)} />
        </div>
      )}
    </div>
  );
}