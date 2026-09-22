"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTO_ACTUALIZAR } from "./BotonActualizarTodo";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoHora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function DolarCCLEnVivo({ referencia, parte = "todo" }) {
  const [ccl, setCcl] = useState(null);
  const [ts, setTs] = useState(null);
  const refrescarRef = useRef(null);

  useEffect(() => {
    let activo = true;

    async function refrescar() {
      try {
        const res = await fetch("/api/precios");
        const json = await res.json();
        if (!activo) return;
        if (json?.ccl != null) setCcl(json.ccl);
        if (json?.ts) setTs(json.ts);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }
    refrescarRef.current = refrescar;

    // Sin refresco automático: solo al cargar y cuando se toca "Actualizar"
    function alActualizarGlobal() {
      refrescarRef.current?.();
    }
    window.addEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);

    refrescar();
    return () => {
      activo = false;
      window.removeEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);
    };
  }, []);

  const valor = ccl ?? referencia ?? null;
  const enVivo = ccl != null;

  const bloqueActualizacion = ts ? (
    <span
      className="mx-auto flex min-w-0 flex-col items-center gap-0 rounded-lg border px-2 py-0.5 text-center sm:mx-0 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-1 sm:text-left"
      style={{ borderColor: "var(--marca)", background: "var(--marca-suave)" }}
      title="Momento de la última actualización de precios"
    >
      <span className="text-[10px] font-extrabold tracking-wide whitespace-nowrap sm:text-sm" style={{ color: "var(--marca)" }}>
        ÚLTIMA ACTUALIZACIÓN
      </span>
      <span className="text-xs font-bold tabular-nums whitespace-nowrap sm:text-base" style={{ color: "var(--marca)" }}>
        {formatoFecha.format(ts)} · {formatoHora.format(ts)}
      </span>
    </span>
  ) : null;

  const bloqueCCL = (
    <>
      <span className="hidden text-xs sm:inline" style={{ color: "var(--text-muted)" }}>Dólar CCL</span>
      <span
        className="absolute right-0 flex items-center gap-1.5 text-sm font-semibold tabular-nums sm:static sm:ml-0"
        style={{ color: enVivo ? "var(--text-primary)" : "var(--text-muted)" }}
        title="Dólar CCL en tiempo real"
      >
        {valor == null ? (
          "—"
        ) : (
          <>
            {enVivo && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--good)" }} />}
            {formatoARS.format(valor)}
          </>
        )}
      </span>
    </>
  );

  if (parte === "ccl") {
    return <div className="flex items-center gap-1.5 whitespace-nowrap">{bloqueCCL}</div>;
  }
  if (parte === "actualizacion") {
    return <div className="flex items-center gap-1.5 whitespace-nowrap">{bloqueActualizacion}</div>;
  }
  return (
    <div className="relative flex w-full items-center gap-1.5 whitespace-nowrap">
      {bloqueActualizacion}
      {bloqueCCL}
    </div>
  );
}