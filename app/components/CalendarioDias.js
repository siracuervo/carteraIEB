"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fechaLocal } from "@/lib/fechas";

const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function isoDia(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Botón con calendario mensual para elegir un día entre `dias` (ISO YYYY-MM-DD).
 * Solo los días de la lista son clicables; el resto se muestra apagado.
 * Llama `onElegir(iso)` al elegir. Todo renderizado con los colores de la app
 * (el <select> nativo lo dibuja el SO y no respeta el tema).
 */
export default function CalendarioDias({ dias, dia, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const diasSet = useMemo(() => new Set(dias || []), [dias]);
  const [mesVisible, setMesVisible] = useState(() => {
    const base = fechaLocal(dia) || new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const [mesParaDia, setMesParaDia] = useState(dia);
  if (mesParaDia !== dia) {
    setMesParaDia(dia);
    const base = fechaLocal(dia);
    if (base) setMesVisible({ y: base.getFullYear(), m: base.getMonth() });
  }

  useEffect(() => {
    if (!abierto) return;
    function cerrarAlClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarAlClickFuera);
    return () => document.removeEventListener("mousedown", cerrarAlClickFuera);
  }, [abierto]);

  const celdas = useMemo(() => {
    const { y, m } = mesVisible;
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    const diasEnMes = new Date(y, m + 1, 0).getDate();
    const lista = [];
    for (let i = 0; i < offset; i++) lista.push(null);
    for (let d = 1; d <= diasEnMes; d++) lista.push(d);
    return lista;
  }, [mesVisible]);

  const etiquetaMes = (() => {
    const s = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
      new Date(mesVisible.y, mesVisible.m, 1)
    );
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  function moverMes(delta) {
    setMesVisible((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function elegir(iso) {
    setAbierto(false);
    onElegir(iso);
  }

  if (!dias || dias.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
        title="Elegir día"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {dia ? formatoFechaCorta.format(fechaLocal(dia)) : "Elegir día"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform 0.1s", opacity: 0.7 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {abierto && (
        <div
          className="fixed left-1/2 top-1/2 z-20 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-3 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-1 sm:translate-x-0 sm:translate-y-0"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moverMes(-1)}
              className="cursor-pointer rounded px-2 py-0.5 text-sm"
              style={{ color: "var(--text-secondary)" }}
              title="Mes anterior"
            >
              ‹
            </button>
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {etiquetaMes}
            </span>
            <button
              type="button"
              onClick={() => moverMes(1)}
              className="cursor-pointer rounded px-2 py-0.5 text-sm"
              style={{ color: "var(--text-secondary)" }}
              title="Mes siguiente"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["L", "M", "M", "J", "V", "S", "D"].map((l, i) => (
              <span key={i} className="py-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                {l}
              </span>
            ))}
            {celdas.map((dNum, i) => {
              if (dNum == null) return <span key={`x-${i}`} />;
              const iso = isoDia(mesVisible.y, mesVisible.m, dNum);
              const tieneOps = diasSet.has(iso);
              const seleccionado = iso === dia;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!tieneOps}
                  onClick={() => elegir(iso)}
                  title={tieneOps ? formatoFechaCorta.format(fechaLocal(iso)) : undefined}
                  className={`rounded-full py-1 text-xs tabular-nums ${tieneOps ? "cursor-pointer font-semibold" : "cursor-default"}`}
                  style={
                    seleccionado
                      ? { background: "var(--marca)", color: "#fff" }
                      : tieneOps
                        ? { color: "var(--text-primary)", background: "var(--surface-2)" }
                        : { color: "var(--text-muted)", opacity: 0.35 }
                  }
                >
                  {dNum}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Solo los días resaltados tienen datos.
          </p>
        </div>
      )}
    </div>
  );
}
