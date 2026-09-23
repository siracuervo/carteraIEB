"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarImportacion } from "@/app/actions";
import { fechaLocal } from "@/lib/fechas";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function FilaImportacion({ imp, onEliminada }) {
  const [pendiente, start] = useTransition();
  const router = useRouter();
  const dias = (imp.dias || []).map((d) => {
    try {
      return formatoFecha.format(fechaLocal(d));
    } catch {
      return d;
    }
  }).join(", ");
  const detalle = [
    `${imp.agregadas ?? 0} nuevas`,
    imp.actualizadas ? `${imp.actualizadas} actualizadas` : null,
    dias || null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {(imp.archivos || []).join(", ") || "Importación"}
        </div>
        <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{detalle}</div>
      </div>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm(`¿Eliminar las ${imp.agregadas ?? 0} operaciones que agregó esta importación? Las que ya existían no se tocan.`)) return;
          start(async () => {
            await eliminarImportacion(imp.id);
            onEliminada?.(imp.id);
            router.refresh();
          });
        }}
        className="shrink-0 cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
        style={{ borderColor: "var(--bad)", color: "var(--bad)", background: "transparent" }}
      >
        {pendiente ? "Eliminando…" : "Deshacer"}
      </button>
    </div>
  );
}

/** Últimas importaciones del día con opción de deshacer (solo lo agregado como nuevo). */
export default function ListaImportaciones({ importaciones }) {
  const [ocultas, setOcultas] = useState([]);
  const lista = [...(importaciones || [])].reverse().filter((imp) => !ocultas.includes(imp.id)).slice(0, 5);
  if (!lista.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Últimas importaciones</div>
      {lista.map((imp) => (
        <FilaImportacion key={imp.id} imp={imp} onEliminada={(id) => setOcultas((o) => (o.includes(id) ? o : [...o, id]))} />
      ))}
    </div>
  );
}
