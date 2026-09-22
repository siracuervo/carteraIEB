"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import EditorNotasTrade from "./EditorNotasTrade";
import { fechaLocal } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function resColor(valor) {
  return valor == null || valor === 0 ? "var(--text-muted)" : valor > 0 ? "var(--good)" : "var(--bad)";
}

function signo(valor) {
  return valor == null || valor === 0 ? "" : valor > 0 ? "+" : "−";
}

function fmtFecha(fecha) {
  return fecha ? formatoFechaCorta.format(fechaLocal(fecha)) : "—";
}

export default function TablaTrades({ cerrados, abiertos, costoAbierto, notasTrades }) {
  const [orden, setOrden] = useState("desc");
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abiertosAbierto, setAbiertosAbierto] = useState(true);
  const [cerradosAbierto, setCerradosAbierto] = useState(false);
  const [tickersAbiertos, setTickersAbiertos] = useState(() => new Set());

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = (cerrados || []).filter((t) => {
      if (filtro === "ganadores" && !(t.resultado > 0)) return false;
      if (filtro === "perdedores" && !(t.resultado < 0)) return false;
      if (q && !`${t.ticker || ""} ${t.activo || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    lista.sort((a, b) =>
      ((a.fechaVenta || "").localeCompare(b.fechaVenta || "") ||
        (a.fechaCompra || "").localeCompare(b.fechaCompra || "")) * (orden === "asc" ? 1 : -1)
    );
    return lista;
  }, [cerrados, orden, filtro, busqueda]);

  const abiertosPorTicker = useMemo(() => {
    const map = new Map();
    for (const t of abiertos || []) {
      const key = t.ticker || t.clave;
      if (!map.has(key)) map.set(key, { clave: t.clave, ticker: t.ticker, activo: t.activo, trades: [] });
      map.get(key).trades.push(t);
    }
    const grupos = [];
    for (const g of map.values()) {
      g.trades.sort((a, b) => (b.fechaCompra || "").localeCompare(a.fechaCompra || ""));
      g.totalCantidad = g.trades.reduce((acc, x) => acc + (x.cantidad || 0), 0);
      g.totalCosto = g.trades.reduce((acc, x) => acc + (x.costoTotal || 0), 0);
      g.totalValor = g.trades.reduce((acc, x) => acc + (x.valorActual ?? x.ingresoTotal ?? 0), 0);
      g.totalResultado = g.trades.reduce((acc, x) => acc + (x.resultado ?? 0), 0);
      g.retornoPct = g.totalCosto > 0 && g.totalResultado != null ? g.totalResultado / g.totalCosto : null;
      g.hasResultado = g.trades.some((x) => x.resultado != null);
      grupos.push(g);
    }
    grupos.sort((a, b) => (b.totalValor - a.totalValor) || (a.ticker || a.clave).localeCompare(b.ticker || b.clave));
    return grupos;
  }, [abiertos]);

  const boton = (id, etiqueta, activo) => (
    <button
      key={id}
      type="button"
      onClick={() => setFiltro(id)}
      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
      style={activo ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
    >
      {etiqueta}
    </button>
  );

  function tarjetaTrade(t) {
    const color = resColor(t.resultado);
    const ganado = t.resultado > 0;
    const perdido = t.resultado < 0;
    return (
      <div
        key={t.id}
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
      >
        <div className="flex">
          <div
            className="w-1 shrink-0"
            style={{ background: ganado ? "var(--good)" : perdido ? "var(--bad)" : "var(--border)" }}
          />
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex min-w-0 items-center gap-2 hover:underline">
                <Logo ticker={t.ticker} nombre={t.activo} size={24} />
                <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--marca)" }}>
                  {t.ticker || t.activo}
                </span>
              </Link>
              <span
                className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={
                  ganado
                    ? { color: "var(--good)", background: "rgba(22, 163, 74, 0.12)" }
                    : perdido
                      ? { color: "var(--bad)", background: "rgba(220, 38, 38, 0.12)" }
                      : { color: "var(--text-muted)", background: "rgba(100, 116, 139, 0.14)" }
                }
              >
                {ganado ? "Ganador" : perdido ? "Perdedor" : "Sin resultado"}
              </span>
              <span className="ml-auto text-right">
                <span className="block text-base font-bold tabular-nums" style={{ color }}>
                  <ValorSensible>
                    {t.resultado != null ? `${signo(t.resultado)}${formatoARS.format(Math.abs(t.resultado))}` : "—"}
                  </ValorSensible>
                </span>
                <span className="block text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  vendida {fmtFecha(t.fechaVenta)}
                </span>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Compra · {fmtFecha(t.fechaCompra)}
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.precioCompra != null ? (
                    <ValorSensible>{formatoARS2.format(t.precioCompra)}</ValorSensible>
                  ) : (
                    <span title="Venta sin compra conocida en el historial">sin origen</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Venta · <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> un.
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.precioVenta != null ? formatoARS2.format(t.precioVenta) : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Retorno
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color }}>
                  {t.retornoPct != null ? (
                    <ValorSensible>{signo(t.retornoPct)}{(Math.abs(t.retornoPct) * 100).toFixed(1)}%</ValorSensible>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Tenencia
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.dias != null ? `${t.dias} ${t.dias === 1 ? "día" : "días"}` : "—"}
                </div>
              </div>
            </div>
            <EditorNotasTrade
              tradeId={t.id}
              initialRazon={notasTrades?.[t.id]?.razon}
              initialErrores={notasTrades?.[t.id]?.errores}
            />
          </div>
        </div>
      </div>
    );
  }

  function tarjetaAbierto(t, { compact = false } = {}) {
    const color = resColor(t.resultado);
    return (
      <div
        key={t.id}
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
      >
        <div className="flex">
          <div className="w-1 shrink-0" style={{ background: "var(--marca)" }} />
          <div className="min-w-0 flex-1 px-3 py-2.5">
            {compact ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                  style={{ color: "var(--marca)", background: "var(--marca-suave)" }}
                >
                  ABIERTO
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Compra {fmtFecha(t.fechaCompra)} · <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> un.
                </span>
                <span className="ml-auto text-right">
                  <span className="block text-sm font-bold tabular-nums" style={{ color }}>
                    <ValorSensible>
                      {t.resultado != null ? `${signo(t.resultado)}${formatoARS.format(Math.abs(t.resultado))}` : "—"}
                    </ValorSensible>
                  </span>
                  <span className="block text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {t.sinPrecio ? "sin precio" : `valuado ${fmtFecha(t.fechaValuacion)}`}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <Logo ticker={t.ticker} nombre={t.activo} size={24} />
                  <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--marca)" }}>
                    {t.ticker || t.activo}
                  </span>
                </Link>
                <span
                  className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                  style={{ color: "var(--marca)", background: "var(--marca-suave)" }}
                >
                  ABIERTO
                </span>
                <span className="ml-auto text-right">
                  <span className="block text-base font-bold tabular-nums" style={{ color }}>
                    <ValorSensible>
                      {t.resultado != null ? `${signo(t.resultado)}${formatoARS.format(Math.abs(t.resultado))}` : "—"}
                    </ValorSensible>
                  </span>
                  <span className="block text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {t.sinPrecio ? "sin precio actual" : `valuado ${fmtFecha(t.fechaValuacion)}`}
                  </span>
                </span>
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Compra · {fmtFecha(t.fechaCompra)}
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.precioCompra != null ? (
                    <ValorSensible>{formatoARS2.format(t.precioCompra)}</ValorSensible>
                  ) : (
                    <span title="Compra sin precio registrado">—</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Actual · <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> un.
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.precioActual != null ? formatoARS2.format(t.precioActual) : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Retorno
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color }}>
                  {t.retornoPct != null ? (
                    <ValorSensible>{signo(t.retornoPct)}{(Math.abs(t.retornoPct) * 100).toFixed(1)}%</ValorSensible>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Tenencia
                </div>
                <div className="truncate text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {t.dias != null ? `${t.dias} ${t.dias === 1 ? "día" : "días"}` : "—"}
                </div>
              </div>
            </div>
            <EditorNotasTrade
              tradeId={t.id}
              initialRazon={notasTrades?.[t.id]?.razon}
              initialErrores={notasTrades?.[t.id]?.errores}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Abiertos primero */}
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <button
          type="button"
          onClick={() => setAbiertosAbierto((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Abiertos <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>({(abiertos || []).length})</span>
          </span>
          <span className="hidden text-xs font-normal sm:inline" style={{ color: "var(--text-muted)" }}>
            — compras sin vender
          </span>
          {costoAbierto > 0 && (
            <span className="ml-auto hidden text-sm font-semibold tabular-nums sm:inline" style={{ color: "var(--text-secondary)" }}>
              <ValorSensible>Costo {formatoARS.format(costoAbierto)}</ValorSensible>
            </span>
          )}
          <span className="ml-auto text-xs sm:hidden" style={{ color: "var(--text-muted)" }}>
            {abiertosAbierto ? "▲" : "▼"}
          </span>
          <span className="hidden text-xs sm:inline" style={{ color: "var(--text-muted)" }}>
            {abiertosAbierto ? "▲" : "▼"}
          </span>
        </button>
        {abiertosAbierto && (
          <div className="space-y-4 border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
            {costoAbierto > 0 && (
              <div className="text-xs tabular-nums sm:hidden" style={{ color: "var(--text-muted)" }}>
                <ValorSensible>Costo {formatoARS.format(costoAbierto)}</ValorSensible>
              </div>
            )}
            {abiertosPorTicker.length > 0 ? abiertosPorTicker.map((g) => {
              const abierto = tickersAbiertos.has(g.clave);
              return (
              <div key={g.clave} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
                <button
                  type="button"
                  onClick={() => setTickersAbiertos((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.clave)) next.delete(g.clave);
                    else next.add(g.clave);
                    return next;
                  })}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left"
                  style={{ background: "var(--surface-2)", borderBottom: abierto ? "1px solid var(--border)" : "none" }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Logo ticker={g.ticker} nombre={g.activo} size={28} />
                    <Link href={`/activo/${encodeURIComponent(g.clave)}`} onClick={(e) => e.stopPropagation()} className="text-sm font-bold uppercase tracking-wide hover:underline" style={{ color: "var(--marca)" }}>
                      {g.ticker || g.activo}
                    </Link>
                    <span className="hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-flex" style={{ color: "var(--marca)", background: "var(--marca-suave)" }}>
                      {g.trades.length} {g.trades.length === 1 ? "compra" : "compras"}
                    </span>
                  </div>
                  <span className="text-xs sm:hidden" style={{ color: "var(--text-muted)" }}>
                    {g.trades.length} {g.trades.length === 1 ? "compra" : "compras"} · <ValorSensible>{g.totalCantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> un.
                  </span>
                  {(() => {
                    const hasNota = g.trades.some((t) => notasTrades?.[t.id]?.razon || notasTrades?.[t.id]?.errores);
                    if (!hasNota) return null;
                    return (
                      <span className="text-xs sm:hidden" style={{ color: "var(--marca)" }} title="Tiene notas">
                        📝
                      </span>
                    );
                  })()}
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--text-muted)" }}>
                    · <ValorSensible>{g.totalCantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> un. · {g.trades.length === 1 ? "una compra" : `${g.trades.length} lotes`}
                  </span>
                  {(() => {
                    const nota = g.trades.map((t) => notasTrades?.[t.id]).find((n) => n?.razon || n?.errores);
                    if (!nota) return null;
                    const texto = (nota.razon || nota.errores || "").trim();
                    if (!texto) return null;
                    return (
                      <span className="hidden min-w-0 flex-1 text-xs italic sm:inline" style={{ color: "var(--text-muted)" }} title={texto}>
                        📝 {texto}
                      </span>
                    );
                  })()}
                  {g.hasResultado && (
                    <span className="ml-auto flex items-center gap-3 text-right">
                      <span className="hidden flex-col items-end sm:flex">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total</span>
                        <span className="text-[11px] tabular-nums" style={{ color: resColor(g.totalResultado) }}>
                          {g.retornoPct != null ? (
                            <ValorSensible>{signo(g.retornoPct)}{(Math.abs(g.retornoPct) * 100).toFixed(1)}%</ValorSensible>
                          ) : "—"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-bold tabular-nums" style={{ color: resColor(g.totalResultado) }}>
                          <ValorSensible>{g.totalResultado != null ? `${signo(g.totalResultado)}${formatoARS.format(Math.abs(g.totalResultado))}` : "—"}</ValorSensible>
                        </span>
                        <span className="block text-[10px] tabular-nums sm:hidden" style={{ color: resColor(g.totalResultado) }}>
                          {g.retornoPct != null ? `${signo(g.retornoPct)}${(Math.abs(g.retornoPct) * 100).toFixed(1)}%` : ""}
                        </span>
                      </span>
                    </span>
                  )}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{abierto ? "▲" : "▼"}</span>
                </button>
                {abierto && (
                <div className="space-y-2 p-3" style={{ background: "var(--surface-1)" }}>
                  {g.trades.map((t) => tarjetaAbierto(t, { compact: true }))}
                </div>
                )}
              </div>
              );
            }) : (
              <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No hay trades abiertos.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Cerrados colapsado por defecto */}
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <button
          type="button"
          onClick={() => setCerradosAbierto((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Cerrados <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>({filas.length}{filas.length !== (cerrados || []).length ? ` / ${(cerrados || []).length}` : ""})</span>
          </span>
          <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
            {cerradosAbierto ? "▲" : "▼"}
          </span>
        </button>
        {cerradosAbierto && (
          <div className="border-t" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                {boton("todos", "Todos", filtro === "todos")}
                {boton("ganadores", "Ganadores", filtro === "ganadores")}
                {boton("perdedores", "Perdedores", filtro === "perdedores")}
              </div>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar ticker…"
                className="w-32 rounded-lg border px-2 py-1 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
              />
              <button
                type="button"
                onClick={() => setOrden((o) => (o === "asc" ? "desc" : "asc"))}
                className="ml-auto cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {orden === "asc" ? "↑ Antiguos primero" : "↓ Recientes primero"}
              </button>
            </div>
            <div className="space-y-2 px-3 pb-3">
              {filas.map((t) => tarjetaTrade(t))}
              {!filas.length && (
                <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No hay trades cerrados para mostrar.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
