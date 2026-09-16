"use client";

import { useState } from "react";
import TablaTenencias from "./TablaTenencias";
import ResultadosDelDia from "./ResultadosDelDia";

export default function SelectorVista({ tenencias, resultadosDia }) {
  const [vista, setVista] = useState("tenencias");

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setVista("tenencias")}
          className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          style={vista === "tenencias" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
        >
          Tenencias
        </button>
        <button
          type="button"
          onClick={() => setVista("resultados")}
          className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          style={vista === "resultados" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
        >
          Resultados del día
        </button>
      </div>
      {vista === "tenencias" ? (
        <TablaTenencias tenencias={tenencias} />
      ) : (
        <ResultadosDelDia resultados={resultadosDia} />
      )}
    </div>
  );
}