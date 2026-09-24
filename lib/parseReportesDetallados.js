// exceljs es pesado y revienta al evaluarse en el runtime de Cloudflare
// Workers: se importa lazy, solo cuando se parsea un archivo.
let ExcelJS = null;
async function excelJS() {
  if (!ExcelJS) ExcelJS = (await import("exceljs")).default;
  return ExcelJS;
}
import { aTexto, aNumero, aFechaISO } from "./excelHelpers.js";

// Este formato usa códigos cortos en vez de "COMPRA NORMAL"/"VENTA": los normalizamos
// a los mismos que ya reconoce el resto de la app (mezclar formatos no debe importar
// aguas abajo). CPU$/VTU$ son compra/venta en dólares — igual son compra/venta.
const CODIGO_A_OPERACION = {
  CPRA: "COMPRA NORMAL",
  CTRA: "COMPRA TRADING",
  "CPU$": "COMPRA NORMAL",
  VTAS: "VENTA",
  VTRA: "VENTA TRADING",
  "VTU$": "VENTA",
};

/**
 * Formato "Reportes detallados": listado plano de compras y ventas, una fila por
 * operación, con "Especie" (nombre completo, sin ticker corto) e "Importe" real ya
 * calculado por IEB para cada una — a diferencia de "histórico de tenencia", trae el
 * importe sin que haga falta cruzarlo con otro archivo.
 */
export async function parseReportesDetallados(buffer) {
  const wb = new (await excelJS()).Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const transacciones = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const especie = aTexto(row.getCell(1));
    if (!especie) return;

    const codigo = aTexto(row.getCell(2)).toUpperCase();
    const nroOperacionTexto = aTexto(row.getCell(5));

    transacciones.push({
      activo: especie,
      ticker: null,
      operacion: CODIGO_A_OPERACION[codigo] || codigo,
      fecha: aFechaISO(row.getCell(3)),
      fechaLiquidacion: aFechaISO(row.getCell(4)),
      nroOperacion: nroOperacionTexto && nroOperacionTexto !== "-" ? nroOperacionTexto : null,
      cantidad: aNumero(row.getCell(6)),
      precio: aNumero(row.getCell(7)),
      importeARS: aNumero(row.getCell(8)),
      importeDivisas: null,
      divisa: "ARS",
      saldoTenencia: null,
      fuente: "reportes-detallados",
    });
  });

  return transacciones;
}
