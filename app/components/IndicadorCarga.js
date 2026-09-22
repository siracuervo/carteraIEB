"use client";

/** Spinner violeta para navegaciones con espera (cambio de día, filtros de fecha). */
export default function IndicadorCarga({ texto = "Cargando…" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
      <span
        aria-hidden="true"
        className="inline-block h-5 w-5 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--border)", borderTopColor: "var(--marca)" }}
      />
      {texto}
    </span>
  );
}
