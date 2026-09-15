"use client";

import { useRef } from "react";
import { actualizarClasificacion } from "@/app/actions";

/** Solo se muestra mientras IEB no calculó el PPP (pasa ~1 día tras comprar o
 * transferir una posición) — deja completarlo a mano para no quedarse sin costo
 * mientras tanto. En cuanto IEB lo tenga, este valor deja de usarse solo. */
export default function EditarPPP({ clave, divisa, valorActual }) {
  const detallesRef = useRef(null);

  function cerrar() {
    if (detallesRef.current) detallesRef.current.open = false;
  }

  return (
    <details ref={detallesRef} className="relative inline-block">
      <summary
        className="cursor-pointer list-none text-xs underline"
        style={{ color: "var(--marca)" }}
        title="IEB todavía no calculó el PPP de esta posición — completalo a mano"
      >
        cargar PPP
      </summary>
      <form
        action={actualizarClasificacion}
        onSubmit={cerrar}
        className="absolute left-0 z-20 mt-1 w-56 space-y-2 rounded-md border p-3 shadow-md"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={cerrar}
          className="absolute right-1.5 top-1.5 text-sm leading-none"
          style={{ color: "var(--text-muted)" }}
          aria-label="Cerrar"
        >
          ×
        </button>
        <input type="hidden" name="clave" value={clave} />
        <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>
          PPP / costo promedio ({divisa})
          <input
            type="number"
            step="0.01"
            name="pppManual"
            defaultValue={valorActual ?? ""}
            className="mt-1 w-full rounded border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded px-2 py-1 text-xs font-medium text-white"
          style={{ background: "var(--marca)" }}
        >
          Guardar
        </button>
      </form>
    </details>
  );
}
