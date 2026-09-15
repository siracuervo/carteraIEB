import { put, list } from "@vercel/blob";
import { resolverTickers } from "./calculos.js";

async function leerJSON(nombre, porDefecto) {
  try {
    const { blobs } = await list({ prefix: nombre, limit: 1 });
    const blob = blobs.find((b) => b.pathname === nombre);
    if (!blob) return porDefecto;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return porDefecto;
    return await res.json();
  } catch (err) {
    return porDefecto;
  }
}

async function escribirJSON(nombre, valor) {
  await put(nombre, JSON.stringify(valor, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ... acá abajo va TODO el resto del archivo sin cambios:
// claveTransaccion, leerTransacciones, mergeTransacciones,
// leerPortafolioHistorial, agregarAlPortafolioHistorial,
// leerClasificaciones, guardarClasificacion
