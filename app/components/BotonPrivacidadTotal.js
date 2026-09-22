"use client";

import { usePrivacidad } from "./PrivacidadContext";

function IconoOjo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoOjoTachado() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.7 20.7 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

/** Ojito que oculta solo el valor del portafolio y los valores por estrategia. */
export default function BotonPrivacidadTotal() {
  const { oculto, ocultoTotal, alternarTotal } = usePrivacidad();
  const activo = oculto || ocultoTotal;
  return (
    <button
      type="button"
      onClick={alternarTotal}
      title={activo ? "Mostrar valor de portafolio" : "Ocultar solo el valor de portafolio y estrategias"}
      className="cursor-pointer rounded-md p-1"
      style={{ color: activo ? "var(--marca)" : "var(--text-muted)" }}
    >
      {activo ? <IconoOjoTachado /> : <IconoOjo />}
    </button>
  );
}
