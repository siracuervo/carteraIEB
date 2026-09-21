"use client";

import { useState } from "react";

/** Selector entre las dos cargas manuales, con el mismo estilo de pestañas del home. */
export default function SelectorCargaMovimientos({ operacion, fondos, cantidadFondos }) {
  const [vista, setVista] = useState("operacion");

  return (
    <div>
      <div className="mb-3 flex gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {[
          { id: "operacion", etiqueta: "Operación a mano" },
          { id: "fondos", etiqueta: `Ingresos y retiros${cantidadFondos ? ` (${cantidadFondos})` : ""}` },
        ].map((opcion) => {
          const activa = vista === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              onClick={() => setVista(opcion.id)}
              className="cursor-pointer border-b-2 py-0.5 text-sm font-medium"
              style={{
                color: activa ? "var(--marca)" : "var(--text-muted)",
                borderColor: activa ? "var(--marca)" : "transparent",
              }}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
      {vista === "operacion" ? operacion : fondos}
    </div>
  );
}
