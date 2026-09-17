"use client";

import { useState } from "react";
import TablaTenencias from "./TablaTenencias";
import ResultadosDelDia from "./ResultadosDelDia";

export default function SelectorVista({ tenencias, resultadosDia, diasOperados, dia, tenenciasCierre, diasTenencia, diaTenencia }) {
  const [vista, setVista] = useState("tenencias");
  const esHistorico = diaTenencia != null && tenenciasCierre != null;

  return (
    <div className="space-y-3">
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
      </div>
      {vista === "tenencias" ? (
        <TablaTenencias
          tenencias={esHistorico ? tenenciasCierre : tenencias}
          diasTenencia={diasTenencia}
          diaTenencia={diaTenencia}
          esHistorico={esHistorico}
        />
      ) : (
        <ResultadosDelDia resultados={resultadosDia} diasOperados={diasOperados} dia={dia} />
      )}
    </div>
  );
}