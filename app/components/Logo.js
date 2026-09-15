"use client";

import { useState } from "react";
import { esTickerBonoSoberano, TICKERS_SIN_LOGO } from "@/lib/clasificacion";

const COLORES_INICIAL = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function colorParaTexto(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return COLORES_INICIAL[hash % COLORES_INICIAL.length];
}

export default function Logo({ ticker, nombre, size = 28 }) {
  const [conError, setConError] = useState(false);

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

  if (conError || !ticker || TICKERS_SIN_LOGO.has(ticker.toUpperCase())) {
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

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border object-contain p-0.5"
      style={{ borderColor: "var(--border)", background: "#fff" }}
      onError={() => setConError(true)}
    />
  );
}
