"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CLASES } from "@/lib/clasificacion";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import BotonOrden from "./BotonOrden";
import IconoCartera from "./IconoCartera";
import EditarPPP from "./EditarPPP";
import BadgeVariacionDiaria from "./BadgeVariacionDiaria";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const formatoHora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const REFRESCO_PRECIOS_MS = 60_000;

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

function ColumnaConAncho({ columna, ancho, onIniciarArrastre, className, estilo, title, children }) {
  const [hover, setHover] = useState(false);
  return (
    <th
      data-columna={columna}
      className={className}
      title={title}
      style={{ position: "relative", width: ancho ?? undefined, ...estilo }}
    >
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        title="Arrastrá para redimensionar"
        onMouseDown={(e) => onIniciarArrastre(columna, e)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="absolute top-0 right-0 h-full cursor-col-resize"
        style={{
          width: hover ? 7 : 3,
          background: hover ? "var(--marca)" : "var(--border)",
          opacity: hover ? 0.9 : 0.4,
          zIndex: 2,
          transition: "width 0.05s ease-out",
        }}
      />
    </th>
  );
}

const COLUMNAS_ORDENABLES = {
  activo: { campo: (t) => t.ticker || t.activo },
  cantidad: { campo: (t) => t.cantidad },
  costo: { campo: (t) => t.costoPromedio },
  precio: { campo: (t) => t.precioActual },
  variacionDiaria: { campo: (t) => t.variacionDiariaPct },
  cclCompra: { campo: (t) => t.cclCompra },
  valor: { campo: (t) => t.valorActualARS },
  retorno: { campo: (t) => t.retornoPct },
  pct: { campo: (t) => t.pctCartera },
};

const GRUPOS_TENENCIAS = [
  {
    id: "rentaVariable",
    etiqueta: "Renta variable",
    esMiembro: (t) => t.claseActivo === CLASES.CEDEAR || t.claseActivo === CLASES.ACCION_LOCAL || t.claseActivo === CLASES.OTRO,
  },
  {
    id: "rentaFija",
    etiqueta: "Renta fija",
    esMiembro: (t) => t.claseActivo === CLASES.BONO_SOBERANO,
  },
  {
    id: "efectivo",
    etiqueta: "Efectivo",
    esMiembro: (t) => t.claseActivo === CLASES.EFECTIVO || t.esCash,
  },
];

export default function TablaTenencias({ tenencias }) {
  const [orden, setOrden] = useState({ columna: "valor", direccion: "desc" });
  const [live, setLive] = useState(null);
  const [modo, setModo] = useState("cedear");
  const [anchos, setAnchos] = useState({});
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set(["rentaVariable", "rentaFija", "efectivo"]));
  const tablaRef = useRef(null);
  const arrastre = useRef(null);
  const refrescarRef = useRef(null);
  const [refrescando, setRefrescando] = useState(false);

  function medirAnchos() {
    const tabla = tablaRef.current;
    if (!tabla) return null;
    const medidos = {};
    for (const th of tabla.querySelectorAll("thead th")) {
      const col = th.dataset.columna;
      if (col) medidos[col] = Math.max(70, Math.round(th.offsetWidth));
    }
    return medidos;
  }

  function iniciarArrastre(columna, event) {
    event.preventDefault();
    let anchoInicio;
    // En modo "auto" (sin anchos definidos) las columnas miden el contenido: fijamos
    // esos anchos como base antes de empezar a arrastrar.
    if (Object.keys(anchos).length === 0) {
      const base = medirAnchos();
      if (!base) return;
      setAnchos(base);
      anchoInicio = base[columna];
    } else {
      const th = event.currentTarget.closest("th");
      if (!th) return;
      anchoInicio = th.getBoundingClientRect().width;
    }
    const xInicio = event.clientX;
    arrastre.current = { columna, xInicio, anchoInicio };

    const alMover = (e) => {
      const nuevo = Math.max(70, Math.min(600, arrastre.current.anchoInicio + (e.clientX - arrastre.current.xInicio)));
      setAnchos((actual) => (actual[arrastre.current.columna] === nuevo ? actual : { ...actual, [arrastre.current.columna]: nuevo }));
    };
    const alSoltar = () => {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
      const finales = medirAnchos();
      if (finales) {
        setAnchos((actual) => (Object.keys(actual).length ? actual : { ...actual, ...finales }));
      }
      arrastre.current = null;
    };
    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
  }

  const tickers = useMemo(
    () => Array.from(new Set(tenencias.filter((t) => !t.esCash && t.ticker).map((t) => t.ticker))),
    [tenencias]
  );

  useEffect(() => {
    if (!tickers.length) return;
    let activo = true;

    async function refrescar() {
      try {
        const res = await fetch(`/api/precios?tickers=${encodeURIComponent(tickers.join(","))}`);
        const json = await res.json();
        if (!activo || !json?.cedear || !json?.usa) return;
        setLive(json);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }
    refrescarRef.current = refrescar;

    refrescar();
    const id = setInterval(refrescar, REFRESCO_PRECIOS_MS);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, [tickers, modo]);

  useEffect(() => {
    // Medimos el contenido real en modo auto en cada carga y fijamos los anchos,
    // escalados para que quepan en el ancho disponible (sin scroll horizontal).
    // Así las columnas acompañan los cambios de contenido y ambas pestañas usan
    // exactamente los mismos anchos.
    let cancelado = false;
    const id = requestAnimationFrame(() => {
      if (cancelado) return;
      const tabla = tablaRef.current;
      if (!tabla) return;
      // Anchura que necesita cada columna para que el nombre de la columna entre en
      // una sola línea (scrollWidth = ancho del contenido sin saltos de línea) y para
      // que entre el contenido más ancho de sus celdas.
      const ths = Array.from(tabla.querySelectorAll("thead th")).filter((th) => th.dataset.columna);
      const requeridos = {};
      for (const th of ths) {
        const columa = th.dataset.columna;
        const est = getComputedStyle(th);
        const padX = Math.round(
          parseFloat(est.paddingLeft) +
            parseFloat(est.paddingRight) +
            parseFloat(est.borderLeftWidth) +
            parseFloat(est.borderRightWidth)
        );
        const boton = th.querySelector("button");
        const anchoHeader = (boton ? boton.scrollWidth : th.offsetWidth) + padX;
        let anchoCuerpo = 0;
        for (const tr of tabla.querySelectorAll("tbody tr")) {
          const celda = tr.cells[ths.indexOf(th)];
          if (!celda || celda.colSpan !== 1) continue;
          anchoCuerpo = Math.max(anchoCuerpo, celda.scrollWidth);
        }
        requeridos[columa] = Math.max(60, anchoHeader, anchoCuerpo);
      }
      if (!Object.keys(requeridos).length) return;
      // Si el total supera el ancho disponible lo reducimos proporcionalmente, para
      // que no aparezca scroll horizontal.
      const disponible = (tabla.parentElement && tabla.parentElement.clientWidth) || 0;
      const total = Object.keys(requeridos).reduce((acc, col) => acc + requeridos[col], 0);
      let finales = requeridos;
      if (disponible > 0 && total > disponible) {
        const factor = disponible / total;
        finales = {};
        for (const [col, w] of Object.entries(requeridos)) {
          finales[col] = Math.max(60, Math.round(w * factor));
        }
      }
      setAnchos((actual) => (Object.keys(actual).length ? actual : { ...actual, ...finales }));
    });
    return () => {
      cancelado = true;
      cancelAnimationFrame(id);
    };
  }, []);

  function alternarGrupo(id) {
    setGruposAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function alHacerClick(columna) {
    setOrden((actual) => {
      if (actual?.columna !== columna) return { columna, direccion: "desc" };
      return { columna, direccion: actual.direccion === "desc" ? "asc" : "desc" };
    });
  }

  function cambiarModo(m) {
    if (m === modo) return;
    setModo(m);
  }

  function precioParaOrden(t) {
    const cedear = live?.cedear?.[t.ticker];
    const usa = live?.usa?.[t.ticker];
    return modo === "usa" ? (usa?.precio ?? null) : (cedear?.precio ?? t.precioActual);
  }

  function renderFila(t) {
    const pctCartera = t.pctCartera ?? null;
    const esRentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
    const banderaArgentina = esRentaFija && t.divisa === "ARS";
    const datoCedear = t.ticker && live?.cedear ? live.cedear[t.ticker] : null;
    const datoUSA = t.ticker && live?.usa ? live.usa[t.ticker] : null;
    const ccl = live?.ccl ?? null;
    const precioMostrado = modo === "usa" ? (datoUSA?.precio ?? null) : (datoCedear?.precio ?? t.precioActual);
    const monedaMostrada = modo === "usa" ? "USD" : (datoCedear?.moneda || t.divisa || "ARS");
    const ratioCedear =
      datoCedear?.precio && datoUSA?.precio && ccl ? datoCedear.precio / (datoUSA.precio * ccl) : null;
    // costo en la misma unidad que el precio USD (por acción subyacente):
    // costoPromedioUSD ya convierte cada compra con el CCL de su propio día;
    // / ratio lo expresa por acción subyacente.
    const costoPromedioMostrado =
      modo === "usa"
        ? t.costoPromedioUSD != null && ratioCedear
          ? t.costoPromedioUSD / ratioCedear
          : null
        : t.costoPromedio;
    const monedaCosto = modo === "usa" ? "USD" : t.divisa;
    const valorMostrado =
      modo === "usa" && ccl ? t.valorActualARS / ccl : t.valorActualARS;
    const monedaValor = modo === "usa" ? "USD" : "ARS";
    const variacionDiaria = modo === "usa" ? (datoUSA?.variacionDiariaPct ?? null) : (datoCedear?.variacionDiariaPct ?? t.variacionDiariaPct);
    return (
      <Fragment key={t.clave}>
        <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
          <td className="px-2 py-1.5 align-top">
            {t.esCash ? (
              <div className="flex items-center gap-2">
                <Logo ticker={t.ticker} nombre={t.activo} />
                <div style={{ color: "var(--text-primary)" }}>{t.activo}</div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex items-center gap-2 hover:underline">
                  <Logo ticker={t.ticker} nombre={t.activo} banderaArgentina={banderaArgentina} />
                  <div style={{ color: "var(--marca)" }}>{t.ticker || t.activo}</div>
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
          <td className="px-2 py-1.5 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? "—" : <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>}
          </td>
          <td className="px-2 py-1.5 align-top tabular-nums">
            {t.esCash ? "—" : <BadgeVariacionDiaria pct={variacionDiaria} />}
          </td>
          <td className="px-2 py-1.5 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? "—" : formatoMoneda(precioMostrado, monedaMostrada)}
          </td>
          <td className="px-2 py-1.5 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? (
              "—"
            ) : (
              <>
                {formatoMoneda(costoPromedioMostrado, monedaCosto)}
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
          <td className="px-2 py-1.5 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? "—" : t.cclCompra == null ? "—" : formatoARS2.format(t.cclCompra)}
          </td>
          <td className="px-2 py-1.5 align-top tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
            <ValorSensible>{formatoMoneda(valorMostrado, monedaValor)}</ValorSensible>
          </td>
          <td
            className="px-2 py-1.5 align-top tabular-nums"
            style={{ color: t.retornoPct == null ? "var(--text-muted)" : t.retornoPct >= 0 ? "var(--good)" : "var(--bad)" }}
          >
            {t.retornoPct == null ? "—" : formatoPct.format(t.retornoPct)}
          </td>
          <td className="px-2 py-1.5 align-top tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {pctCartera == null ? "—" : formatoPct.format(pctCartera).replace(/^\+/, "")}
          </td>
        </tr>
      </Fragment>
    );
  }

  const filas = useMemo(() => {
    const { campo } = COLUMNAS_ORDENABLES[orden.columna];
    const signo = orden.direccion === "asc" ? 1 : -1;
    // En modo USA solo tienen equivalente en dólares los CEDEARs; el resto (bonos,
    // efectivo) no se muestra acá.
    const visibles = modo === "usa" ? tenencias.filter((t) => t.claseActivo === CLASES.CEDEAR) : tenencias;
    return [...visibles].sort((a, b) => {
      const va = orden.columna === "precio" ? precioParaOrden(a) : campo(a);
      const vb = orden.columna === "precio" ? precioParaOrden(b) : campo(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const diferencia = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return diferencia * signo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenencias, orden, live, modo]);

  const grupos = useMemo(
    () => GRUPOS_TENENCIAS.map((g) => ({ ...g, filas: filas.filter(g.esMiembro) })).filter((g) => g.filas.length > 0),
    [filas]
  );

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {tickers.length > 0 && (
        <div className="grid grid-cols-1 items-center gap-2 px-4 pt-4 sm:grid-cols-[1fr_auto_1fr]">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Tenencias</h2>
          {live?.ts && (
            <span className="flex items-center justify-center gap-2 text-xs sm:order-none order-last" style={{ color: "var(--text-muted)" }}>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--good)" }} />
              actualizado {formatoHora.format(live.ts)}
              <button
                type="button"
                onClick={() => refrescarRef.current?.()}
                title="Refrescar precios ahora (sin esperar al intervalo de 60 s)"
                className="cursor-pointer rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--marca)"; e.currentTarget.style.borderColor = "var(--marca)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Actualizar
              </button>
            </span>
          )}
          <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
            <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => cambiarModo("cedear")}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                style={modo === "cedear" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
              >
                PESOS ARGENTINOS
              </button>
              <button
                type="button"
                onClick={() => cambiarModo("usa")}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                style={modo === "usa" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
              >
                USA · USD
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table
          ref={tablaRef}
          className={
            Object.keys(anchos).length
              ? "w-full table-fixed text-sm"
              : "w-full text-sm"
          }
        >
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              <ColumnaConAncho columna="activo" ancho={anchos.activo} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="activo" ordenActual={orden} onClick={alHacerClick}>Activo</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="cantidad" ancho={anchos.cantidad} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="cantidad" ordenActual={orden} onClick={alHacerClick}>Cantidad</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="variacionDiaria" ancho={anchos.variacionDiaria} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="variacionDiaria" ordenActual={orden} onClick={alHacerClick}>Hoy</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="precio" ancho={anchos.precio} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="precio" ordenActual={orden} onClick={alHacerClick}>
                  Precio actual {modo === "usa" ? "(USD)" : "(ARS)"}
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="costo" ancho={anchos.costo} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="costo" ordenActual={orden} onClick={alHacerClick}>
                  Costo prom. {modo === "usa" ? "(USD)" : "(ARS)"}
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="cclCompra" ancho={anchos.cclCompra} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5" title="Dólar CCL promedio de las compras de esta tenencia">
                <BotonOrden columna="cclCompra" ordenActual={orden} onClick={alHacerClick}>
                  Dolar CCL promedio
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="valor" ancho={anchos.valor} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="valor" ordenActual={orden} onClick={alHacerClick}>Valor {modo === "usa" ? "(USD)" : "(ARS)"}</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="retorno" ancho={anchos.retorno} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="retorno" ordenActual={orden} onClick={alHacerClick}>Retorno</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="pct" ancho={anchos.pct} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5" title="% de tu cartera total">
                <BotonOrden columna="pct" ordenActual={orden} onClick={alHacerClick}>
                  <IconoCartera size={13} />
                  <span>%</span>
                </BotonOrden>
              </ColumnaConAncho>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const abierto = gruposAbiertos.has(g.id);
              const totalGrupo = g.filas.reduce((acc, t) => acc + (t.valorActualARS || 0), 0);
              const cclActual = live?.ccl ?? null;
              const totalGrupoMostrado = modo === "usa" && cclActual ? totalGrupo / cclActual : totalGrupo;
              return (
                <Fragment key={g.id}>
                  <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <td colSpan={9} className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(g.id)}
                        className="flex w-full cursor-pointer items-center gap-2 text-left"
                        title={abierto ? "Contraer" : "Expandir"}
                      >
                        <IconoChevron abierto={abierto} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                          {g.etiqueta}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {g.filas.length} {g.filas.length === 1 ? "tenencia" : "tenencias"}
                        </span>
                        {totalGrupo > 0 && (
                          <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            {formatoMoneda(totalGrupoMostrado, modo === "usa" ? "USD" : "ARS")}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                  {abierto && g.filas.map(renderFila)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
