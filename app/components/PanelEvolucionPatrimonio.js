"use client";

import { useState } from "react";
import GraficoEvolucionPatrimonio from "./GraficoEvolucionPatrimonio";
import MedidorGanancia, { GananciaVariable } from "./MedidorGanancia";
import { ACCESOS_RAPIDOS_FECHA } from "@/lib/accesosRapidosFecha";

const OPCIONES = [
  { id: "grafico", etiqueta: "Gráfico" },
  { id: "medidor", etiqueta: "Ganancia por periodos" },
  { id: "variable", etiqueta: "Ganancia renta variable" },
];

const estiloInput = {
  borderColor: "var(--border)",
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

/**
 * Selector entre la evolución clásica (línea), el medidor de ganancia total
 * entre periodos personalizables y el de renta variable (con efectivo). Las
 * dos últimas pestañas comparten las fechas elegidas.
 */
export default function PanelEvolucionPatrimonio({ serie, snapshots, transacciones, fondos }) {
  const [vista, setVista] = useState("grafico");
  const puntos = (snapshots || []).filter((p) => p.fecha && p.valorTotalARS != null);
  const fechaInicio = puntos[0]?.fecha || "";
  const fechaFin = puntos[puntos.length - 1]?.fecha || "";
  const [desde, setDesde] = useState(fechaInicio);
  const [hasta, setHasta] = useState(fechaFin);

  function fijar(nuevoDesde, nuevoHasta) {
    const c = (iso) => (iso < fechaInicio ? fechaInicio : iso > fechaFin ? fechaFin : iso);
    setDesde(c(nuevoDesde));
    setHasta(c(nuevoHasta));
  }

  const enPeriodo = vista === "medidor" || vista === "variable";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex shrink-0 gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {OPCIONES.map((opcion) => {
          const activa = vista === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setVista(opcion.id)}
              className="border-b-2 py-0.5 text-sm font-medium"
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vista === "grafico" ? (
          <GraficoEvolucionPatrimonio serie={serie} />
        ) : vista === "medidor" ? (
          <MedidorGanancia snapshots={snapshots} desde={desde} hasta={hasta} />
        ) : (
          <GananciaVariable snapshots={snapshots} transacciones={transacciones} fondos={fondos} desde={desde} hasta={hasta} />
        )}
      </div>
    </div>
  );
}
