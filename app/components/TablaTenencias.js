"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CLASES } from "@/lib/clasificacion";
import { factorPrecioPorClase } from "@/lib/calculos";
import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import BotonOrden from "./BotonOrden";
import IconoCartera from "./IconoCartera";
import EditarPPP from "./EditarPPP";
import { EVENTO_ACTUALIZAR } from "./BotonActualizarTodo";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARS2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
// Los precios y costos no son importes: los bonos cotizan con varios decimales
// (ej. 122,6 · PPP 121,90305), así que no se redondean a peso entero como los valores.
const formatoPrecioARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 6 });
const formatoPrecioARSsinDecimales = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

const REFRESCO_PRECIOS_MS = 60_000;

function formatoMoneda(valor, divisa) {
  if (valor == null) return "—";
  return divisa === "USD" ? formatoUSD.format(valor) : formatoARS.format(valor);
}

/** Igual que formatoMoneda pero sin redondear los decimales de precio/costo promedio (los CEDEARs se muestran sin decimales). */
function formatoPrecio(valor, divisa, claseActivo) {
  if (valor == null) return "—";
  if (divisa === "USD") return formatoUSD.format(valor);
  return claseActivo === CLASES.CEDEAR ? formatoPrecioARSsinDecimales.format(valor) : formatoPrecioARS.format(valor);
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
  valor: { campo: (t) => t.valorActualARS },
  diasTenencia: { campo: (t) => t.diasTenencia },
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

export default function TablaTenencias({ tenencias, diasTenencia, diaTenencia, esHistorico, modo }) {
  const [orden, setOrden] = useState({ columna: "activo", direccion: "asc" });
  const [live, setLive] = useState(null);
  const [anchos, setAnchos] = useState({});
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set(["rentaVariable", "rentaFija", "efectivo"]));
  const tablaRef = useRef(null);
  // En vista histórica no hay cotización viva: todo se valúa al cierre del día.
  // (el estado `live` puede traer precios de una visita previa a la vista en vivo;
  // se ignora por completo para no contaminar ni filas ni total con valores vivos)
  const modoEfectivo = esHistorico ? "cedear" : modo;
  const liveVisible = esHistorico ? null : live;

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
    if (!tickers.length || esHistorico) return;
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
  }, [tickers, modo, esHistorico]);

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

  function precioParaOrden(t) {
    const cedear = liveVisible?.cedear?.[t.ticker];
    const usa = liveVisible?.usa?.[t.ticker];
    return modoEfectivo === "usa" ? (usa?.precio ?? null) : (precioVivoDe(t) ?? t.precioActual);
  }

  /** Precio vivo a mostrar: bonos al último operado, el resto a la punta vendedora. */
  function precioVivoDe(t) {
    const dato = t.ticker && liveVisible?.cedear ? liveVisible.cedear[t.ticker] : null;
    if (!dato) return null;
    return t.claseActivo === CLASES.BONO_SOBERANO ? (dato.ultimo ?? dato.precio) : dato.precio;
  }

  /** Valor de una tenencia con el precio en vivo que se muestra: precio × cantidad × factor (÷ dólar en modo USA). */
  function valorDe(t) {
    if (t.esCash) return t.valorActualARS;
    const ccl = liveVisible?.ccl ?? null;
    // El valor siempre se calcula con la cotización LOCAL en ARS (precioVivoDe),
    // que ya incluye el ratio del CEDEAR contra el subyacente. En modo USA solo cambia
    // la MONEDA mostrada (÷ CCL) — no se multiplica por el precio USD del subyacente.
    const precioLocal = precioVivoDe(t) ?? t.precioActual;
    const factorPrecio = factorPrecioPorClase(t.claseActivo);
    if (precioLocal == null) return modoEfectivo === "usa" && ccl ? t.valorActualARS / ccl : t.valorActualARS;
    const enARS = precioLocal * t.cantidad * factorPrecio;
    return modoEfectivo === "usa" && ccl ? enARS / ccl : enARS;
  }

  function costoParaOrden(t) {
    if (modoEfectivo !== "usa") return t.costoPromedio;
    const precioLocal = precioVivoDe(t);
    const precioUSA = liveVisible?.usa?.[t.ticker]?.precio;
    const ccl = liveVisible?.ccl;
    if (!(precioLocal > 0) || !(precioUSA > 0) || !(ccl > 0) || !(t.costoPromedioUSD > 0)) return null;
    const ratioCedear = precioLocal / (precioUSA * ccl);
    return t.costoPromedioUSD / ratioCedear;
  }

  function retornoParaOrden(t) {
    if (t.esCash) return t.retornoPct;
    const precio = precioParaOrden(t);
    const costo = costoParaOrden(t);
    if (!Number.isFinite(precio) || !Number.isFinite(costo) || costo <= 0) return null;
    return precio / costo - 1;
  }

  function renderFila(t, indice = 0) {
    const pctCartera = t.pctCartera ?? null;
    const esRentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
    const banderaArgentina = esRentaFija && t.divisa === "ARS";
    const datoCedear = t.ticker && liveVisible?.cedear ? liveVisible.cedear[t.ticker] : null;
    const precioMostrado = precioParaOrden(t);
    const monedaMostrada = modoEfectivo === "usa" ? "USD" : (datoCedear?.moneda || t.divisa || "ARS");
    const costoPromedioMostrado = costoParaOrden(t);
    const retornoFila = retornoParaOrden(t);
    const monedaCosto = modoEfectivo === "usa" ? "USD" : t.divisa;
    const valorMostrado = valorDe(t);
    const monedaValor = modoEfectivo === "usa" ? "USD" : "ARS";
    return (
      <Fragment key={t.clave}>
        <tr className="border-b last:border-0" style={{ borderColor: "var(--border)", background: indice % 2 === 1 ? "var(--gridline)" : "transparent" }}>
          <td className="px-2 py-1 align-middle">
            {t.esCash ? (
              <div className="flex items-center gap-2">
                <Logo ticker={t.ticker} nombre={t.activo} />
                <div style={{ color: "var(--text-primary)" }}>{t.activo}</div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex items-center gap-2 hover:underline">
                  <Logo ticker={t.ticker} nombre={t.activo} banderaArgentina={banderaArgentina} />
                  <div className="font-bold" style={{ color: "var(--marca)" }}>{t.ticker || t.activo}</div>
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
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? "—" : <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>}
          </td>
          <td
            className="px-2 py-1 align-middle tabular-nums"
            style={{ color: retornoFila == null ? "var(--text-muted)" : retornoFila >= 0 ? "var(--good)" : "var(--bad)" }}
          >
            {retornoFila == null ? "—" : formatoPct.format(retornoFila)}
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: t.diasTenencia == null ? "var(--text-muted)" : "var(--text-secondary)" }}>
            {t.esCash || t.diasTenencia == null ? "—" : `${Math.round(t.diasTenencia)} ${Math.round(t.diasTenencia) === 1 ? "día" : "días"}`}
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? "—" : formatoPrecio(precioMostrado, monedaMostrada, t.claseActivo)}
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? (
              "—"
            ) : (
              <>
                {formatoPrecio(costoPromedioMostrado, monedaCosto, t.claseActivo)}
                {!t.esCash && t.cclCompra != null && (
                  <div className="mt-0.5 text-xs italic" style={{ color: "var(--text-muted)" }} title="Dólar CCL promedio de las compras de esta tenencia">
                    CCL {formatoARS2.format(t.cclCompra)}
                  </div>
                )}
                {t.pppPendienteIEB && !esHistorico && (
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
          <td className="px-2 py-1 align-middle tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
            <ValorSensible>{formatoMoneda(valorMostrado, monedaValor)}</ValorSensible>
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
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
    const visibles = modoEfectivo === "usa" ? tenencias.filter((t) => t.claseActivo === CLASES.CEDEAR) : tenencias;
    return [...visibles].sort((a, b) => {
      const obtenerValor = orden.columna === "precio" ? precioParaOrden : orden.columna === "costo" ? costoParaOrden : orden.columna === "retorno" ? retornoParaOrden : campo;
      const va = obtenerValor(a);
      const vb = obtenerValor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const diferencia = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return diferencia * signo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenencias, orden, liveVisible, modoEfectivo]);

  const grupos = useMemo(
    () => GRUPOS_TENENCIAS.map((g) => ({ ...g, filas: filas.filter(g.esMiembro) })).filter((g) => g.filas.length > 0),
    [filas]
  );

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="overflow-x-auto">
        <table
          ref={tablaRef}
          className={
            Object.keys(anchos).length
              ? "tabla-tenencias w-full table-fixed text-sm"
              : "tabla-tenencias w-full text-sm"
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
              <ColumnaConAncho columna="retorno" ancho={anchos.retorno} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="retorno" ordenActual={orden} onClick={alHacerClick}>Retorno</BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="diasTenencia" ancho={anchos.diasTenencia} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5" title="Días desde el lote abierto más antiguo de la posición (lo de hoy se cuenta 0)">
                <BotonOrden columna="diasTenencia" ordenActual={orden} onClick={alHacerClick}>
                  Días de tenencia
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="precio" ancho={anchos.precio} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="precio" ordenActual={orden} onClick={alHacerClick}>
                  {esHistorico ? "Precio cierre (ARS)" : <>Precio actual {modoEfectivo === "usa" ? "(USD)" : "(ARS)"}</>}
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="costo" ancho={anchos.costo} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="costo" ordenActual={orden} onClick={alHacerClick}>
                  Costo prom. {modoEfectivo === "usa" ? "(USD)" : "(ARS)"}
                </BotonOrden>
              </ColumnaConAncho>
              <ColumnaConAncho columna="valor" ancho={anchos.valor} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5">
                <BotonOrden columna="valor" ordenActual={orden} onClick={alHacerClick}>Posición {modoEfectivo === "usa" ? "(USD)" : "(ARS)"}</BotonOrden>
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
              const totalGrupo = g.filas.reduce((acc, t) => acc + (valorDe(t) || 0), 0);
              const totalGrupoMostrado = totalGrupo;
              return (
                <Fragment key={g.id}>
                  <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <td colSpan={8} className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => alternarGrupo(g.id)}
                        className="flex w-full cursor-pointer items-center gap-2 text-left"
                        title={abierto ? "Contraer" : "Expandir"}
                      >
                        <IconoChevron abierto={abierto} />
                        <span className="text-sm font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                          {g.etiqueta}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {g.filas.length} {g.filas.length === 1 ? "tenencia" : "tenencias"}
                        </span>
                        {totalGrupo > 0 && (
                          <span className="text-xl font-extrabold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            {formatoMoneda(totalGrupoMostrado, modoEfectivo === "usa" ? "USD" : "ARS")}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                  {abierto && g.filas.map((t, i) => renderFila(t, i))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
