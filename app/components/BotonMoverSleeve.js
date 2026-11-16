"use client";

import { useState, useTransition } from "react";
import { cambiarSleevePosicion } from "@/app/actions";

/**
 * Mueve una posición entera entre estrategias (trading ↔ largo plazo). Guarda un
 * override por clave: el ledger de sleeves reclasifica todos los lotes — incluida
 * la apertura que sale del último Portafolio — sin tocar las operaciones.
 */
export default function BotonMoverSleeve({ clave, sleeve }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState(null);

  if (!clave || clave === "CAUCION_ABIERTA") return null;
  const destino = sleeve === "largo" ? "trading" : "largo";
  const etiqueta = sleeve === "largo" ? "Pasar a trading" : "Pasar a largo plazo";

  const mover = () => {
    setError(null);
    startTransition(async () => {
      const r = await cambiarSleevePosicion(clave, destino);
      if (!r?.ok) setError(r?.error || "No se pudo mover la posición.");
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={mover}
        disabled={pendiente}
        className="cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "transparent" }}
        title={`Mueve toda la posición de ${sleeve === "largo" ? "largo plazo a trading" : "trading a largo plazo"}: sus lotes, su historia y su caja pasan a la otra estrategia (las operaciones no se tocan).`}
      >
        {pendiente ? "Moviendo…" : etiqueta}
      </button>
      {error && (
        <span className="text-[10px]" style={{ color: "var(--bad)" }} title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
