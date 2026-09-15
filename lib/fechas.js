/**
 * new Date("2026-09-04") se interpreta como medianoche UTC. Si después se formatea
 * en una zona horaria detrás de UTC (ej. Argentina, UTC-3), muestra el día anterior.
 * Para fechas de calendario "puras" (sin hora) hay que construir el Date a partir
 * de sus componentes, en hora local, para que el formateo posterior no se corra.
 */
export function fechaLocal(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
