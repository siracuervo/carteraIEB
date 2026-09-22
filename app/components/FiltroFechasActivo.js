"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ACCESOS_RAPIDOS_FECHA } from "@/lib/accesosRapidosFecha";
import IndicadorCarga from "./IndicadorCarga";

export default function FiltroFechasActivo({ desde, hasta, fechaInicio }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filtrando, startFiltro] = useTransition();

  function actualizar(nuevoDesde, nuevoHasta) {
    const params = new URLSearchParams();
    if (nuevoDesde) params.set("desde", nuevoDesde);
    if (nuevoHasta) params.set("hasta", nuevoHasta);
    const query = params.toString();
    startFiltro(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  const hayFiltro = Boolean(desde || hasta);

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Desde
          <input
            type="date"
            value={desde || ""}
            min={fechaInicio || undefined}
            onChange={(e) => actualizar(e.target.value, hasta || "")}
            className="rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Hasta
          <input
            type="date"
            value={hasta || ""}
            min={fechaInicio || undefined}
            onChange={(e) => actualizar(desde || "", e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </label>
        {filtrando && <IndicadorCarga texto="Filtrando…" />}
        {hayFiltro && (
          <button
            type="button"
            onClick={() => actualizar("", "")}
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Limpiar filtro
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {ACCESOS_RAPIDOS_FECHA.map(({ etiqueta, calcular }) => {
          const rango = calcular(fechaInicio);
          const activo = desde === rango.desde && hasta === rango.hasta;
          return (
            <button
              key={etiqueta}
              type="button"
              onClick={() => actualizar(rango.desde, rango.hasta)}
              className="rounded-full border px-2.5 py-1 text-xs"
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
    </div>
  );
}
