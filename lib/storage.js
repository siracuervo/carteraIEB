import { put, list } from "@vercel/blob";
import { resolverTickers } from "./calculos.js";

async function leerJSON(nombre, porDefecto) {
  try {
    const { blobs } = await list({ prefix: nombre, limit: 1 });
    const blob = blobs.find((b) => b.pathname === nombre);
    if (!blob) return porDefecto;
    const res = await fetch(blob.url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return porDefecto;
    return await res.json();
  } catch (err) {
    return porDefecto;
  }
}

async function escribirJSON(nombre, valor) {
  await put(nombre, JSON.stringify(valor, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ... acá abajo, sin cambios: claveTransaccion, leerTransacciones,
// mergeTransacciones, leerPortafolioHistorial,
// agregarAlPortafolioHistorial, leerClasificaciones, guardarClasificacion

/** Clave de dedup: el número de operación de IEB cuando existe, si no una clave sintética. */
export function claveTransaccion(t) {
  if (t.nroOperacion) return `op:${t.nroOperacion}`;
  return `sint:${t.ticker || t.activo || ""}|${t.operacion}|${t.fecha}|${t.cantidad}|${t.precio}`;
}

export async function leerTransacciones() {
  return leerJSON("transacciones.json", []);
}

/**
 * Mergea transacciones nuevas con las existentes, dedup por claveTransaccion.
 * Cuando la misma operación aparece en ambos archivos de IEB, combina los campos
 * (se completan los que falten, nunca se pisa un dato ya cargado por null).
 */
export async function mergeTransacciones(nuevas) {
  const existentes = await leerTransacciones();
  const porClave = new Map(existentes.map((t) => [claveTransaccion(t), t]));

  let agregadas = 0;
  let actualizadas = 0;

  for (const t of nuevas) {
    const clave = claveTransaccion(t);
    const previa = porClave.get(clave);
    if (!previa) {
      porClave.set(clave, t);
      agregadas++;
      continue;
    }
    let cambio = false;
    const combinada = { ...previa };
    for (const campo of Object.keys(t)) {
      if ((combinada[campo] === null || combinada[campo] === undefined) && t[campo] !== null && t[campo] !== undefined) {
        combinada[campo] = t[campo];
        cambio = true;
      }
    }
    if (cambio) {
      porClave.set(clave, combinada);
      actualizadas++;
    }
  }

  // resolvemos tickers sobre el set COMPLETO (no solo lo nuevo): una transacción vieja
  // sin ticker puede quedar resuelta recién ahora, si esta importación trae otra
  // operación del mismo activo que sí lo trae.
  const resultado = resolverTickers(Array.from(porClave.values()));
  await escribirJSON("transacciones.json", resultado);
  return { agregadas, actualizadas, total: resultado.length };
}

export async function leerPortafolioHistorial() {
  return leerJSON("portafolioHistorial.json", []);
}

/**
 * Guarda un import de "Portafolio" (la tenencia tal cual la calcula IEB) en el
 * historial. Un solo punto por día: si ya existe uno para esa fecha, se reemplaza
 * por el más reciente en vez de acumular duplicados.
 */
export async function agregarAlPortafolioHistorial(entrada) {
  const historial = await leerPortafolioHistorial();
  const sinEsaFecha = historial.filter((h) => h.fecha !== entrada.fecha);
  sinEsaFecha.push(entrada);
  sinEsaFecha.sort((a, b) => a.fecha.localeCompare(b.fecha));
  await escribirJSON("portafolioHistorial.json", sinEsaFecha);
  return sinEsaFecha;
}

export async function leerClasificaciones() {
  return leerJSON("clasificaciones.json", {});
}

/** overrides: { [claveActivo]: { claseActivo?, sector?, precioManual? } } */
export async function guardarClasificacion(claveActivo, datos) {
  const actuales = await leerClasificaciones();
  actuales[claveActivo] = { ...actuales[claveActivo], ...datos };
  await escribirJSON("clasificaciones.json", actuales);
  return actuales;
}
