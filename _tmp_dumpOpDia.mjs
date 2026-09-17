import ExcelJS from "exceljs";
import { readFile, readdir } from "fs/promises";

const dir = process.cwd();
const candidatos = (await readdir(dir)).filter((n) => n.endsWith(".xlsx"));
console.log("xlsx en cwd:", candidatos);
const ruta = candidatos.find((n) => /operaciones/i.test(n)) || candidatos[0];
console.log("abriendo:", ruta);
const buf = await readFile(ruta);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws = wb.worksheets[0];
console.log("hojas:", wb.worksheets.map((s) => ({ nombre: s.name, filas: s.rowCount })));
console.log("A1:", ws.getCell(1, 1).value);
for (let f = 1; f <= 40; f++) {
  const fila = [];
  for (let c = 1; c <= 9; c++) {
    const v = ws.getCell(f, c).value;
    fila.push(v?.text ?? v);
  }
  console.log(f, JSON.stringify(fila));
}
