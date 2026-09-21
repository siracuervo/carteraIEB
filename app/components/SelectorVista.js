"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import TablaTenencias from "./TablaTenencias";
import ResultadosDelDia from "./ResultadosDelDia";
import CalendarioDias from "./CalendarioDias";
import ValorSensible from "./ValorSensible";
import SlidersTraspaso from "./SlidersTraspaso";
import ListaTraspasos from "./ListaTraspasos";
import { EVENTO_ACTUALIZAR } from "./BotonActualizarTodo";
import { factorPrecioPorClase, precioVivo } from "@/lib/calculos";
import { clasificar } from "@/lib/clasificacion";
import { fechaLocal } from "@/lib/fechas";
import { aISO } from "@/lib/accesosRapidosFecha";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoFechaDia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "long" });

const REFRESCO_PRECIOS_MS = 60_000;

function resColor(valor) {
  return valor == null || valor === 0 ? "var(--text-muted)" : valor > 0 ? "var(--good)" : "var(--bad)";
}

function signo(valor) {
  return valor == null || valor === 0 ? "" : valor > 0 ? "+" : "−";
}

/** Total histórico con valores de cierre (sin precios en vivo): igual que `valorDe` de la tabla en vista histórica. */
function valorCierre(t) {
  if (t.esCash) return t.valorActualARS;
  if (t.precioActual == null) return t.valorActualARS;
  return t.precioActual * t.cantidad * factorPrecioPorClase(t.claseActivo);
}

