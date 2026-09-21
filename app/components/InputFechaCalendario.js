"use client";

import { useState, useMemo } from "react";
import { fechaLocal } from "@/lib/fechas";
import { aISO } from "@/lib/accesosRapidosFecha";

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function parseISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function InputFechaCalendario({ name = "fecha", required, value: valueProp, defaultValue, onChange }) {
  const [interno, setInterno] = useState(() => valueProp ?? defaultValue ?? "");
  const valor = valueProp !== undefined ? valueProp : interno;
  const [abierto, setAbierto] = useState(false);
  const [mesVista, setMesVista] = useState(() => {
    const base = parseISO(valor) || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const setValor = (iso) => {
    if (valueProp === undefined) setInterno(iso);
    onChange?.(iso);
  };

  const seleccionado = parseISO(valor);
  const tituloMes = `${MESES[mesVista.getMonth()]} ${mesVista.getFullYear()}`;

  const dias = useMemo(() => {
    const y = mesVista.getFullYear();
    const m = mesVista.getMonth();
    const primerDia = new Date(y, m, 1);
    const offset = (primerDia.getDay() + 6) % 7; // lunes = 0
    const diasEnMes = new Date(y, m + 1, 0).getDate();
    const celdas = [];
    for (let i = 0; i < offset; i++) celdas.push(null);
    for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(y, m, d));
    return celdas;
  }, [mesVista]);

  const hoyISO = aISO(new Date());

  return (
    <div className="relative">
      <input type="hidden" name={name} value={valor || ""} required={required} />
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: valor ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        <span>{valor ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(fechaLocal(valor)) : "Elegí fecha"}</span>
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>📅</span>
      </button>
      {abierto && (
        <div
          className="absolute z-10 mt-1 rounded-lg border bg-white p-2 shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)", minWidth: 260 }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setMesVista(new Date(mesVista.getFullYear(), mesVista.getMonth() - 1, 1))} className="rounded px-2 py-1 text-sm hover:bg-black/5" aria-label="Mes anterior">‹</button>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{tituloMes}</span>
            <button type="button" onClick={() => setMesVista(new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 1))} className="rounded px-2 py-1 text-sm hover:bg-black/5" aria-label="Mes siguiente">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="py-1 font-medium">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map((d, i) => {
              if (!d) return <span key={`e-${i}`} />;
              const iso = aISO(d);
              const esSeleccionado = iso === valor;
              const esHoy = iso === hoyISO;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    setValor(iso);
                    setMesVista(new Date(d.getFullYear(), d.getMonth(), 1));
                    setAbierto(false);
                  }}
                  className="rounded-full py-1.5 text-xs font-medium"
                  style={
                    esSeleccionado
                      ? { background: "var(--marca)", color: "#fff" }
                      : esHoy
                        ? { background: "var(--marca-suave)", color: "var(--marca)", boxShadow: "inset 0 0 0 1px var(--marca)" }
                        : { color: "var(--text-primary)" }
                  }
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between">
            <button type="button" onClick={() => { setValor(""); setAbierto(false); }} className="text-xs" style={{ color: "var(--text-muted)" }}>Limpiar</button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs font-medium" style={{ color: "var(--marca)" }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
