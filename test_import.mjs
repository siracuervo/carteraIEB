import { readFile } from "fs/promises";
import { parseArchivoIEB } from "./lib/parseIEB.js";

const rutas = [
  "C:/Users/flsir/Downloads/IEB-2026-09-16-Operaciones-del-Día-320292 (2).xlsx",
  "C:/Users/flsir/Downloads/IEB-2026-09-16-Operaciones-del-Día-320292 (1).xlsx",
  "C:/Users/flsir/Downloads/IEB-2026-09-16-Operaciones-del-Día-320292.xlsx",
];

for (const r of rutas) {
  try {
    const buf = await readFile(r);
    const res = await parseArchivoIEB(buf);
    console.log("OK ", r.split("/").pop());
    console.log("  formato =", res.formato);
    console.log("  rango   =", JSON.stringify(res.rango));
    console.log("  n       =", res.transacciones?.length);
    if (res.transacciones?.[0]) console.log("  t0      =", JSON.stringify(res.transacciones[0]));
  } catch (e) {
    console.log("ERR", r.split("/").pop(), "=>", e.message);
  }
}
