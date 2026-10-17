import * as XLSX from "xlsx";

/**
 * Parsea un export de IEB "Operaciones del día" (.xlsx) directamente en el
 * navegador con SheetJS, para no depender de exceljs (que necesita APIs de
 * Node.js que Cloudflare Workers no tiene).
 *
 * Devuelve un array de transacciones con la misma forma que espera
 * mergeTransacciones.
 */
function aFechaISO(v) {
  if (v === null || v === undefined || v === "") return null;
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

function aNumero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function aTexto(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

const TASA_DERECHOS = 0.000605;
function importeConDerechos(montoAbsoluto, esCompra) {
  if (!(montoAbsoluto > 0)) return montoAbsoluto;
  return esCompra
    ? montoAbsoluto * (1 + TASA_DERECHOS)
    : montoAbsoluto * (1 - TASA_DERECHOS);
}

export function parsearOperacionesDelDiaCliente(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const transacciones = [];
  let tickerActual = null;

  // Fecha del reporte: celda B1 (fila 1, columna 2, 0-based c=1)
  const celdaB1 = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
  const fecha = aFechaISO(celdaB1?.v);

  for (let r = range.s.r; r <= range.e.r; r++) {
    const celdaA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const a = aTexto(celdaA?.v);
    if (!a) continue;

    if (a === "Subtotales" || a === "Subtotal") {
      tickerActual = null;
      continue;
    }

    const operacion = a.toUpperCase();
    const esOperacion =
      operacion.startsWith("VENTA") || operacion.startsWith("COMPRA");
    if (operacion.startsWith("OPERAC")) continue; // fila de encabezado

    const celdaB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const celdaBTexto = aTexto(celdaB?.v);
    const celdaJ = ws[XLSX.utils.encode_cell({ r, c: 9 })];
    const celdaJTexto = aTexto(celdaJ?.v);

    // Fila de ticker: IEB repite el ticker en varias columnas (celda combinada).
    const esFilaTicker =
      celdaBTexto === a ||
      celdaJTexto === a ||
      (celdaBTexto === "" && !esOperacion);

    if (esFilaTicker) {
      tickerActual = a;
      continue;
    }

    if (!esOperacion || !tickerActual) continue;

    const celdaC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    const celdaD = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    const celdaH = ws[XLSX.utils.encode_cell({ r, c: 7 })];

    const cantidad = aNumero(celdaC?.v);
    const precio = aNumero(celdaD?.v);
    if (cantidad == null || precio == null) continue;

    const boleto = celdaBTexto;

    const importeARS =
      aNumero(celdaH?.v) ??
      Math.sign(cantidad) *
        importeConDerechos(
          Math.abs(cantidad * precio),
          !operacion.startsWith("VENTA")
        );

    transacciones.push({
      activo: tickerActual,
      ticker: tickerActual,
      operacion,
      fecha,
      fechaLiquidacion: null,
      nroOperacion: boleto && boleto !== "0" ? boleto : null,
      cantidad,
      precio,
      importeARS,
      importeDivisas: null,
      divisa: "ARS",
      saldoTenencia: null,
      fuente: "operaciones-del-dia",
    });
  }

  return transacciones;
}
