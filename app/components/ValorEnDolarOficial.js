"use client";

import { useEffect, useState } from "react";
import ValorSensible from "./ValorSensible";

const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const REFRESCO_MS = 60_000;

export default function ValorEnDolarOficial({ valorARS }) {
  const [oficial, setOficial] = useState(null);

  useEffect(() => {
    let activo = true;

    async function refrescar() {
      try {
        const res = await fetch("/api/precios");
        const json = await res.json();
        if (!activo) return;
        if (json?.oficial != null) setOficial(json.oficial);
      } catch {
        // se mantiene el último valor conocido; se reintenta en el próximo ciclo
      }
    }

    refrescar();
    const id = setInterval(refrescar, REFRESCO_MS);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, []);

  if (oficial == null) return null;

  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums">
      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        ≈ <ValorSensible>{formatoUSD.format(valorARS / oficial)}</ValorSensible>
      </span>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>a dólar oficial Balanz {formatoUSD.format(oficial)}</span>
    </div>
  );
}