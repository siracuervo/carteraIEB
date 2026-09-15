const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** Variación del precio actual contra el cierre de ayer, estilo broker: rectángulo
 * suave si el movimiento es chico, y sólido a partir de +-5% (sin seguir intensificando
 * más allá de eso). */
export default function BadgeVariacionDiaria({ pct }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const colorBase = pct >= 0 ? "var(--good)" : "var(--bad)";
  const fuerte = Math.abs(pct) >= 0.05;
  const estilo = fuerte
    ? { background: colorBase, color: "#fff" }
    : { background: `color-mix(in srgb, ${colorBase} 18%, transparent)`, color: colorBase };
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums" style={estilo}>
      {formatoPct.format(pct)}
    </span>
  );
}
