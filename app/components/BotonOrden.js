/** Encabezado de columna clickeable para ordenar una tabla, con indicador ▲▼ de dirección activa. */
export default function BotonOrden({ columna, ordenActual, onClick, children }) {
  const activo = ordenActual?.columna === columna;
  const ascActivo = activo && ordenActual.direccion === "asc";
  const descActivo = activo && ordenActual.direccion === "desc";
  return (
    <button
      type="button"
      onClick={() => onClick(columna)}
      className="flex items-center gap-1 font-medium"
      style={{ color: activo ? "var(--text-primary)" : "var(--text-secondary)" }}
    >
      {children}
      <span className="flex flex-col leading-[0.6]" style={{ fontSize: "9px" }}>
        <span style={{ color: ascActivo ? "var(--marca)" : "var(--text-muted)" }}>▲</span>
        <span style={{ color: descActivo ? "var(--marca)" : "var(--text-muted)" }}>▼</span>
      </span>
    </button>
  );
}