export default function SelectorVista({ tenencias, resultadosDia, diasOperados, dia, tenenciasCierre, diasTenencia, diaTenencia, efectivoSleeves, traspasos }) {
  const [vista, setVista] = useState("tenencias");
  const [modo, setModo] = useState("cedear");
  // Hoy no es "histórico": ver la tenencia de hoy es lo mismo que la vista en
  // vivo (con refresco cada 60s), así ambas muestran siempre los mismos números.
  const esHoy = diaTenencia != null && diaTenencia === aISO(new Date());
  const esHistorico = !esHoy && diaTenencia != null && tenenciasCierre != null;
  // El calendario no ofrece hoy (para eso está la vista en vivo).
  const hoyISO = aISO(new Date());
  const diasTenenciaSinHoy = useMemo(() => (diasTenencia || []).filter((d) => d !== hoyISO), [diasTenencia, hoyISO]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalCierre = esHistorico ? (tenenciasCierre || []).reduce((acc, t) => acc + (valorCierre(t) || 0), 0) : 0;

  function cambiarDiaTenencia(nuevoDia) {
    const params = new URLSearchParams(searchParams);
    if (nuevoDia) params.set("diaTenencia", nuevoDia);
    else params.delete("diaTenencia");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function cambiarDia(nuevaDia) {
    const params = new URLSearchParams(searchParams);
    params.set("dia", nuevaDia);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Encabezado de resultados en vivo: mismos precios y total que la tabla de
  // abajo (se le pasa `live` para que filas y mosaico no diverjan).
  const tradesRes = useMemo(() => resultadosDia?.trades || [], [resultadosDia]);
  const rendimientosRes = useMemo(() => resultadosDia?.rendimientosTenencia || [], [resultadosDia]);
  const totalsRes = resultadosDia?.totals || null;
  const esUltimoRes = resultadosDia?.esUltimo ?? false;
  const tickersRes = useMemo(
    () => Array.from(new Set(tradesRes.filter((t) => t.tipo === "compra" && t.ticker).map((t) => t.ticker))),
    [tradesRes]
  );
  const [liveRes, setLiveRes] = useState(null);
  const refrescarResRef = useRef(null);

  useEffect(() => {
    if (!tickersRes.length || !esUltimoRes) return;
    let activo = true;

    async function refrescar() {
      try {
        const res = await fetch(`/api/precios?tickers=${encodeURIComponent(tickersRes.join(","))}`);
        const json = await res.json();
        if (!activo || !json?.cedear) return;
        setLiveRes(json);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }
    refrescarResRef.current = refrescar;

    function alActualizarGlobal() {
      refrescarResRef.current?.();
    }
    window.addEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);

    refrescar();
    const id = setInterval(refrescar, REFRESCO_PRECIOS_MS);
    return () => {
      activo = false;
      clearInterval(id);
      window.removeEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);
    };
  }, [tickersRes, esUltimoRes]);

  function precioActualResDe(t) {
    if (t.tipo !== "compra") return null;
    // Misma lógica que tenencias: ask en rueda, último operado fuera de ella.
    const dato = esUltimoRes ? liveRes?.cedear?.[t.ticker] : null;
    if (dato) {
      const { claseActivo } = clasificar({ activo: t.activo, ticker: t.ticker, operacion: null });
      const p = precioVivo(dato, claseActivo);
      if (p != null) return p;
    }
    return t.precioActual ?? null;
  }

  function rendimientoPendienteResDe(t) {
    if (t.tipo !== "compra" || !(t.cantidadPendiente > 0)) return null;
    const precioVivo = precioActualResDe(t);
    if (precioVivo == null || t.precio == null) return null;
    return (precioVivo - t.precio) * t.cantidadPendiente * (t.factorPrecio ?? 1);
  }

  function computaPendienteResDe(t) {
    if (t.claseActivo === "Bonos") return null;
    return rendimientoPendienteResDe(t);
  }

  const totalSinOperarRes = useMemo(
    () => rendimientosRes.reduce((acc, r) => acc + (r.computa === false ? 0 : r.resultado ?? 0), 0),
    [rendimientosRes]
  );
  const totalNoRealizadoRes = useMemo(() => {
    if (totalsRes && totalsRes.noRealizado != null && !esUltimoRes) return totalsRes.noRealizado;
    return tradesRes.reduce((acc, t) => acc + (computaPendienteResDe(t) ?? 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradesRes, liveRes, esUltimoRes]);
  const totalRes = (totalsRes?.realizado ?? 0) + totalNoRealizadoRes + totalSinOperarRes - (totalsRes?.gastos ?? 0);

  const etiquetaDiaRes = resultadosDia?.dia ? formatoFechaDia.format(fechaLocal(resultadosDia.dia)) : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setVista("tenencias")}
            className="cursor-pointer rounded-md px-5 py-2 text-sm font-semibold transition-colors"
            style={vista === "tenencias" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
          >
            Tenencias
          </button>
          <button
            type="button"
            onClick={() => setVista("resultados")}
            className="cursor-pointer rounded-md px-5 py-2 text-sm font-semibold transition-colors"
            style={vista === "resultados" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
          >
            Resultados diarios
          </button>
          <button
            type="button"
            onClick={() => setVista("efectivo")}
            className="cursor-pointer rounded-md px-5 py-2 text-sm font-semibold transition-colors"
            style={vista === "efectivo" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
          >
            Pesos por estrategia
          </button>
        </div>
        {vista === "tenencias" && (
          <div className="flex flex-wrap items-center gap-2">
            {esHistorico && (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Total:
                </span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  <ValorSensible>{formatoARS.format(totalCierre)}</ValorSensible>
                </span>
              </div>
            )}
            <CalendarioDias dias={diasTenenciaSinHoy} dia={diaTenencia} onElegir={cambiarDiaTenencia} />
            {esHistorico && (
              <button
                type="button"
                onClick={() => cambiarDiaTenencia(null)}
                title="Volver a la posición actual en vivo"
                className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                ← En vivo
              </button>
            )}
            {!esHistorico && (
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setModo("cedear")}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  style={modo === "cedear" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
                >
                  PESOS ARGENTINOS
                </button>
                <button
                  type="button"
                  onClick={() => setModo("usa")}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  style={modo === "usa" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
                >
                  USA · USD
                </button>
              </div>
            )}
          </div>
        )}
        {vista === "resultados" && (
          <div className="flex flex-wrap items-center gap-2">
            <CalendarioDias dias={diasOperados} dia={dia} onElegir={cambiarDia} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {etiquetaDiaRes ? etiquetaDiaRes[0].toUpperCase() + etiquetaDiaRes.slice(1) : ""}
              {!resultadosDia?.esHoy && esUltimoRes && " · último día con operaciones"}
            </span>
          </div>
        )}
      </div>
      <div className="min-h-[420px]">
      {vista === "tenencias" ? (
        <TablaTenencias
          tenencias={esHistorico ? tenenciasCierre : tenencias}
          diasTenencia={diasTenencia}
          diaTenencia={diaTenencia}
          esHistorico={esHistorico}
          modo={modo}
        />
      ) : vista === "resultados" ? (
        <ResultadosDelDia resultados={resultadosDia} diasOperados={diasOperados} dia={dia} live={liveRes} total={totalRes} />
      ) : (
        <div className="rounded-lg border p-4 min-h-[420px]" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Caja separada por estrategia desde el último Portafolio (arranca 100% en trading). Los traspasos cambian
            la proporción sin que entre ni salga plata de la cuenta.
          </p>
          <div className="mt-3 space-y-4">
            <SlidersTraspaso key={JSON.stringify(efectivoSleeves)} saldos={efectivoSleeves} />
            <ListaTraspasos traspasos={traspasos} saldos={efectivoSleeves} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}