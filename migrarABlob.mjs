/**
 * Migración única: sube los JSON de ./data al Blob Store de Vercel para que la
 * app en producción arranque con los mismos datos que en local.
 *
 * Uso (token NO se guarda en ningún archivo):
 *   $env:BLOB_READ_WRITE_TOKEN="vercel_blob_xxx..."  # PowerShell
 *   node migrarABlob.mjs
 *
 * El token está en el dashboard de Vercel → tu Blob Store → ".env.local".
 * Este archivo es temporal: borralo después de migrar.
 */
import { readdir, readFile } from "fs/promises";
import { put, list } from "@vercel/blob";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("Falta BLOB_READ_WRITE_TOKEN en el entorno.");
  process.exit(1);
}

const base = new URL("./data/", import.meta.url);
const archivos = (await readdir(base)).filter((f) => f.endsWith(".json"));
if (!archivos.length) {
  console.error("No hay JSON en ./data.");
  process.exit(1);
}

for (const nombre of archivos) {
  const contenido = await readFile(new URL(`./data/${nombre}`, import.meta.url), "utf-8");
  JSON.parse(contenido); // valida que sea JSON válido antes de subir
  const res = await put(`datos/${nombre}`, contenido, {
    access: "public",
    contentType: "application/json",
    token,
  });
  console.log("OK", nombre, "->", res.pathname);
}

const { blobs } = await list({ prefix: "datos/", limit: 50, token });
console.log(`\nEn el store hay ${blobs.length} archivos bajo datos/.`);
