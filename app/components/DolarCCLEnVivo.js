"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTO_ACTUALIZAR } from "./BotonActualizarTodo";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatoHora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const REFRESCO_MS = 60_000;

export default function DolarCCLEnVivo({ referencia }) {
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

    function alActualizarGlobal() {
      refrescarRef.current?.();
    }
    window.addEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);

    refrescar();
    const id = setInterval(refrescar, REFRESCO_MS);
    return () => {
      activo = false;
      clearInterval(id);
      window.removeEventListener(EVENTO_ACTUALIZAR, alActualizarGlobal);
    };
  }, []);

  const valor = ccl ?? referencia ?? null;
  const enVivo = ccl != null;

  return (
    <div className="text-right">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Dólar CCL</div>
      <div
        className="mt-0.5 flex items-center justify-end gap-1.5 text-lg font-semibold tabular-nums"
        style={{ color: enVivo ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {valor == null ? (
          "—"
        ) : (
          <>
            {enVivo && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--good)" }} />}
            {formatoARS.format(valor)}
          </>
        )}
      </div>
      {ts && (
        <div className="mt-0.5 flex items-center justify-end gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          en tiempo real · {formatoHora.format(ts)}
        </div>
      )}
    </div>
  );
}