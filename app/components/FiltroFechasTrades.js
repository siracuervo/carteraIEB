"use client";

import { useRouter, useSearchParams } from "next/navigation";
import InputFechaCalendario from "./InputFechaCalendario";

export default function FiltroFechasTrades({ desde, hasta, minFecha, maxFecha, embedded = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function actualizar(campo, valor) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (valor && valor > hoy) return;
    if (minFecha && valor && valor < minFecha) return;
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(campo, valor);
    else params.delete(campo);
    const qs = params.toString();
    router.push(`/trades${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function limpiar() {
    router.push("/trades", { scroll: false });
  }

  const hayFiltro = Boolean(desde || hasta);
  const desdeDisplay = desde || minFecha || "";
  const hastaDisplay = hasta || maxFecha || "";

  return (
    <div
      className={embedded ? "flex flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-2 rounded-lg border p-3"}
      style={embedded ? undefined : { borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Desde
        </label>
        <InputFechaCalendario value={desdeDisplay} min={minFecha} max={maxFecha} onChange={(v) => actualizar("desde", v)} />
      </div>
      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Hasta
        </label>
        <InputFechaCalendario value={hastaDisplay} min={minFecha} max={maxFecha} onChange={(v) => actualizar("hasta", v)} />
      </div>
      {hayFiltro && (
        <button
          type="button"
          onClick={limpiar}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface-2)" }}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
