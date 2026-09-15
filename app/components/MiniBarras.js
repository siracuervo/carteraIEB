const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** Barras horizontales de hasta 5 activos, largo proporcional al |retorno| de cada uno. */
export default function MiniBarras({ items, color }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((t) => Math.abs(t.retornoPct)));
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((t) => {
        const ancho = max > 0 ? (Math.abs(t.retornoPct) / max) * 100 : 0;
        return (
          <li key={t.clave} className="flex items-center gap-2">
            <span className="w-14 shrink-0 truncate text-xs" style={{ color: "var(--text-secondary)" }} title={t.activo}>
              {t.ticker || t.activo}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--gridline)" }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(ancho, 4)}%`, background: color }} />
            </span>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {formatoPct.format(t.retornoPct)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
