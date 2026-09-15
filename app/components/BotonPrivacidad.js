"use client";

import { usePrivacidad } from "./PrivacidadContext";

function IconoOjo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoOjoTachado() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.7 20.7 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export default function BotonPrivacidad() {
  const { oculto, alternar } = usePrivacidad();
  return (
    <button
      type="button"
      onClick={alternar}
      title={oculto ? "Mostrar montos y cantidades" : "Ocultar montos y cantidades (para compartir capturas)"}
      className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
      style={{ color: oculto ? "var(--marca)" : "var(--text-muted)" }}
    >
      {oculto ? <IconoOjoTachado /> : <IconoOjo />}
      <span className="hidden sm:inline">{oculto ? "Oculto" : "Visible"}</span>
    </button>
  );
}
