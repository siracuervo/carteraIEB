// Helpers compartidos para leer celdas de ExcelJS en los distintos formatos de export de IEB.

export function valorCelda(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
  }
  return v;
}

export function aTexto(cell) {
  const v = valorCelda(cell);
  if (v === null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function aNumero(cell) {
  const v = valorCelda(cell);
  if (v === null || v === "" || v instanceof Date) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Excel guarda las fechas como serial numérico con época 1899-12-30.
export function aFechaISO(cell) {
  const v = valorCelda(cell);
  if (v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const texto = String(v).trim();
  const ddmmyyyy = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  const isoDate = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return isoDate[0].slice(0, 10);
  return null;
}
