"use client";

import { useEffect, useState } from "react";
import GraficoEvolucionPatrimonio from "./GraficoEvolucionPatrimonio";
import MedidorGanancia, { GananciaSleeve } from "./MedidorGanancia";
import { ACCESOS_RAPIDOS_FECHA } from "@/lib/accesosRapidosFecha";

const OPCIONES = [
  { id: "grafico", etiqueta: "Gráfico" },
  { id: "medidor", etiqueta: "Rendimiento por periodos" },
  { id: "variable", etiqueta: "Ganancias - Estrategia" },
];

const SUBSLEEVES = [
  { id: "trading", etiqueta: "Trading" },
  { id: "largo", etiqueta: "Largo plazo" },
  { id: "rentaFija", etiqueta: "Renta fija" },
];

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/**
 * Selector entre la evolución clásica (línea), el medidor de ganancia total
 * entre periodos personalizables y el de trading. Las dos últimas pestañas
 * comparten las fechas elegidas.
 */
export default function PanelEvolucionPatrimonio({ serie, snapshots, transacciones, fondos, traspasos, serieLargo, serieTrading, serieEfectivoTrading, serieEfectivoLargo, serieRentaFija, serieEfectivoRentaFija, serieCostoTrading, serieCostoLargo, serieCostoRentaFija, fechaCorteSleeves }) {
  const [vista, setVista] = useState("grafico");
  const [sleeve, setSleeve] = useState("trading");
  const puntos = (snapshots || []).filter((p) => p.fecha && p.valorTotalARS != null);
  const fechaInicio = puntos[0]?.fecha || "";
  const fechaFin = puntos[puntos.length - 1]?.fecha || "";
  const getRangoEstaSemana = () => {
    if (!puntos.length) return { desde: fechaInicio, hasta: fechaFin };
    const r = ACCESOS_RAPIDOS_FECHA.find((x) => x.etiqueta === "Esta semana")?.calcular(fechaInicio);
    if (!r) return { desde: fechaInicio, hasta: fechaFin };
    const clamp = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
    return { desde: clamp(r.desde), hasta: clamp(r.hasta) };
  };
  const rangoInicial = getRangoEstaSemana();
  const [desde, setDesde] = useState(rangoInicial.desde);
  const [hasta, setHasta] = useState(rangoInicial.hasta);

  useEffect(() => {
    if (!puntos.length) return;
    const actualEsDefault = desde === "" && hasta === "";
    const esRangoInicial = desde === fechaInicio && hasta === fechaFin;
    if (actualEsDefault || esRangoInicial) {
      const r = getRangoEstaSemana();
      const c = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
      const nd = c(r.desde);
      const nh = c(r.hasta);
      if (nd !== desde || nh !== hasta) {
        setDesde(nd);
        setHasta(nh);
      }
    }
  }, [fechaInicio, fechaFin]); // eslint-disable-line react-hooks/exhaustive-deps

  function fijar(nuevoDesde, nuevoHasta) {
    const c = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
    setDesde(c(nuevoDesde));
    setHasta(c(nuevoHasta));
  }

  const enPeriodo = vista === "medidor" || vista === "variable";

  return (
    <div className="flex h-[360px] min-h-[320px] flex-col overflow-hidden text-sm sm:h-[300px] sm:min-h-[300px]">
      <div className="mb-1.5 flex min-w-0 max-w-full shrink-0 gap-2 overflow-x-auto whitespace-nowrap sm:gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {OPCIONES.map((opcion) => {
          const activa = vista === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setVista(opcion.id)}
              className="shrink-0 border-b-2 py-0.5 text-xs font-medium sm:text-sm"
              style={{
                color: activa ? "var(--marca)" : "var(--text-muted)",
                borderColor: activa ? "var(--marca)" : "transparent",
              }}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
      {enPeriodo && puntos.length > 1 && (
        <>
          <div className="mb-1.5 flex shrink-0 flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Desde
              <input type="date" value={desde} min={fechaInicio} max={fechaFin} style={estiloInput} className="w-full min-w-0 rounded border px-2 py-0.5 text-sm" onChange={(e) => fijar(e.target.value, hasta)} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Hasta
              <input type="date" value={hasta} min={fechaInicio} max={fechaFin} style={estiloInput} className="w-full min-w-0 rounded border px-2 py-0.5 text-sm" onChange={(e) => fijar(desde, e.target.value)} />
            </label>
          </div>
          <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-1">
            {ACCESOS_RAPIDOS_FECHA.map(({ etiqueta, calcular }) => {
              const rango = calcular(fechaInicio);
              const activo = desde === rango.desde && hasta === rango.hasta;
              return (
                <button
                  key={etiqueta}
                  type="button"
                  onClick={() => fijar(rango.desde, rango.hasta)}
                  className="shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-xs"
                  style={{
                    borderColor: activo ? "var(--marca)" : "var(--border)",
                    background: activo ? "var(--marca-suave)" : "var(--surface-1)",
                    color: activo ? "var(--marca)" : "var(--text-secondary)",
                  }}
                >
                  {etiqueta}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {vista === "grafico" ? (
          <div className="flex flex-1 flex-col justify-center overflow-hidden py-1">
            <GraficoEvolucionPatrimonio serie={serie} />
          </div>
        ) : vista === "medidor" ? (
          <div className="flex flex-1 flex-col justify-center overflow-y-auto py-1">
            <MedidorGanancia snapshots={snapshots} desde={desde} hasta={hasta} fondos={fondos} transacciones={transacciones} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-1 flex shrink-0 gap-1">
              {SUBSLEEVES.map((s) => {
                const activo = sleeve === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSleeve(s.id)}
                    className="cursor-pointer rounded-full border px-2 py-0.5 text-xs"
                    style={{
                      borderColor: activo ? "var(--marca)" : "var(--border)",
                      background: activo ? "var(--marca-suave)" : "var(--surface-1)",
                      color: activo ? "var(--marca)" : "var(--text-secondary)",
                    }}
                  >
                    {s.etiqueta}
                  </button>
                );
              })}
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-1">
              {sleeve === "trading" ? (
                <GananciaSleeve sleeve="trading" snapshots={snapshots} transacciones={transacciones} fondos={fondos} traspasos={traspasos} desde={desde} hasta={hasta} serieValor={serieTrading} serieEfectivo={serieEfectivoTrading} serieCosto={serieCostoTrading} fechaCorteSleeves={fechaCorteSleeves} />
              ) : sleeve === "largo" ? (
                <GananciaSleeve sleeve="largo" snapshots={snapshots} transacciones={transacciones} fondos={fondos} traspasos={traspasos} desde={desde} hasta={hasta} serieValor={serieLargo} serieEfectivo={serieEfectivoLargo} serieCosto={serieCostoLargo} fechaCorteSleeves={fechaCorteSleeves} />
              ) : (
                <GananciaSleeve sleeve="rentaFija" snapshots={snapshots} transacciones={transacciones} fondos={fondos} traspasos={traspasos} desde={desde} hasta={hasta} serieValor={serieRentaFija} serieEfectivo={serieEfectivoRentaFija} serieCosto={serieCostoRentaFija} fechaCorteSleeves={fechaCorteSleeves} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
