"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CLASES } from "@/lib/clasificacion";
import { factorPrecioPorClase, mercadoAbierto, precioVivo } from "@/lib/calculos";
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
        className="absolute top-0 right-0 hidden h-full cursor-col-resize sm:block"
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

/** Orden canónico de las cajas dentro del grupo "Pesos". */
const ORDEN_CAJA = { trading: 0, largo: 1, rentaFija: 2 };

const GRUPOS_TENENCIAS = [
  {
    id: "trading",
    etiqueta: "Trading",
    siempreVisible: true,
    esMiembro: (t) => !t.esCash && (t.sleeve === "trading" || (!t.sleeve && (t.claseActivo === CLASES.CEDEAR || t.claseActivo === CLASES.ACCION_LOCAL || t.claseActivo === CLASES.OTRO))),
  },
  {
    id: "largo",
    etiqueta: "Largo plazo",
    siempreVisible: true,
    esMiembro: (t) => !t.esCash && t.sleeve === "largo",
  },
  {
    id: "rentaFija",
    etiqueta: "Renta fija",
    siempreVisible: true,
    esMiembro: (t) => !t.esCash && (t.sleeve === "rentaFija" || (!t.sleeve && t.claseActivo === CLASES.BONO_SOBERANO)),
  },
  {
    id: "efectivo",
    etiqueta: "Pesos",
    siempreVisible: true,
    esMiembro: (t) => t.esCash === true,
  },
];

