/** Formatea un Date a "YYYY-MM-DD" en horario local. */
export function aISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Rangos de fecha predefinidos para los filtros de "Ventas realizadas" — se
 * comparten entre la pestaña y la ficha de cada activo para que ambas ofrezcan
 * exactamente los mismos accesos rápidos. `calcular` recibe la fecha de inicio
 * de actividad registrada (puede ser null si todavía no se conoce) — la
 * mayoría de los rangos no la necesitan, "Máximo" es el único que la usa.
 */
export const ACCESOS_RAPIDOS_FECHA = [
  {
    etiqueta: "Esta semana",
    calcular: () => {
      const h = new Date();
      const diaSemana = h.getDay();
      const diffALunes = diaSemana === 0 ? -6 : 1 - diaSemana;
      const lunes = new Date(h);
      lunes.setDate(lunes.getDate() + diffALunes);
      return { desde: aISO(lunes), hasta: aISO(h) };
    },
  },
  {
    etiqueta: "Este mes",
    calcular: () => {
      const h = new Date();
      return { desde: aISO(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: aISO(h) };
    },
  },
  {
    etiqueta: "3 meses",
    calcular: () => {
      const h = new Date();
      const d = new Date(h);
      d.setMonth(d.getMonth() - 3);
      return { desde: aISO(d), hasta: aISO(h) };
    },
  },
  {
    etiqueta: "Este año",
    calcular: () => {
      const h = new Date();
      return { desde: aISO(new Date(h.getFullYear(), 0, 1)), hasta: aISO(h) };
    },
  },
  {
    etiqueta: "Máximo",
    calcular: (fechaInicio) => ({ desde: fechaInicio || "", hasta: aISO(new Date()) }),
  },
];
