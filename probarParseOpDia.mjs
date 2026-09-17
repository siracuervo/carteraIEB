import { readFile } from "fs/promises";
import { parseOperacionesDelDia } from "./lib/parseIEB.js";

const ruta = "IEB-2026-09-16-Operaciones-del-Día-320292.xlsx";
const buf = await readFile(ruta);
const trans = await parseOperacionesDelDia(buf);
console.log("total:", trans.length);
console.log(JSON.stringify(trans[0], null, 2));
