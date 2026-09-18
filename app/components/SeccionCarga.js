export default function SeccionCarga({ titulo, descripcion, estadoActual, abierta, children }) {
  return (
    <details open={abierta} className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{titulo}</span>
        {estadoActual && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {estadoActual}
          </span>
        )}
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--border)" }}>
        {descripcion && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{descripcion}</p>}
        <div className={descripcion ? "mt-4" : ""}>{children}</div>
      </div>
    </details>
  );
}
