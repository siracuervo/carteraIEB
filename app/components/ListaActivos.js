"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const OPCIONES_ORDEN = [
  { id: "operaciones", etiqueta: "Más operado" },
  { id: "alfabetico", etiqueta: "A–Z" },
];

/** Activos operados en forma de lista, con búsqueda y orden por cantidad de operaciones o alfabético. */
export default function ListaActivos({ activos }) {
  const [orden, setOrden] = useState("operaciones");
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q
      ? activos.filter((a) => `${a.ticker || ""} ${a.activo || ""}`.toLowerCase().includes(q))
      : [...activos];
    if (orden === "alfabetico") {
      lista.sort((a, b) => (a.ticker || a.activo).localeCompare(b.ticker || b.activo));
    } else {
      lista.sort(
        (a, b) =>
          b.compras + b.ventas - (a.compras + a.ventas) || (a.ticker || a.activo).localeCompare(b.ticker || b.activo)
      );
    }
    return lista;
  }, [activos, orden, busqueda]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ticker o nombre"
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        {OPCIONES_ORDEN.map((o) => {
          const activo = orden === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOrden(o.id)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: activo ? "var(--marca)" : "var(--border)",
                background: activo ? "var(--marca-suave)" : "var(--surface-1)",
                color: activo ? "var(--marca)" : "var(--text-secondary)",
              }}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
        {filtrados.map((a, i) => (
          <Link
            key={a.clave}
            href={`/activo/${encodeURIComponent(a.clave)}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
            style={{
              display: "flex",
              background: "var(--surface-1)",
              borderBottom: i < filtrados.length - 1 ? "1px solid var(--gridline)" : "none",
            }}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {a.ticker || a.activo}
              </div>
              {a.ticker && (
                <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{a.activo}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              <span style={{ color: "var(--good)" }}>{a.compras} compras</span>
              <span style={{ color: "var(--bad)" }}>{a.ventas} ventas</span>
              <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{a.compras + a.ventas} op.</span>
              <span style={{ color: "var(--marca)" }}>→</span>
            </div>
          </Link>
        ))}
        {!filtrados.length && (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay activos que coincidan con la búsqueda.
          </p>
        )}
      </div>
    </div>
  );
}