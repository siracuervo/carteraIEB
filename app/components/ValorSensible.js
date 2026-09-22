"use client";

import { usePrivacidad } from "./PrivacidadContext";

/**
 * Envolvé cualquier monto/cantidad sensible con esto. En modo privado se reemplaza
 * por puntos, manteniendo el ancho del valor real (contenido oculto + overlay) para
 * que al alternar no haya saltos de layout.
 * Con ambito="total" además responde al ojito del total (valor de portafolio y estrategias).
 */
export default function ValorSensible({ children, ambito = "todo" }) {
  const { oculto, ocultoTotal } = usePrivacidad();
  const escondido = ambito === "total" ? oculto || ocultoTotal : oculto;
  if (!escondido) return children;
  return (
    <span style={{ position: "relative" }}>
      <span aria-hidden="true" style={{ visibility: "hidden" }}>
        {children}
      </span>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        ••••••
      </span>
    </span>
  );
}