export default function TablaTenencias({ tenencias, diasTenencia, diaTenencia, esHistorico, modo }) {
  const [orden, setOrden] = useState({ columna: "activo", direccion: "asc" });
  const [live, setLive] = useState(null);
  // En sesión (BYMA 10:30–17:00 ART): precio vivo (ask). Fuera de sesión el
  // valor mostrado es el cierre — el título de la columna lo refleja.
  const [enSesion, setEnSesion] = useState(() => mercadoAbierto(new Date()));
  useEffect(() => {
    const id = setInterval(() => setEnSesion(mercadoAbierto(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  const [anchos, setAnchos] = useState({});
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set(["trading", "largo", "rentaFija", "rentaVariable", "efectivo"]));
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
        // El mapa `usa` solo hace falta en modo USA·USD: en el camino común no
        // se pide y la API se ahorra ~1 request a Yahoo por ticker.
        const qs = modoEfectivo === "usa" ? `?tickers=${encodeURIComponent(tickers.join(","))}&usa=1` : `?tickers=${encodeURIComponent(tickers.join(","))}`;
        const res = await fetch(`/api/precios${qs}`);
        const json = await res.json();
        if (!activo || !json?.cedear) return;
        if (modoEfectivo === "usa" && !json?.usa) return;
        setLive(json);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }
    refrescarRef.current = refrescar;

    // Sin refresco automático: solo al cargar y cuando se toca "Actualizar"
    function alActualizarGlobal() {
      refrescarRef.current?.();
    }
    window.addEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);

    refrescar();
    return () => {
      activo = false;
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
      // En móvil la tabla está oculta (se muestran tarjetas): no hay nada que medir.
      if (tabla.offsetParent === null) return;
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

  /** Precio vivo LOCAL en ARS (en rueda al ask, fuera de rueda al cierre). */
  function precioVivoDe(t) {
    const dato = t.ticker && liveVisible?.cedear ? liveVisible.cedear[t.ticker] : null;
    // Ojo con la moneda: el fallback a NYSE/NASDAQ viene en USD y no se puede
    // usar como ARS (pasó cuando data912 estuvo caído).
    if (!dato || (dato.moneda && dato.moneda !== "ARS")) return null;
    return precioVivo(dato, t.claseActivo) ?? null;
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

  /** Valores ya resueltos para mostrar (precio/valor vivos incluidos). Lo usan
   *  tanto la tabla (desktop) como las tarjetas (móvil) para no divergir. */
  function datosFila(t) {
    const pctCartera = t.pctCartera ?? null;
    const esRentaFija = t.claseActivo === CLASES.BONO_SOBERANO;
    const banderaArgentina = esRentaFija && t.divisa === "ARS";
    const datoCedear = t.ticker && liveVisible?.cedear ? liveVisible.cedear[t.ticker] : null;
    const enVivo = !esHistorico && (t.precioEnVivo || (datoCedear?.precio != null && (!datoCedear.moneda || datoCedear.moneda === "ARS")));
    const precioMostrado = precioParaOrden(t);
    const monedaMostrada = modoEfectivo === "usa" ? "USD" : (datoCedear?.moneda || t.divisa || "ARS");
    const costoPromedioMostrado = costoParaOrden(t);
    const retornoFila = retornoParaOrden(t);
    const monedaCosto = modoEfectivo === "usa" ? "USD" : t.divisa;
    const valorMostrado = valorDe(t);
    const monedaValor = modoEfectivo === "usa" ? "USD" : "ARS";
    return { pctCartera, banderaArgentina, enVivo, precioMostrado, monedaMostrada, costoPromedioMostrado, retornoFila, monedaCosto, valorMostrado, monedaValor };
  }

  function renderFila(t, indice = 0) {
    const { pctCartera, banderaArgentina, enVivo, precioMostrado, monedaMostrada, costoPromedioMostrado, retornoFila, monedaCosto, valorMostrado, monedaValor } = datosFila(t);
    return (
      <Fragment key={t.claveFila || t.clave}>
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
            {t.esCash ? "—" : <ValorSensible>{formatoPrecio(precioMostrado, monedaMostrada, t.claseActivo)}</ValorSensible>}
            {!t.esCash && t.ticker && !enVivo && precioMostrado != null && (
              <div className="mt-0.5 text-xs font-normal" style={{ color: "var(--text-muted)" }} title="Sin cotización en vivo: se muestra el último precio conocido">
                desactualizado
              </div>
            )}
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {t.esCash ? (
              "—"
            ) : (
              <>
                <ValorSensible>{formatoPrecio(costoPromedioMostrado, monedaCosto, t.claseActivo)}</ValorSensible>
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
            <ValorSensible ambito="total">{formatoMoneda(valorMostrado, monedaValor)}</ValorSensible>
          </td>
          <td className="px-2 py-1 align-middle tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {pctCartera == null ? "—" : formatoPct.format(pctCartera).replace(/^\+/, "")}
          </td>
        </tr>
      </Fragment>
    );
  }

  /** Tarjeta compacta para móvil: mismos números que la fila de la tabla,
   *  pero apilados (encabezado + grilla de 2 columnas) en vez de 8 columnas. */
  function renderTarjeta(t) {
    const d = datosFila(t);
    return (
      <div key={t.claveFila || t.clave} className="border-b px-3 py-2.5 last:border-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          {t.esCash ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Logo ticker={t.ticker} nombre={t.activo} />
              <div className="truncate text-sm" style={{ color: "var(--text-primary)" }}>{t.activo}</div>
            </div>
          ) : (
            <Link href={`/activo/${encodeURIComponent(t.clave)}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
              <Logo ticker={t.ticker} nombre={t.activo} banderaArgentina={d.banderaArgentina} />
              <div className="truncate text-sm font-bold" style={{ color: "var(--marca)" }}>{t.ticker || t.activo}</div>
            </Link>
          )}
          <div className="ml-auto shrink-0 text-right">
            <div className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              <ValorSensible ambito="total">{formatoMoneda(d.valorMostrado, d.monedaValor)}</ValorSensible>
            </div>
            <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {d.pctCartera == null ? "—" : formatoPct.format(d.pctCartera).replace(/^\+/, "")} del portafolio
            </div>
          </div>
        </div>
        {!t.esCash && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="min-w-0">
              <div style={{ color: "var(--text-muted)" }}>Cantidad</div>
              <div className="truncate tabular-nums" style={{ color: "var(--text-secondary)" }}>
                <ValorSensible>{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>
              </div>
            </div>
            <div className="min-w-0">
              <div style={{ color: "var(--text-muted)" }}>Retorno</div>
              <div className="truncate tabular-nums" style={{ color: d.retornoFila == null ? "var(--text-muted)" : d.retornoFila >= 0 ? "var(--good)" : "var(--bad)" }}>
                {d.retornoFila == null ? "—" : formatoPct.format(d.retornoFila)}
              </div>
            </div>
            <div className="min-w-0">
              <div style={{ color: "var(--text-muted)" }}>{esHistorico || !enSesion ? "Precio de cierre" : "Precio actual"} ({d.monedaMostrada})</div>
              <div className="truncate tabular-nums" style={{ color: "var(--text-secondary)" }}>
                <ValorSensible>{formatoPrecio(d.precioMostrado, d.monedaMostrada, t.claseActivo)}</ValorSensible>
                {t.ticker && !d.enVivo && d.precioMostrado != null && (
                  <span className="ml-1" style={{ color: "var(--text-muted)" }} title="Sin cotización en vivo: se muestra el último precio conocido">
                    · desact.
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <div style={{ color: "var(--text-muted)" }}>Costo prom. ({d.monedaCosto})</div>
              <div className="truncate tabular-nums" style={{ color: "var(--text-secondary)" }}>
                <ValorSensible>{formatoPrecio(d.costoPromedioMostrado, d.monedaCosto, t.claseActivo)}</ValorSensible>
              </div>
            </div>
            <div className="min-w-0">
              <div style={{ color: "var(--text-muted)" }}>Días de tenencia</div>
              <div className="truncate tabular-nums" style={{ color: t.diasTenencia == null ? "var(--text-muted)" : "var(--text-secondary)" }}>
                {t.diasTenencia == null ? "—" : `${Math.round(t.diasTenencia)} ${Math.round(t.diasTenencia) === 1 ? "día" : "días"}`}
              </div>
            </div>
            {t.cclCompra != null && (
              <div className="min-w-0">
                <div style={{ color: "var(--text-muted)" }}>CCL compra</div>
                <div className="tabular-nums italic" style={{ color: "var(--text-muted)" }}>
                  {formatoARS2.format(t.cclCompra)}
                </div>
              </div>
            )}
          </div>
        )}
        {t.sinPrecio && (
          <div className="mt-1 text-xs" style={{ color: "var(--bad)" }}>sin precio de mercado</div>
        )}
        {t.usaPrecioManual && (
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>precio cargado a mano</div>
        )}
        {t.pppPendienteIEB && !esHistorico && !t.esCash && (
          <div className="mt-1">
            {t.costoManual && (
              <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>cargado a mano</div>
            )}
            <EditarPPP clave={t.clave} divisa={t.divisa} valorActual={t.costoPromedio} />
          </div>
        )}
      </div>
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
    () =>
      GRUPOS_TENENCIAS.map((g) => {
        const filasGrupo = filas.filter(g.esMiembro);
        // Dentro del grupo "Pesos" se respeta el orden canónico trading →
        // largo plazo → renta fija, siempre: el orden alfabético por defecto
        // las dejaría como Largo, Renta fija, Trading, y por valor saltaría
        // primera la que tenga la caución.
        if (g.id === "efectivo") {
          filasGrupo.sort((a, b) => (ORDEN_CAJA[a.sleeve] ?? 99) - (ORDEN_CAJA[b.sleeve] ?? 99));
        }
        return { ...g, filas: filasGrupo };
      }).filter((g) => g.filas.length > 0 || g.siempreVisible),
    [filas]
  );

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="hidden overflow-x-auto md:block">
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
                  {esHistorico || !enSesion ? <>Precio de cierre {modoEfectivo === "usa" ? "(USD)" : "(ARS)"}</> : <>Precio actual {modoEfectivo === "usa" ? "(USD)" : "(ARS)"}</>}
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
              <ColumnaConAncho columna="pct" ancho={anchos.pct} onIniciarArrastre={iniciarArrastre} className="px-2 py-1.5" title="% de tu portafolio total">
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
                        className="fila-grupo flex w-full cursor-pointer items-center gap-2 text-left"
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
                          <span className="text-base sm:text-xl font-extrabold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            <ValorSensible ambito="total">{formatoMoneda(totalGrupoMostrado, modoEfectivo === "usa" ? "USD" : "ARS")}</ValorSensible>
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
      <div className="md:hidden">
        {grupos.map((g) => {
          const abierto = gruposAbiertos.has(g.id);
          const totalGrupo = g.filas.reduce((acc, t) => acc + (valorDe(t) || 0), 0);
          return (
            <div key={g.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => alternarGrupo(g.id)}
                className="fila-grupo flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2.5 text-left"
                style={{ background: "var(--surface-2)" }}
                title={abierto ? "Contraer" : "Expandir"}
              >
                <IconoChevron abierto={abierto} />
                <span className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                  {g.etiqueta}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {g.filas.length} {g.filas.length === 1 ? "tenencia" : "tenencias"}
                </span>
                {totalGrupo > 0 && (
                  <span className="ml-auto text-base font-extrabold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    <ValorSensible ambito="total">{formatoMoneda(totalGrupo, modoEfectivo === "usa" ? "USD" : "ARS")}</ValorSensible>
                  </span>
                )}
              </button>
              {abierto && <div>{g.filas.map((t) => renderTarjeta(t))}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
