"use client";

import { usePrivacidad } from "./PrivacidadContext";

/**
 * Envolvé cualquier monto/cantidad sensible con esto. En modo privado se reemplaza
 * por un placeholder de ancho fijo (no la cantidad de puntos según los dígitos reales,
 * para no filtrar el orden de magnitud del número que se está ocultando).
 */
export default function ValorSensible({ children }) {
  const { oculto } = usePrivacidad();
  if (!oculto) return children;
  return (
    <span aria-hidden="true" style={{ letterSpacing: "0.05em" }}>
      ••••••
    </span>
  );
}
