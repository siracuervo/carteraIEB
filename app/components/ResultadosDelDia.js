"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import CalendarioDias from "./CalendarioDias";
import { EVENTO_ACTUALIZAR } from "./BotonActualizarTodo";
import { fechaLocal } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoFechaDia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "long" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

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

export default function ResultadosDelDia({ resultados, diasOperados, dia }) {
  const [live, setLive] = useState(null);
  // Grupos siempre colapsados por defecto: se recuerdan los expandidos (vacío
  // inicial) y se resetean al cambiar de día.
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [expandidosParaDia, setExpandidosParaDia] = useState(resultados?.dia);
  if (expandidosParaDia !== resultados?.dia) {
    setExpandidosParaDia(resultados?.dia);
    setExpandidos(new Set());
  }
  const trades = useMemo(() => resultados?.trades || [], [resultados]);
  const rendimientos = useMemo(() => resultados?.rendimientosTenencia || [], [resultados]);
  const totals = resultados?.totals || null;
  // Variación de lo no operado ese día (renta fija excluida del mosaico).
  const totalSinOperar = useMemo(
    () => rendimientos.reduce((acc, r) => acc + (r.computa === false ? 0 : r.resultado ?? 0), 0),
    [rendimientos]
  );

  const tickers = useMemo(
    () => Array.from(new Set(trades.filter((t) => t.tipo === "compra" && t.ticker).map((t) => t.ticker))),
    [trades]
  );

  const esUltimo = resultados?.esUltimo ?? false;
  const refrescarRef = useRef(null);

  useEffect(() => {
    if (!tickers.length || !esUltimo) return;
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
    refrescarRef.current = refrescar;

    function alActualizarGlobal() {
      refrescarRef.current?.();
    }
    window.addEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);

    refrescar();
    const id = setInterval(refrescar, REFRESCO_PRECIOS_MS);
    return () => {
      activo = false;
      clearInterval(id);
      window.removeEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);
    };
  }, [tickers, esUltimo]);

  function precioActualDe(t) {
    if (t.tipo !== "compra") return null;
    const vivo = esUltimo ? live?.cedear?.[t.ticker]?.precio : null;
    return vivo ?? t.precioActual ?? null;
  }

  function resultadoDe(t) {
    // Venta: resultado del día (mark-to-market contra el cierre anterior; precio de
    // compra para lo comprado ese mismo día). Una compra no realiza resultado por sí
    // misma: lo que queda sin vender se muestra aparte como "tenencia pendiente".
    if (t.tipo === "venta") return t.resultado ?? null;
    return null;
  }

  function rendimientoPendienteDe(t) {
    if (t.tipo !== "compra" || !(t.cantidadPendiente > 0)) return null;
    const precioVivo = precioActualDe(t);
    if (precioVivo == null || t.precio == null) return null;
    return (precioVivo - t.precio) * t.cantidadPendiente * (t.factorPrecio ?? 1);
  }

  function esRentaFija(t) {
    return t.claseActivo === "Bonos";
  }

  // Mismo criterio que TablaTenencias: renta fija en pesos = bandera argentina dibujada.
  function banderaArgentinaDe(t) {
    return esRentaFija(t) && t.divisa === "ARS";
  }

  // La renta fija se lista (fila "Tenencia pendiente") pero no se suma al mosaico.
  function computaPendienteDe(t) {
    return esRentaFija(t) ? null : rendimientoPendienteDe(t);
  }

  function porcentajeDe(t) {
    if (t.tipo !== "venta" || t.resultado == null) return null;
    // costoBase va en escala cruda (cada 100 en bonos); se lo lleva a ARS para
    // dividir por el resultado. El fallback precioCompra×cantidad ya está en ARS.
    const base =
      t.costoBase != null
        ? t.costoBase * (t.factorPrecio ?? 1)
        : t.precioCompra > 0
          ? t.precioCompra * t.cantidad
          : null;
    return base > 0 ? t.resultado / base : null;
  }

  function porcentajePendienteDe(t) {
    const precioVivo = precioActualDe(t);
    if (precioVivo == null || !(t.precio > 0)) return null;
    return precioVivo / t.precio - 1;
  }

  const totalNoRealizado = useMemo(() => {
    if (totals && totals.noRealizado != null && !esUltimo) return totals.noRealizado;
    return trades.reduce((acc, t) => acc + (computaPendienteDe(t) ?? 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, live, esUltimo]);

  const total = (totals?.realizado ?? 0) + totalNoRealizado + totalSinOperar;

  // Orden cronológico primero (fecha, hora; sin hora al cierre del día) y ticker
  // como desempate — tanto entre grupos (por su primera operación) como entre
  // filas dentro de cada grupo.
  function marcaTiempo(t) {
    return `${t.fecha || ""}|${t.hora || "24:00"}`;
  }

  const grupos = useMemo(() => {
    const porClave = new Map();
    for (const t of trades) {
      const clave = t.clave;
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave).push(t);
    }
    return Array.from(porClave.entries()).sort((a, b) => {
      const porTiempo = marcaTiempo(a[1][0]).localeCompare(marcaTiempo(b[1][0]));
      if (porTiempo !== 0) return porTiempo;
      const nomA = (a[1][0].ticker || a[1][0].activo || "").toLowerCase();
      const nomB = (b[1][0].ticker || b[1][0].activo || "").toLowerCase();
      return nomA.localeCompare(nomB);
    });
  }, [trades]);

  function resultadoDeGrupo(ts) {
    return ts.reduce((acc, t) => acc + (resultadoDe(t) ?? 0) + (computaPendienteDe(t) ?? 0), 0);
  }

  // Tickers holdeados sin operar ese día: se agregan al final para mostrar todos
  // los rendimientos por ticker en un solo listado (vienen ordenados por |resultado|).
  const sinOperarPorClave = useMemo(() => {
    const conTrades = new Set(trades.map((t) => t.clave));
    const mapa = new Map();
    for (const r of rendimientos) {
      if (!r.clave || conTrades.has(r.clave) || mapa.has(r.clave)) continue;
      mapa.set(r.clave, r);
    }
    return mapa;
  }, [trades, rendimientos]);

  const gruposTodos = useMemo(
    () => [...grupos, ...Array.from(sinOperarPorClave.keys()).map((clave) => [clave, []])],
    [grupos, sinOperarPorClave]
  );

  function alternarGrupo(clave) {
    setExpandidos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  const etiquetaDia = resultados?.dia ? formatoFechaDia.format(fechaLocal(resultados.dia)) : "";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function cambiarDia(nuevaDia) {
    const params = new URLSearchParams(searchParams);
    params.set("dia", nuevaDia);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Resultados diarios</h2>
          <span className="text-lg font-semibold tabular-nums" style={{ color: resColor(total) }}>
            <ValorSensible>
              {signo(total)}{formatoARS.format(Math.abs(total ?? 0))}
            </ValorSensible>
          </span>
        </div>
        <div className="text-xs sm:text-right flex items-center justify-end gap-2" style={{ color: "var(--text-muted)" }}>
          <CalendarioDias dias={diasOperados} dia={dia} onElegir={cambiarDia} />
          {etiquetaDia ? etiquetaDia[0].toUpperCase() + etiquetaDia.slice(1) : ""}
          {!resultados?.esHoy && esUltimo && " · último día con operaciones"}
        </div>
      </div>

      <div className="overflow-x-auto pt-2">
        <table className="w-full text-sm">
          <tbody>
            {gruposTodos.map(([clave, ts]) => {
              const sinOperar = sinOperarPorClave.get(clave) ?? null;
              const primera = sinOperar ?? ts[0];
              const abierto = expandidos.has(clave);
              const totalComprado = ts.filter((t) => t.tipo === "compra").reduce((acc, t) => acc + t.cantidad, 0);
              const totalVendido = ts.filter((t) => t.tipo === "venta").reduce((acc, t) => acc + t.cantidad, 0);
              const subtotal = sinOperar ? (sinOperar.resultado ?? 0) : resultadoDeGrupo(ts);
              return (
                <Fragment key={clave}>
                  <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <td colSpan={7} className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(clave)}
                        className="flex w-full cursor-pointer items-center gap-2.5 text-left"
                        title={abierto ? "Contraer" : "Expandir"}
                      >
                        <span style={{ color: "var(--text-secondary)" }}><IconoChevron abierto={abierto} /></span>
                        <Logo ticker={primera.ticker} nombre={primera.activo} size={24} banderaArgentina={banderaArgentinaDe(primera)} />
                        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                          {primera.ticker || primera.activo}
                        </span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: resColor(subtotal) }}>
                          <ValorSensible>
                            {signo(subtotal)}{formatoARS.format(Math.abs(subtotal))}
                          </ValorSensible>
                        </span>
                        {sinOperar ? (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            sin operar ese día
                            {sinOperar.computa === false && " · no computa"}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {ts.length} {ts.length === 1 ? "operación" : "operaciones"}
                          </span>
                        )}
                        {!sinOperar && (
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
                        )}
                      </button>
                    </td>
                  </tr>
                  {abierto && sinOperar && (
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ color: "var(--text-secondary)", background: "rgba(100, 116, 139, 0.14)" }}
                        >
                          Sin operar
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {resultados?.dia ? formatoFechaCorta.format(fechaLocal(resultados.dia)) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        <span title="Cierre del día anterior (D-1), base del resultado del día">
                          {formatoARS2.format(sinOperar.precioAyer)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        <ValorSensible>{sinOperar.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {formatoARS2.format(sinOperar.precioActual)}
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(sinOperar.resultado) }}>
                        <div className="flex flex-col">
                          <ValorSensible>
                            {signo(sinOperar.resultado)}{formatoARS.format(Math.abs(sinOperar.resultado))}
                          </ValorSensible>
                          {sinOperar.gananciaNoRealizada != null && (
                            <span
                              style={{ color: resColor(sinOperar.gananciaNoRealizada) }}
                              title="Resultado contra el precio de compra original (desde la compra), no contra el cierre anterior."
                            >
                              <ValorSensible>
                                vs compra: {signo(sinOperar.gananciaNoRealizada)}{formatoARS.format(Math.abs(sinOperar.gananciaNoRealizada))}
                              </ValorSensible>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(sinOperar.variacionDiariaPct) }}>
                        {sinOperar.variacionDiariaPct == null ? (
                          "—"
                        ) : (
                          <ValorSensible>
                            {signo(sinOperar.variacionDiariaPct)}{(Math.abs(sinOperar.variacionDiariaPct) * 100).toFixed(2)}%
                          </ValorSensible>
                        )}
                      </td>
                    </tr>
                  )}
                  {abierto && !sinOperar && (
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Operación</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Fecha</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Precio operado</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Cantidad</th>
                  <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Precio cierre/actual</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Resultado del día</th>
                      <th className="px-3 py-1 text-left font-medium" style={{ color: "var(--text-muted)" }}>Rend. %</th>
                    </tr>
                  )}
                  {abierto && !sinOperar && (() => {
                      const filas = [];
                      ts.forEach((t) => {
                        if (t.tipo === "venta") {
                          for (const o of t.origenes || []) filas.push({ tipo: "origen", fecha: o.fecha, o, t });
                        }
                        filas.push({ tipo: "trade", fecha: t.fecha, t });
                      });
                      const operaciones = filas
                        .map((f, idx) => ({ ...f, idx }))
                        .sort((a, b) => {
                          const porFecha = (a.fecha || "").localeCompare(b.fecha || "");
                          if (porFecha !== 0) return porFecha;
                          const horaA = a.t?.hora || "24:00";
                          const horaB = b.t?.hora || "24:00";
                          if (horaA !== horaB) return horaA.localeCompare(horaB);
                          const nroA = Number(a.t?.nroOperacion);
                          const nroB = Number(b.t?.nroOperacion);
                          const ordA = Number.isFinite(nroA) ? nroA : a.idx;
                          const ordB = Number.isFinite(nroB) ? nroB : b.idx;
                          return ordA - ordB;
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
                                <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                              </tr>
                            );
                          }
                          const t = f.t;
                          const precioVivo = precioActualDe(t);
                          const resultado = resultadoDe(t);
                          const porcentaje = porcentajeDe(t);
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
                                <div className="flex flex-col">
                                  {formatoARS2.format(t.precio)}
                                  {esVenta && t.origenes?.length > 0 && t.baseResultado != null && (
                                    <span
                                      className="text-sm font-normal"
                                      style={{ color: "var(--text-secondary)" }}
                                      title="Precio de cierre anterior (D-1) usado como base del mark-to-market del día para la posición que ya se tenía."
                                    >
                                      Precio cierre anterior: {formatoARS2.format(t.baseResultado)}
                                    </span>
                                  )}
                                </div>
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
                                   <div className="flex flex-col">
                                     <ValorSensible>
                                       {signo(resultado)}{formatoARS.format(Math.abs(resultado))}
                                     </ValorSensible>
                                      {esVenta && t.origenes?.length > 0 && t.gananciaRealizada != null && (
                                        <span
                                          style={{ color: resColor(t.gananciaRealizada) }}
                                          title="Resultado contra el precio de compra original (realizado desde la compra), no contra el cierre anterior."
                                        >
                                          <ValorSensible>
                                            vs compra: {signo(t.gananciaRealizada)}{formatoARS.format(Math.abs(t.gananciaRealizada))}
                                          </ValorSensible>
                                        </span>
                                      )}

                                   </div>
                                 )}
                               </td>
                              <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(porcentaje) }}>
                                {porcentaje == null ? (
                                  <span style={{ color: "var(--text-muted)" }}>—</span>
                                ) : (
                                  <ValorSensible>
                                    {signo(porcentaje)}{(Math.abs(porcentaje) * 100).toFixed(2)}%
                                  </ValorSensible>
                                )}
                              </td>
                            </tr>
                          );
                        });

                      // Tenencia pendiente consolidada en UNA fila por ticker: suma las
                      // cantidades abiertas del día a precio promedio ponderado.
                      const abiertas = ts.filter((t) => t.tipo === "compra" && t.cantidadPendiente > 0);
                      const pendientes = (() => {
                        if (!abiertas.length) return [];
                        const primera = abiertas[0];
                        const precioVivo = precioActualDe(primera);
                        const factor = primera.factorPrecio ?? 1;
                        const rentaFija = esRentaFija(primera);
                        const totalPendiente = abiertas.reduce((acc, t) => acc + t.cantidadPendiente, 0);
                        const conPrecio = abiertas.filter((t) => t.precio != null);
                        const montoPonderado = conPrecio.reduce((acc, t) => acc + t.precio * t.cantidadPendiente, 0);
                        const cantidadConPrecio = conPrecio.reduce((acc, t) => acc + t.cantidadPendiente, 0);
                        const precioPromedio = cantidadConPrecio > 0 ? montoPonderado / cantidadConPrecio : null;
                        const rendimiento =
                          precioVivo != null && precioPromedio != null
                            ? (precioVivo - precioPromedio) * totalPendiente * factor
                            : null;
                        const porcentaje =
                          precioVivo != null && precioPromedio > 0 ? precioVivo / precioPromedio - 1 : null;
                        return [
                          <tr
                            key={`${clave}__pendiente`}
                            className="border-b last:border-0"
                            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                          >
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
                                  style={{ color: "var(--text-secondary)", background: "rgba(100, 116, 139, 0.14)" }}
                                  title={
                                    abiertas.length > 1
                                      ? `${abiertas.length} compras del día consolidadas a precio promedio`
                                      : undefined
                                  }
                                >
                                  Tenencia pendiente
                                  {abiertas.length > 1 ? ` (${abiertas.length})` : ""}
                                </span>
                                {rentaFija && (
                                  <span
                                    className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{ color: "var(--text-muted)", border: "1px dashed var(--border)" }}
                                    title="Se muestra a modo informativo y no se suma al Resultado del día"
                                  >
                                    no computa
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                              {formatoFechaCorta.format(fechaLocal(primera.fecha))}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                              {precioPromedio == null ? (
                                <span style={{ color: "var(--text-muted)" }}>—</span>
                              ) : (
                                formatoARS2.format(precioPromedio)
                              )}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                              <ValorSensible>{totalPendiente.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                              {precioVivo == null ? (
                                <span style={{ color: "var(--bad)" }}>sin precio</span>
                              ) : (
                                formatoARS2.format(precioVivo)
                              )}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(rendimiento) }}>
                              {rendimiento == null ? (
                                <span style={{ color: "var(--text-muted)" }}>—</span>
                              ) : (
                                <ValorSensible>
                                  {signo(rendimiento)}{formatoARS.format(Math.abs(rendimiento))}
                                </ValorSensible>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: resColor(porcentaje) }}>
                              {porcentaje == null ? (
                                <span style={{ color: "var(--text-muted)" }}>—</span>
                              ) : (
                                <ValorSensible>
                                  {signo(porcentaje)}{(Math.abs(porcentaje) * 100).toFixed(2)}%
                                </ValorSensible>
                              )}
                            </td>
                          </tr>,
                        ];
                      })();

                      return [...operaciones, ...pendientes];
                    })()}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!trades.length && sinOperarPorClave.size === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hubo compra/venta {etiquetaDia ? "el " + etiquetaDia : "ese día"}.
          </p>
        )}
        {Array.from(sinOperarPorClave.values()).some((r) => r.computa === false) && (
          <p className="px-4 pb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            La renta fija se lista a modo informativo: su variación no se incluye en el Resultado del día.
          </p>
        )}
      </div>

      {trades.some((t) => t.tipo === "venta" && t.origenes?.length > 0) && (
        <p className="px-4 pb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-secondary)" }}>Resultado del día</strong> mide la variación de la rueda: lo que ya
          tenías al cierre anterior se mide contra ese cierre y lo comprado ese día contra el precio de compra. Debajo, en gris,{" "}
          <strong style={{ color: "var(--text-secondary)" }}>vs compra</strong> es el resultado contra el precio de compra original
          (realizado desde la compra), que arrastra días previos.
        </p>
      )}

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
