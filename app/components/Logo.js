"use client";

import { useState } from "react";
import { esTickerBonoSoberano, LOGO_POR_TICKER, LOGOS_PARQET_OK } from "@/lib/clasificacion";

const COLORES_INICIAL = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function colorParaTexto(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return COLORES_INICIAL[hash % COLORES_INICIAL.length];
}

export default function Logo({ ticker, nombre, size = 28, banderaArgentina = false }) {
  // Etapa de fallback por ticker (persiste si la lista reordena): 0 = logo
  // explícito, 1 = parqet (solo LOGOS_PARQET_OK), 2 = inicial. Sin logo
  // explícito se arranca en 1 para no pedir parqet de gusto.
  const [fallos, setFallos] = useState({});

  if (banderaArgentina) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border"
        style={{
          width: size,
          height: size,
          borderColor: "var(--border)",
          borderRadius: "50%",
          background:
            "linear-gradient(to bottom, #74ACDF 0%, #74ACDF 33%, #ffffff 33%, #ffffff 66%, #74ACDF 66%, #74ACDF 100%)",
        }}
        title="Bono en pesos"
      >
        <span
          style={{
            width: size * 0.38,
            height: size * 0.38,
            borderRadius: "50%",
            background: "#F6B40E",
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)",
          }}
        />
      </span>
    );
  }

  if (esTickerBonoSoberano(ticker)) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border"
        style={{ width: size, height: size, borderColor: "var(--border)", background: "#fff", fontSize: size * 0.6, lineHeight: 1 }}
      >
        🇦🇷
      </span>
    );
  }

  if (!ticker) {
    const texto = nombre || "?";
    const inicial = texto.trim().charAt(0).toUpperCase();
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ width: size, height: size, background: colorParaTexto(texto) }}
      >
        {inicial}
      </span>
    );
  }

  const tick = ticker.toUpperCase();
  const logoExplicito = LOGO_POR_TICKER[tick] ?? null;
  const parqetHabilitado = LOGOS_PARQET_OK.has(tick);
  const etapa = fallos[tick] ?? (logoExplicito ? 0 : 1);

  if (etapa > 1 || (etapa > 0 && !parqetHabilitado)) {
    const texto = nombre || ticker || "?";
    const inicial = texto.trim().charAt(0).toUpperCase();
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ width: size, height: size, background: colorParaTexto(texto) }}
      >
        {inicial}
      </span>
    );
  }

  // Sin logo explícito se arranca directo en parqet (etapa 1).
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={etapa === 0 && logoExplicito ? logoExplicito : `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border object-contain p-0.5"
      style={{ borderColor: "var(--border)", background: "#fff" }}
      onError={() => setFallos((f) => ({ ...f, [tick]: etapa + 1 }))}
    />
  );
}
