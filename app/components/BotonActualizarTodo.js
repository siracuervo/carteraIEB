"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export const EVENTO_ACTUALIZAR = "cartera:actualizar-precios";

/**
 * Botón único de actualización: refresca los datos del servidor (router.refresh)
 * y avisa a las pestañas para que re-pidan precios en vivo al momento.
 * Gira mientras el servidor responde.
 */
export default function BotonActualizarTodo({ texto = "Actualizar" }) {
  const router = useRouter();
  const [actualizando, startActualizar] = useTransition();

  function actualizar() {
    startActualizar(() => router.refresh());
    window.dispatchEvent(new Event(EVENTO_ACTUALIZAR));
  }

  return (
    <button
      type="button"
      onClick={actualizar}
      disabled={actualizando}
      title="Actualizar todos los valores dinámicos ahora"
      className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-70 sm:px-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--marca)"; e.currentTarget.style.borderColor = "var(--marca)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={actualizando ? "animate-spin" : undefined}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
      <span className="hidden sm:inline">{actualizando ? "Actualizando…" : texto}</span>
    </button>
  );
}
