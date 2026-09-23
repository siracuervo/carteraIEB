"use client";

import { useTema } from "./TemaContext";

function IconoSol() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconoLuna() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function IconoAuto() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const TITULOS = {
  sistema: "Tema: sistema (tocar para forzar oscuro)",
  oscuro: "Tema: oscuro (tocar para forzar claro)",
  claro: "Tema: claro (tocar para volver a sistema)",
};

/** Selector de tema: Sistema → Oscuro → Claro. No depende del navegador. */
export default function BotonTema() {
  const { tema, ciclar } = useTema();
  return (
    <button
      type="button"
      onClick={ciclar}
      title={TITULOS[tema] ?? TITULOS.sistema}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      {tema === "oscuro" ? <IconoLuna /> : tema === "claro" ? <IconoSol /> : <IconoAuto />}
      <span className="hidden sm:inline">{tema === "sistema" ? "Auto" : tema === "oscuro" ? "Oscuro" : "Claro"}</span>
    </button>
  );
}
