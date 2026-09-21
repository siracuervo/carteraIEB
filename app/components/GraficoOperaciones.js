"use client";

import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { fechaLocal } from "@/lib/fechas";
import { usePrivacidad } from "./PrivacidadContext";

const formatoARSCompacto = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0, notation: "compact" });
const formatoUSDCompacto = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: "compact" });
const formatoARSCompleto = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSDCompleto = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });
const formatoFechaLarga = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatoPrecio(valor, divisa, compacto) {
  if (divisa === "USD") return (compacto ? formatoUSDCompacto : formatoUSDCompleto).format(valor);
  return (compacto ? formatoARSCompacto : formatoARSCompleto).format(valor);
}

const ALTO_MIN = 8;
const ALTO_MAX = 34;
const ANCHO_VELA = 11;

/**
 * Arma los puntos del gráfico a partir de las mismas operaciones que la tabla de
 * abajo: eje X = fecha, eje Y = precio al que se pactó, y el "tamaño" (alto de la
 * vela) representa cuánto se operó — para dar una tercera dimensión sin perder la
 * lectura de precio en el tiempo. Se excluyen operaciones "paridad": su precio es
 * un % del valor técnico, no está en la misma escala que el resto de la serie.
 */
function armarDatos(movimientos, factorPrecio) {
  const puntos = movimientos
    .map((m) => {
      const op = (m.operacion || "").toUpperCase();
      const esCompra = op.includes("COMPRA");
      const esVenta = op.includes("VENTA");
      if ((!esCompra && !esVenta) || op.includes("PARIDAD")) return null;
      if (m.precio == null || m.cantidad == null || !m.fecha) return null;

      let importe = m.importeARS != null ? Math.abs(m.importeARS) : null;
      let estimado = false;
      if (importe == null) {
        importe = Math.abs(m.cantidad * m.precio * factorPrecio);
        estimado = true;
      }

      return {
        x: fechaLocal(m.fecha).getTime(),
        fecha: m.fecha,
        precio: m.precio,
        importe,
        tipo: esCompra ? "Compra" : "Venta",
        cantidad: Math.abs(m.cantidad),
        estimado,
      };
    })
    .filter(Boolean);

  if (puntos.length < 2) return puntos;

  const importes = puntos.map((p) => p.importe);
  const minImporte = Math.min(...importes);
  const maxImporte = Math.max(...importes);
  return puntos.map((p) => {
    // Raíz cuadrada para que el alto perciba "tamaño" (área), no escale lineal.
    const t = maxImporte > minImporte ? Math.sqrt((p.importe - minImporte) / (maxImporte - minImporte)) : 0.5;
    return { ...p, alto: ALTO_MIN + t * (ALTO_MAX - ALTO_MIN) };
  });
}

function VelaOperacion({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const color = payload.tipo === "Compra" ? "var(--good)" : "var(--bad)";
  return (
    <rect
      x={cx - ANCHO_VELA / 2}
      y={cy - payload.alto / 2}
      width={ANCHO_VELA}
      height={payload.alto}
      rx={2}
      fill={color}
      stroke="var(--surface-1)"
      strokeWidth={1}
    />
  );
}

function TooltipPersonalizado({ active, payload, divisa }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <div className="font-medium" style={{ color: d.tipo === "Compra" ? "var(--good)" : "var(--bad)" }}>
        {d.tipo} · {formatoFechaLarga.format(fechaLocal(d.fecha))}
      </div>
      <div style={{ color: "var(--text-secondary)" }}>
        Precio: {formatoPrecio(d.precio, divisa, false)}
      </div>
      <div style={{ color: "var(--text-secondary)" }}>
        {d.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })} unidades ·{" "}
        {formatoARSCompleto.format(d.importe)}
        {d.estimado ? " (estimado)" : ""}
      </div>
    </div>
  );
}

export default function GraficoOperaciones({ movimientos, factorPrecio, divisa }) {
  const { oculto } = usePrivacidad();
  const datos = armarDatos(movimientos, factorPrecio);

  if (datos.length < 2) return null; // con 0 o 1 operación no hay nada que comparar

  if (oculto) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Gráfico oculto en modo privacidad
      </div>
    );
  }

  const precios = datos.map((d) => d.precio);
  const minPrecio = Math.min(...precios);
  const maxPrecio = Math.max(...precios);
  const paddingY = (maxPrecio - minPrecio) * 0.15 || maxPrecio * 0.05 || 1;
  const xs = datos.map((d) => d.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const paddingX = (maxX - minX) * 0.08 || 86400000; // ~8% del rango, o 1 día si son el mismo día

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[minX - paddingX, maxX + paddingX]}
            tickFormatter={(v) => formatoFechaCorta.format(new Date(v))}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="precio"
            domain={[minPrecio - paddingY, maxPrecio + paddingY]}
            tickFormatter={(v) => formatoPrecio(v, divisa, true)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
          <Tooltip content={<TooltipPersonalizado divisa={divisa} />} cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }} />
          <Scatter data={datos} shape={VelaOperacion} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--good)" }} />
          Compra
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--bad)" }} />
          Venta
        </span>
        <span>· el alto de cada barra es el monto operado</span>
      </div>
    </div>
  );
}
