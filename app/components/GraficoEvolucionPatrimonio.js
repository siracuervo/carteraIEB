"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { fechaLocal } from "@/lib/fechas";
import { usePrivacidad } from "./PrivacidadContext";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoARSCompacto = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0, notation: "compact" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

const RANGOS = [
  { id: 7, etiqueta: "7D" },
  { id: 30, etiqueta: "30D" },
  { id: 90, etiqueta: "90D" },
  { id: "todo", etiqueta: "Todo" },
];

function TooltipPersonalizado({ active, payload }) {  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.valorTotalARS == null) return null;
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <div className="font-medium">{formatoFechaCorta.format(fechaLocal(d.fecha))}</div>
      <div style={{ color: "var(--text-secondary)" }}>{formatoARS.format(d.valorTotalARS)}</div>
    </div>
  );
}

/**
 * Serie de los últimos 30 días HÁBILES de patrimonio total (ver
 * `calcularSerieEvolucion` — sábado y domingo ni aparecen, no hace falta saltarlos).
 * Los días previos al primer Portfolio importado se grafican en $0 a propósito —
 * es una señal visual de cuánto historial falta, no un valor real — mientras que
 * los huecos dentro del rango con datos (feriados, un día que no se importó) se
 * saltan con una línea continua (`connectNulls`) en vez de caer a cero.
 */
export default function GraficoEvolucionPatrimonio({ serie }) {
  const { oculto } = usePrivacidad();
  const [rango, setRango] = useState("todo");

  const datos = useMemo(() => {
    if (!serie?.length) return [];
    if (rango === "todo") {
      const i = serie.findIndex((d) => d.valorTotalARS != null && d.valorTotalARS > 0);
      return i === -1 ? serie : serie.slice(i);
    }
    return serie.slice(-rango);
  }, [serie, rango]);

  if (oculto) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Gráfico oculto en modo privacidad
      </div>
    );
  }

  if (!datos.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Evolución del portafolio</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay Portfolios importados.</p>
      </div>
    );
  }

  // Eje Y. Por defecto recharts arranca en 0 y si el patrimonio es grande y con poca
  // variación la línea queda pegada arriba sin que se note el movimiento. Se acerca la
  // escala al rango real de valores con un margen del 15% para que la evolución día a
  // día sea la protagonista. Los días en $0 (anteriores al primer import) quedan fuera
  // del eje de propósito: la nota de abajo ya explica que son historial faltante.
  const valoresReales = datos.map((d) => d.valorTotalARS).filter((v) => v != null && v > 0);
  let dominioY;
  if (valoresReales.length) {
    const min = Math.min(...valoresReales);
    const max = Math.max(...valoresReales);
    if (min === max) {
      dominioY = [min * 0.95, max * 1.05];
    } else {
      const pad = (max - min) * 0.15;
      dominioY = [Math.max(0, min - pad), max + pad];
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-xs font-medium sm:text-sm" style={{ color: "var(--text-primary)" }}>
          Evolución del portafolio ({rango === "todo" ? "todo el historial" : `${rango} días hábiles`})
        </h3>
        <div className="flex gap-1">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRango(r.id)}
              className="cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium transition-colors"
              style={rango === r.id ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 min-h-[140px] w-full flex-1 sm:min-h-[160px] lg:min-h-0" style={{ width: "100%" }}>
        <ResponsiveContainer>
          <AreaChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rellenoEvolucionCartera" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--marca)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--marca)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--gridline)" />
            <XAxis
              dataKey="fecha"
              tickFormatter={(f) => formatoFechaCorta.format(fechaLocal(f))}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={dominioY}
              tickFormatter={(v) => formatoARSCompacto.format(v)}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<TooltipPersonalizado />} />
            <Area
              type="monotone"
              dataKey="valorTotalARS"
              stroke="var(--marca)"
              strokeWidth={2}
              fill="url(#rellenoEvolucionCartera)"
              connectNulls
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
