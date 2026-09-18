"use client";

import { useState } from "react";
import GraficoEvolucionPatrimonio from "./GraficoEvolucionPatrimonio";
import MedidorGanancia from "./MedidorGanancia";

const OPCIONES = [
  { id: "grafico", etiqueta: "Gráfico" },
  { id: "medidor", etiqueta: "Ganancia por periodos" },
];

/**
 * Selector entre la evolución clásica (línea de 30 días hábiles) y el medidor de
 * ganancia entre periodos personalizables (todo el historial importado).
 */
export default function PanelEvolucionPatrimonio({ serie, snapshots }) {
  const [vista, setVista] = useState("grafico");

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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vista === "grafico" ? (
          <GraficoEvolucionPatrimonio serie={serie} />
        ) : (
          <MedidorGanancia snapshots={snapshots} />
        )}
      </div>
    </div>
  );
}