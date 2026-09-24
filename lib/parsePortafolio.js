// exceljs es pesado y revienta al evaluarse en el runtime de Cloudflare
// Workers: se importa lazy, solo cuando se parsea un archivo.
let ExcelJS = null;
async function excelJS() {
  if (!ExcelJS) ExcelJS = (await import("exceljs")).default;
  return ExcelJS;
}
import { aTexto, aNumero, aFechaISO } from "./excelHelpers.js";

const MONEDAS_VALIDAS = new Set(["ARS", "USD"]);
const FILAS_A_IGNORAR = new Set(["Disponible", "Liquidar", "Subtotal"]);

/**
 * Formato "Portafolio": lo que IEB reporta como tenencia actual, ya con cantidad,
 * precio, costo promedio ponderado (PPP) y resultado calculados por ellos. No hace
 * falta reconstruir nada — es la fuente de verdad de "qué tengo hoy".
 *
 * sheet1: patrimonio total + una sección por mercado (Tenencia Mercado Argentino,
 * Cedears, Otros), cada instrumento como una fila principal seguida de sub-filas
 * "Disponible"/"Liquidar" que solo desglosan el estado de liquidación (se ignoran).
 * sheet2: efectivo disponible por moneda (ARS / USD / USD Ext.), con un renglón
 * "Total" al final de cada bloque.
 */
export async function parsePortafolio(buffer) {
  const wb = new (await excelJS()).Workbook();
  await wb.xlsx.load(buffer);

  const ws1 = wb.worksheets[0];
  let fecha = null;
  let patrimonioTotal = null;
  let seccionActual = null;
  const tenencias = [];

  ws1.eachRow((row) => {
    const a = aTexto(row.getCell(1));
    const b = aTexto(row.getCell(2));

    if (a === "Fecha:") {
      fecha = aFechaISO(row.getCell(2));
      return;
    }
    if (a === "Patrimonio total") {
      patrimonioTotal = aNumero(row.getCell(2));
      return;
    }
    if (a === "Especie" && b === "Moneda de emisión") return; // encabezado de columnas
    if (!a || FILAS_A_IGNORAR.has(a)) return;

    if (!MONEDAS_VALIDAS.has(b)) {
      seccionActual = a; // título de sección (celda combinada, el resto de la fila viene vacío)
      return;
    }

    const idx = a.indexOf(" - ");
    const ticker = idx > 0 ? a.slice(0, idx).trim() : null;
    const nombre = idx > 0 ? a.slice(idx + 3).trim() : a;

    tenencias.push({
      especie: a,
      ticker,
      nombre,
      seccion: seccionActual,
      moneda: b,
      cantidad: aNumero(row.getCell(3)),
      precio: aNumero(row.getCell(4)),
      pctDelTotal: aNumero(row.getCell(5)),
      ppp: aNumero(row.getCell(6)),
      varPct: aNumero(row.getCell(7)),
      resultado: aNumero(row.getCell(8)),
      posicionTotal: aNumero(row.getCell(10)),
    });
  });

  const efectivo = { ARS: 0, USD: 0 };
  const ws2 = wb.worksheets[1];
  if (ws2) {
    let bloqueEfectivo = null;
    ws2.eachRow((row) => {
      const a = aTexto(row.getCell(1)).trim();
      if (!a) return;
      if (a === "ARS" || a === "USD") {
        bloqueEfectivo = a;
        return;
      }
      if (a === "USD Ext.") {
        bloqueEfectivo = null; // fondos fuera del país, no los sumamos al total operable
        return;
      }
      if (a === "Total" && bloqueEfectivo) {
        const saldo = aNumero(row.getCell(3));
        if (saldo != null) efectivo[bloqueEfectivo] += saldo;
      }
    });
  }

  return { fecha, patrimonioTotal, tenencias, efectivo };
}
