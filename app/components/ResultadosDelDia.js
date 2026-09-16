"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import { fechaLocal } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoFechaDia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "long" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoHora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const REFRESCO_PRECIOS_MS = 60_000;

function Cantidad({ trade }) {
  const esVenta = trade.tipo === "venta";
  return (
    <span style={{ color: esVenta ? "var(--bad)" : "var(--text-primary)" }}>
      <ValorSensible>
        {(esVenta ? "−" : "") + trade.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
      </ValorSensible>
    </span>
  );
}

export default function ResultadosDelDia({ resultados }) {
  const [live, setLive] = useState(null);
  const [colapsados, setColapsados] = useState(() => {
    const inicial = new Set();
    for (const t of resultados?.trades || []) {
      if (t.clave) inicial.add(t.clave);
    }
    return inicial;
  });
  const trades = useMemo(() => resultados?.trades || [], [resultados]);
  const totals = resultados?.totals || null;

  const tickers = useMemo(
    () => Array.from(new Set(trades.filter((t) => t.tipo === "compra" && t.ticker).map((t) => t.ticker))),
    [trades]
  );

  useEffect(() => {
    if (!tickers.length) return;
    let activo = true;

    async function refrescar() {
      try {
        const res = await fetch(`/api/precios?tickers=${encodeURIComponent(tickers.join(","))}`);
        const json = await res.json();
        if (!activo || !json?.cedear) return;
        setLive(json);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }

    refrescar();
    const id = setInterval(refrescar, REFRESCO_PRECIOS_MS);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, [tickers]);

  function precioActualDe(t) {
    if (t.tipo !== "compra") return null;
    return live?.cedear?.[t.ticker]?.precio ?? t.precioActual ?? null;
  }

  function resultadoDe(t) {
    if (t.tipo === "venta") return t.gananciaRealizada ?? null;
    if (t.cantidadPendiente <= 0) return 0;
    const precioVivo = precioActualDe(t);
    if (precioVivo == null || t.precio == null) return null;
    return (precioVivo - t.precio) * t.cantidadPendiente * (t.factorPrecio ?? 1);
  }

  const totalNoRealizado = useMemo(() => {
    if (totals && totals.noRealizado != null && !live) return totals.noRealizado;
    return trades.reduce((acc, t) => {
      const r = t.tipo === "compra" ? resultadoDe(t) : 0;
      return acc + (r ?? 0);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, live]);

  const total = (totals?.realizado ?? 0) + totalNoRealizado;

  const grupos = useMemo(() => {
    const porClave = new Map();
    for (const t of trades) {
      const clave = t.clave;
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave).push(t);
    }
    return Array.from(porClave.entries()).sort((a, b) => {
      const nomA = (a[1][0].ticker || a[1][0].activo || "").toLowerCase();
      const nomB = (b[1][0].ticker || b[1][0].activo || "").toLowerCase();
      return nomA.localeCompare(nomB);
    });
  }, [trades]);

  function resultadoDeGrupo(ts) {
    return ts.reduce((acc, t) => acc + (resultadoDe(t) ?? 0), 0);
  }

  function alternarGrupo(clave) {
    setColapsados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  const etiquetaDia = resultados?.dia ? formatoFechaDia.format(fechaLocal(resultados.dia)) : "";

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="grid grid-cols-1 items-center gap-2 px-4 pt-4 sm:grid-cols-[1fr_auto_1fr]">
        <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Resultados del día</h2>
        {live?.ts && (
          <span className="flex items-center justify-center gap-1.5 text-xs sm:order-none order-last" style={{ color: "var(--text-muted)" }}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--good)" }} />
            actualizado {formatoHora.format(live.ts)}
          </span>
        )}
        <div className="text-xs sm:text-right" style={{ color: "var(--text-muted)" }}>
          {etiquetaDia ? etiquetaDia[0].toUpperCase() + etiquetaDia.slice(1) : ""}
          {!resultados?.esHoy && " · último día con operaciones"}
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniTotal etiqueta="Ventas (realizado)" valor={totals?.realizado} />
          <MiniTotal etiqueta="Compras (a mercado)" valor={totalNoRealizado} />
          <MiniTotal etiqueta="Resultado del día" valor={total} destacado />
          <MiniTotal etiqueta="Operado" valor={totals?.montoOperado} conSigno={false} />
        </div>
      </div>

      <div className="overflow-x-auto pt-2">
        <table className="w-full text-sm">
          <tbody>
            {grupos.map(([clave, ts]) => {
              const primera = ts[0];
              const abierto = !colapsados.has(clave);
              const totalComprado = ts.filter((t) => t.tipo === "compra").reduce((acc, t) => acc + t.cantidad, 0);
              const totalVendido = ts.filter((t) => t.tipo === "venta").reduce((acc, t) => acc + t.cantidad, 0);
              return (
                <Fragment key={clave}>
                  <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <td colSpan={6} className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(clave)}
                        className="flex w-full cursor-pointer items-center gap-2.5 text-left"
                        title={abierto ? "Contraer" : "Expandir"}
                      >
                        <span style={{ color: "var(--text-secondary)" }}><IconoChevron abierto={abierto} /></span>
                        <Logo ticker={primera.ticker} nombre={primera.activo} size={24} />
                        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                          {primera.ticker || primera.activo}
                        </span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: resColor(resultadoDeGrupo(ts)) }}>
                          <ValorSensible>
                            {signo(resultadoDeGrupo(ts))}{formatoARS.format(Math.abs(resultadoDeGrupo(ts)))}
                          </ValorSensible>
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {ts.length} {ts.length === 1 ? "operación" : "operaciones"}
                        </span>
                        <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                          {totalComprado > 0 && (
                            <span className="font-medium" style={{ color: "var(--good)" }}>
                              +{totalComprado.toLocaleString("es-AR", { maximumFractionDigits: 2 })} comprados
                            </span>
                          )}
                          {totalVendido > 0 && (
                            <span className="font-medium" style={{ color: "var(--bad)" }}>
                              −{totalVendido.toLocaleString("es-AR", { maximumFractionDigits: 2 })} vendidos
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Operación</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Fecha</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Precio operado</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Cantidad</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Precio actual</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Resultado</th>
                    </tr>
                  )}
                  {abierto && (() => {
                      const filas = [];
                      ts.forEach((t) => {
                        if (t.tipo === "venta") {
                          for (const o of t.origenes || []) filas.push({ tipo: "origen", fecha: o.fecha, o, t });
                        }
                        filas.push({ tipo: "trade", fecha: t.fecha, t });
                      });
                      return filas
                        .map((f, idx) => ({ ...f, idx }))
                        .sort((a, b) => {
                          const porFecha = (a.fecha || "").localeCompare(b.fecha || "");
                          if (porFecha !== 0) return porFecha;
                          const nroA = Number(a.t?.nroOperacion ?? a.idx);
                          const nroB = Number(b.t?.nroOperacion ?? b.idx);
                          return nroA - nroB;
                        })
                        .map((f) => {
                          if (f.tipo === "origen") {
                            const o = f.o;
                            return (
                              <tr key={`${f.t.id}-origen-${f.idx}`} className="border-b last:border-0" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
                                <td className="px-3 py-2 align-top">
                                  <span
                                    className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
                                    style={{ color: "var(--good)", background: "rgba(22, 163, 74, 0.08)" }}
                                  >
                                    Compra
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                  {formatoFechaCorta.format(fechaLocal(o.fecha))}
                                </td>
                                <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                  {formatoARS2.format(o.precio)}
                                </td>
                                <td className="px-3 py-2 align-top tabular-nums">
                                  <Cantidad trade={{ tipo: "compra", cantidad: o.cantidad }} />
                                </td>
                                <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                                <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                              </tr>
                            );
                          }
                          const t = f.t;
                          const precioVivo = precioActualDe(t);
                          const resultado = resultadoDe(t);
                          const esVenta = t.tipo === "venta";
                          return (
                            <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                              <td className="px-3 py-2 align-top">
                                <span
                                  className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
                                  style={{
                                    color: esVenta ? "var(--bad)" : "var(--good)",
                                    background: esVenta ? "rgba(220, 38, 38, 0.08)" : "rgba(22, 163, 74, 0.08)",
                                  }}
                                >
                                  {t.operacion}
                                </span>
                              </td>
                              <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                {formatoFechaCorta.format(fechaLocal(t.fecha))}
                              </td>
                              <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                {formatoARS2.format(t.precio)}
                              </td>
                              <td className="px-3 py-2 align-top tabular-nums"><Cantidad trade={t} /></td>
                              <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                {esVenta ? (
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>vendida</span>
                                ) : t.cantidadPendiente <= 0 ? (
                                  <span style={{ color: "var(--text-muted)" }}>—</span>
                                ) : precioVivo == null ? (
                                  <span style={{ color: "var(--bad)" }}>sin precio</span>
                                ) : (
                                  formatoARS2.format(precioVivo)
                                )}
                              </td>
                              <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(resultado) }}>
                                {resultado == null ? (
                                  <span style={{ color: "var(--text-muted)" }}>—</span>
                                ) : (
                                  <ValorSensible>
                                    {signo(resultado)}{formatoARS.format(Math.abs(resultado))}
                                  </ValorSensible>
                                )}
                              </td>
                            </tr>
                          );
                        });
                    })()}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!trades.length && (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hubo compra/venta {etiquetaDia ? "el " + etiquetaDia : "ese día"}.
          </p>
        )}
      </div>
    </div>
  );
}

function resColor(valor) {
  return valor == null || valor === 0 ? "var(--text-muted)" : valor > 0 ? "var(--good)" : "var(--bad)";
}

function signo(valor) {
  return valor == null || valor === 0 ? "" : valor > 0 ? "+" : "−";
}

function IconoChevron({ abierto }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: abierto ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function MiniTotal({ etiqueta, valor, destacado = false, conSigno = true }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
      {valor == null ? (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>—</div>
      ) : (
        <div
          className="tabular-nums"
          style={{
            fontSize: destacado ? 18 : 14,
            fontWeight: destacado ? 600 : 500,
            color: destacado ? (valor >= 0 ? "var(--good)" : "var(--bad)") : "var(--text-primary)",
          }}
        >
          <ValorSensible>
            {conSigno && valor !== 0 ? (valor >= 0 ? "+" : "−") : ""}{formatoARS.format(Math.abs(valor))}
          </ValorSensible>
        </div>
      )}
    </div>
  );
}