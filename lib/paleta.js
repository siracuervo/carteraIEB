// Paleta categórica validada (ver skill dataviz) — orden fijo, nunca ciclada.
export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export const MAX_SERIES = SERIES_VARS.length;

/** Pliega categorías más allá de MAX_SERIES-1 en "Otros" para no ciclar colores. */
export function plegarEnOtros(datos, etiquetaOtros = "Otros") {
  if (datos.length <= MAX_SERIES) return datos;
  const principales = datos.slice(0, MAX_SERIES - 1);
  const resto = datos.slice(MAX_SERIES - 1);
  const otros = {
    etiqueta: etiquetaOtros,
    valorARS: resto.reduce((acc, d) => acc + d.valorARS, 0),
    pct: resto.reduce((acc, d) => acc + d.pct, 0),
  };
  return [...principales, otros];
}
