"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import BotonOrden from "./BotonOrden";
import IconoCartera from "./IconoCartera";
import EditarPPP from "./EditarPPP";
import BadgeVariacionDiaria from "./BadgeVariacionDiaria";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

function formatoMoneda(valor, divisa) {
  if (valor == null) return "—";
  return divisa === "USD" ? formatoUSD.format(valor) : formatoARS.format(valor);
}

function IconoChevron({ abierto }) {
  return (
    <svg
      width="11"
      height="11"
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

const COLUMNAS_ORDENABLES = {
  activo: { campo: (t) => t.ticker || t.activo },
  cantidad: { campo: (t) => t.cantidad },
  costo: { campo: (t) => t.costoPromedio },
  precio: { campo: (t) => t.precioActual },
  variacionDiaria: { campo: (t) => t.variacionDiariaPct },
  valor: { campo: (t) => t.valorActualARS },
  retorno: { campo: (t) => t.retornoPct },
  pct: { campo: (t) => t.pctCartera },
  sector: { campo: (t) => t.sector },
};

export default function TablaTenencias({ tenencias }) {
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [orden, setOrden] = useState({ columna: "valor", direccion: "desc" });

  function alternarExpandido(clave) {
    setExpandidos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  function alHacerClick(columna) {
    setOrden((actual) => {
      if (actual?.columna !== columna) return { columna, direccion: "desc" };
      return { columna, direccion: actual.direccion === "desc" ? "asc" : "desc" };
    });
  }

  const filas = useMemo(() => {
    const { campo } = COLUMNAS_ORDENABLES[orden.columna];
    const signo = orden.direccion === "asc" ? 1 : -1;
    return [...tenencias].sort((a, b) => {
      const va = campo(a);
      const vb = campo(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const diferencia = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return diferencia * signo;
    });
  }, [tenencias, orden]);

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              <th className="px-3 py-2">
                <BotonOrden columna="activo" ordenActual={orden} onClick={alHacerClick}>Activo</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="cantidad" ordenActual={orden} onClick={alHacerClick}>Cantidad</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="variacionDiaria" ordenActual={orden} onClick={alHacerClick}>Hoy</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="precio" ordenActual={orden} onClick={alHacerClick}>Precio actual</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="costo" ordenActual={orden} onClick={alHacerClick}>Costo prom.</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="valor" ordenActual={orden} onClick={alHacerClick}>Valor (ARS)</BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="retorno" ordenActual={orden} onClick={alHacerClick}>Retorno</BotonOrden>
              </th>
              <th className="px-3 py-2" title="% de tu cartera total">
                <BotonOrden columna="pct" ordenActual={orden} onClick={alHacerClick}>
                  <IconoCartera size={13} />
                  <span>%</span>
                </BotonOrden>
              </th>
              <th className="px-3 py-2">
                <BotonOrden columna="sector" ordenActual={orden} onClick={alHacerClick}>Sector</BotonOrden>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => {
              const pctCartera = t.pctCartera ?? null;
              const tieneDetalle = t.detalleEfectivo?.length > 0;
              const expandido = expandidos.has(t.clave);
              return (
                <Fragment key={t.clave}>
                <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 align-top">
                    {t.esCash ? (
                      <div className="flex items-center gap-2">
                        {tieneDetalle ? (
                          <button
                            type="button"
                            onClick={() => alternarExpandido(t.clave)}
                            className="shrink-0"
                            style={{ color: "var(--text-muted)" }}
                            title={expandido ? "Contraer" : "Ver el detalle"}
                          >
                            <IconoChevron abierto={expandido} />
                          </button>
                        ) : (
                          <span className="inline-block w-3 shrink-0" />
                        )}
                        <Logo ticker={t.ticker} nombre={t.activo} />
                        <div style={{ color: "var(--text-primary)" }}>{t.activo}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex items-center gap-2 hover:underline">
                          <Logo ticker={t.ticker} nombre={t.activo} />
                          <div>
                            <div style={{ color: "var(--marca)" }}>{t.activo}</div>
                            {t.ticker && t.ticker !== t.activo && (
                              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t.ticker}</div>
                            )}
                          </div>
                        </Link>
                      </div>
                    )}
                    {t.sinPrecio && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--bad)" }}>sin precio de mercado</div>
                    )}
                    {t.usaPrecioManual && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>precio cargado a mano</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.esCash ? "—" : <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums">
                    {t.esCash ? "—" : <BadgeVariacionDiaria pct={t.variacionDiariaPct} />}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.esCash ? "—" : formatoMoneda(t.precioActual, t.divisa)}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.esCash ? (
                      "—"
                    ) : (
                      <>
                        {formatoMoneda(t.costoPromedio, t.divisa)}
                        {t.pppPendienteIEB && (
                          <div className="mt-0.5">
                            {t.costoManual && (
                              <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>cargado a mano</div>
                            )}
                            <EditarPPP clave={t.clave} divisa={t.divisa} valorActual={t.costoPromedio} />
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
                    <ValorSensible>{formatoMoneda(t.valorActualARS, "ARS")}</ValorSensible>
                  </td>
                  <td
                    className="px-3 py-2 align-top tabular-nums"
                    style={{ color: t.retornoPct == null ? "var(--text-muted)" : t.retornoPct >= 0 ? "var(--good)" : "var(--bad)" }}
                  >
                    {t.retornoPct == null ? "—" : formatoPct.format(t.retornoPct)}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {pctCartera == null ? "—" : formatoPct.format(pctCartera).replace(/^\+/, "")}
                  </td>
                  <td className="px-3 py-2 align-top" style={{ color: "var(--text-secondary)" }}>
                    {t.sector || "—"}
                  </td>
                </tr>
                {tieneDetalle && expandido && t.detalleEfectivo.map((d) => {
                  const pctItem = pctCartera != null && t.valorActualARS ? pctCartera * (d.valorARS / t.valorActualARS) : null;
                  return (
                    <tr key={d.clave} className="border-b last:border-0" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <td className="px-3 py-1.5 pl-10 text-xs" style={{ color: "var(--text-secondary)" }}>↳ {d.etiqueta}</td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {d.cantidad != null ? <ValorSensible>{d.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {formatoMoneda(d.precioActual, d.divisa)}
                      </td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                      <td className="px-3 py-1.5 text-xs tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
                        <ValorSensible>{formatoMoneda(d.valorARS, "ARS")}</ValorSensible>
                      </td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>—</td>
                      <td className="px-3 py-1.5 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {pctItem == null ? "—" : formatoPct.format(pctItem).replace(/^\+/, "")}
                      </td>
                      <td className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>—</td>
                    </tr>
                  );
                })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
