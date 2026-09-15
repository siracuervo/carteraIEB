import ExcelJS from "exceljs";
import { aTexto, aNumero, aFechaISO } from "./excelHelpers.js";
import { parseReportesDetallados } from "./parseReportesDetallados.js";

const ENCABEZADO_HISTORICO = ["Operación", "Fecha operación"];

/**
 * Formato "histórico de tenencia": una sección por activo (solo col. A completa),
 * seguida de una fila de encabezado repetida y las filas de operaciones de ese activo.
 */
export async function parseHistoricoTenencia(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const rango = { desde: null, hasta: null };
  const transacciones = [];
  let activoActual = null;

  ws.eachRow((row) => {
    const a = aTexto(row.getCell(1));
    const b = aTexto(row.getCell(2));

    if (a === "Desde") {
      rango.desde = b;
      return;
    }
    if (a === "Hasta") {
      rango.hasta = b;
      return;
    }
    if (a === ENCABEZADO_HISTORICO[0] && b === ENCABEZADO_HISTORICO[1]) {
      return; // fila de encabezado de columnas, repetida por sección
    }

    const g = aTexto(row.getCell(7));
    if (a && b === a && g === a) {
      // fila de título de sección: es una celda combinada A:G, Excel/ExcelJS
      // repite el mismo valor en las 7 columnas.
      activoActual = a;
      return;
    }
    if (!a || !activoActual) return;

    const saldoTexto = aTexto(row.getCell(7));
    transacciones.push({
      activo: activoActual,
      ticker: null,
      operacion: a,
      fecha: aFechaISO(row.getCell(2)),
      fechaLiquidacion: aFechaISO(row.getCell(3)),
      nroOperacion: aTexto(row.getCell(4)) || null,
      precio: aNumero(row.getCell(5)),
      cantidad: aNumero(row.getCell(6)),
      importeARS: null,
      importeDivisas: null,
      divisa: null,
      saldoTenencia: saldoTexto === "-" ? 0 : aNumero(row.getCell(7)),
      fuente: "historico-tenencia",
    });
  });

  return { rango, transacciones };
}

/**
 * Formato "toda la actividad": listado plano, una fila por movimiento de cuenta,
 * con el ticker corto en "Referencia" y montos en ARS y en divisa original.
 */
export async function parseTodaLaActividad(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const transacciones = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const referencia = aTexto(row.getCell(1));
    if (!referencia) return;

    const nroOperacionTexto = aTexto(row.getCell(5));
    const importeDivisasTexto = aTexto(row.getCell(9));

    transacciones.push({
      activo: null,
      ticker: referencia,
      operacion: aTexto(row.getCell(2)),
      fecha: aFechaISO(row.getCell(3)),
      fechaLiquidacion: aFechaISO(row.getCell(4)),
      nroOperacion: nroOperacionTexto && nroOperacionTexto !== "-" ? nroOperacionTexto : null,
      cantidad: aNumero(row.getCell(6)),
      precio: aNumero(row.getCell(7)),
      importeARS: aNumero(row.getCell(8)),
      importeDivisas: importeDivisasTexto === "-" ? null : aNumero(row.getCell(9)),
      divisa: aTexto(row.getCell(10)) || "ARS",
      saldoTenencia: null,
      fuente: "toda-la-actividad",
    });
  });

  return transacciones;
}

/** Detecta el formato del export de IEB mirando la fila de encabezado. */
export async function parseArchivoIEB(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const fila1 = aTexto(ws.getRow(1).getCell(1));

  if (fila1 === "Desde") {
    const { rango, transacciones } = await parseHistoricoTenencia(buffer);
    return { formato: "historico-tenencia", rango, transacciones };
  }
  if (fila1 === "Referencia") {
    const transacciones = await parseTodaLaActividad(buffer);
    return { formato: "toda-la-actividad", rango: null, transacciones };
  }
  if (fila1 === "Especie") {
    const transacciones = await parseReportesDetallados(buffer);
    return { formato: "reportes-detallados", rango: null, transacciones };
  }
  throw new Error(
    "No se reconoce el formato del archivo. Se esperaba un export de IEB de 'histórico de tenencia', 'toda la actividad' o 'reportes detallados'."
  );
}
