"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { parsearOperacionesDelDiaCliente } from "@/lib/parseOperacionesDelDiaCliente";

const estadoInicial = { error: null, exito: null };
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function mensajeExito(tipo, exito) {
  if (tipo === "respaldo") {
    return `Listo — respaldo restaurado (${exito.escritos.length} archivos: ${exito.escritos.join(", ")}).`;
  }
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

export default function FormularioImportar({
  accion,
  tipo,
  id,
  tituloDropzone,
  ayudaDropzone,
  textoBoton = "Importar",
  accept = ".xlsx",
  multiple = true,
  parseoCliente = false,
}) {
  const [estado, formAction, pendiente] = useActionState(accion, estadoInicial);
  const [archivos, setArchivos] = useState([]);
  const [transaccionesParseadas, setTransaccionesParseadas] = useState([]);
  const formRef = useRef(null);

  // Después de importar con éxito, colapsa de nuevo la sección "Portafolio actual"
  // (si el usuario la había abierto a mano para subir el archivo) en vez de dejarla
  // abierta esperando un cierre manual.
  useEffect(() => {
    if (estado?.exito) {
      formRef.current?.closest("details")?.removeAttribute("open");
    }
  }, [estado?.exito]);

  const manejarSeleccion = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setArchivos(files.map((f) => f.name));

    if (parseoCliente && tipo === "operaciones-del-dia") {
      const todas = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const txs = parsearOperacionesDelDiaCliente(buffer);
        todas.push(...txs);
      }
      setTransaccionesParseadas(todas);
    } else {
      setTransaccionesParseadas([]);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    if (transaccionesParseadas.length) {
      formData.set("transaccionesJson", JSON.stringify(transaccionesParseadas));
      formData.set("archivosNombres", JSON.stringify(archivos));
    }
    formAction(formData);
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
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
        {transaccionesParseadas.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {transaccionesParseadas.length} operación(es) detectada(s) en el/los archivo(s).
          </p>
        )}
        <input
          id={id}
          type="file"
          name="archivos"
          accept={accept}
          multiple={multiple}
          required
          className="sr-only"
          onChange={manejarSeleccion}
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
