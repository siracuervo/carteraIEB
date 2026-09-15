"use client";

import { useState } from "react";
import ValorSensible from "./ValorSensible";
import { fechaLocal } from "@/lib/fechas";
import { aISO } from "@/lib/accesosRapidosFecha";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

/** Índice (0=lunes .. 4=viernes) del día hábil a mostrar por defecto. Sáb/dom caen en el viernes. */
function indiceHoy() {
  const dia = new Date().getDay();
  if (dia === 0) return 4;
  return Math.min(dia - 1, 4);
}

function SelectorDias({ dias, seleccionado, onSeleccionar }) {
  const hoyISO = aISO(new Date());
  return (
    <div className="flex shrink-0 gap-1">
      {dias.map((d, i) => {
        const activo = i === seleccionado;
        const futuro = d.fecha > hoyISO;
        let estilo;
        if (d.disponible) {
          estilo = activo
            ? { background: "var(--marca)", color: "#fff" }
            : { background: "var(--marca-suave)", color: "var(--marca)" };
        } else {
          estilo = activo
            ? { background: "var(--gridline)", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--text-muted)" }
            : { background: "transparent", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--border)" };
        }
        return (
          <button
            key={i}
            type="button"
            disabled={futuro}
            onClick={() => onSeleccionar(i)}
            title={d.fecha}
            className="h-7 w-7 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={estilo}
          >
            {d.letra}
          </button>
        );
      })}
    </div>
  );
}

function Fila({ etiqueta, subtitulo, variacion }) {
  if (!variacion) {
    return (
      <div className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{subtitulo}</p>
      </div>
    );
  }

  const color = variacion.diffARS >= 0 ? "var(--good)" : "var(--bad)";
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
        <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {formatoFechaCorta.format(fechaLocal(variacion.desdeFecha))} → {formatoFechaCorta.format(fechaLocal(variacion.hastaFecha))}
        </div>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums" style={{ color }}>
          {formatoPct.format(variacion.diffPct)}
        </span>
        <span className="text-sm tabular-nums" style={{ color }}>
          <ValorSensible>{formatoARS.format(variacion.diffARS)}</ValorSensible>
        </span>
      </div>
      {variacion.basadoEnFecha && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Cartera basada en las posiciones del {formatoFechaCorta.format(fechaLocal(variacion.basadoEnFecha))} — todavía falta importar el Portfolio de hoy.
        </p>
      )}
    </div>
  );
}

/**
 * Compara el último Portfolio importado contra el anterior (diaria, según el día
 * elegido en el selector L M M J V) y contra el cierre de la semana anterior,
 * mostrado como "lunes → hoy" (semanal acumulada — ver `calcularEvolucionPatrimonio`
 * para por qué la base es el viernes y no el lunes). El selector arranca en el día de
 * hoy (sáb/dom muestran el viernes) y solo deja elegir días violeta (con Portfolio
 * importado ese día y con un snapshot previo contra el cual compararlo); los grises
 * no tienen ese dato todavía.
 */
export default function EvolucionPatrimonio({ evolucion, evolucionSemana }) {
  const dias = evolucionSemana || [];
  const [seleccionado, setSeleccionado] = useState(indiceHoy());

  if (!evolucion) return null;

  const diaActivo = dias[seleccionado];

  return (
    <div className="flex h-full flex-col justify-center gap-3 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Evolución de la cartera</h3>
        {dias.length > 0 && <SelectorDias dias={dias} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />}
      </div>
      <Fila
        etiqueta="Variación diaria"
        subtitulo={
          diaActivo?.fecha > aISO(new Date())
            ? "Ese día todavía no llegó."
            : "No se importó el Portfolio de ese día (o es el primero del historial, sin uno previo para comparar)."
        }
        variacion={diaActivo?.disponible ? diaActivo.variacion : null}
      />
      <Fila
        etiqueta="Variación semanal"
        subtitulo="Necesitás un Portfolio importado de una semana anterior para calcular la variación semanal."
        variacion={evolucion.semanal}
      />
    </div>
  );
}
