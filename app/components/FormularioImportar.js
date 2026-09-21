"use client";

import { useActionState, useEffect, useRef, useState } from "react";

const estadoInicial = { error: null, exito: null };
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function mensajeExito(tipo, exito) {
  if (tipo === "portafolio") {
    return `Listo — ${exito.importados} archivo(s) importado(s). Último patrimonio: ${formatoARS.format(exito.ultimoPatrimonio)}.`;
  }
  if (tipo === "operaciones-del-dia") {
    return `Listo — ${exito.agregadas} operación(es) agregada(s) como compras/ventas${
      exito.actualizadas ? `, ${exito.actualizadas} ya existían y se completaron` : ""
    }.`;
  }
  return `Listo — ${exito.agregadas} operaciones nuevas, ${exito.actualizadas} completadas con datos del otro archivo.`;
}

export default function FormularioImportar({ accion, tipo, id, tituloDropzone, ayudaDropzone, textoBoton = "Importar" }) {
  const [estado, formAction, pendiente] = useActionState(accion, estadoInicial);
  const [archivos, setArchivos] = useState([]);
  const formRef = useRef(null);

  // Después de importar con éxito, colapsa de nuevo la sección "Portafolio actual"
  // (si el usuario la había abierto a mano para subir el archivo) en vez de dejarla
  // abierta esperando un cierre manual.
  useEffect(() => {
    if (estado?.exito) {
      formRef.current?.closest("details")?.removeAttribute("open");
    }
  }, [estado?.exito]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <label
        htmlFor={id}
        className="block cursor-pointer rounded-lg border border-dashed p-6 text-center transition-colors"
        style={{ borderColor: "var(--baseline)", background: "var(--surface-1)" }}
      >
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {tituloDropzone}
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {ayudaDropzone}
        </div>
        {archivos.length > 0 && (
          <ul className="mt-3 break-words text-xs" style={{ color: "var(--text-secondary)" }}>
            {archivos.map((nombre) => (
              <li key={nombre}>{nombre}</li>
            ))}
          </ul>
        )}
        <input
          id={id}
          type="file"
          name="archivos"
          accept=".xlsx"
          multiple
          required
          className="sr-only"
          onChange={(e) => setArchivos(Array.from(e.target.files).map((f) => f.name))}
        />
      </label>

      {estado?.error && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          {mensajeExito(tipo, estado.exito)}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--marca)" }}
      >
        {pendiente ? "Importando…" : textoBoton}
      </button>
    </form>
  );
}
