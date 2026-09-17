import ExcelJS from "exceljs";
import { readFile } from "fs/promises";

const ruta = "IEB-2026-09-16-Operaciones-del-Dia-320292.xlsx";
const buf = await readFile(ruta);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws = wb.worksheets[0];
console.log("hojas:", wb.worksheets.map((s) => ({ nombre: s.name, filas: s.rowCount })));
console.log("A1:", JSON.stringify(ws.getCell(1, 1).value), "| B1:", JSON.stringify(ws.getCell(1, 2).value));
for (let f = 1; f <= 32; f++) {
  const fila = [];
  for (let c = 1; c <= 9; c++) fila.push(ws.getCell(f, c).value);
  console.log(f, JSON.stringify(fila));
}
