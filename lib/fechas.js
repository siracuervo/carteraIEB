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

/**
 * Fecha "YYYY-MM-DD" de hoy en hora argentina (UTC−3 fijo, sin horario de
 * verano). En Vercel el servidor corre en UTC: usar la fecha local del server
 * adelanta el día entre las 21:00 y las 24:00 ART y rompe las comparaciones
 * por fecha (ej. el override del cierre manual "de hoy" deja de matchear a
 * las 9pm). Misma lógica que hoyART() del cron de cierres.
 */
export function hoyArgentina(fecha = new Date()) {
  const art = new Date(fecha.getTime() - 3 * 3600 * 1000);
  const y = art.getUTCFullYear();
  const m = String(art.getUTCMonth() + 1).padStart(2, "0");
  const d = String(art.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
