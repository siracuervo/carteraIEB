import { promises as fs } from "fs";
import path from "path";
import { resolverTickers } from "./calculos.js";

const DATA_DIR = path.join(process.cwd(), "data");

async function asegurarDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function leerJSON(nombre, porDefecto) {
  try {
    const contenido = await fs.readFile(path.join(DATA_DIR, nombre), "utf-8");
    return JSON.parse(contenido);
  } catch (err) {
    if (err.code === "ENOENT") return porDefecto;
    throw err;
  }
}

async function escribirJSON(nombre, valor) {
  await asegurarDataDir();
  await fs.writeFile(path.join(DATA_DIR, nombre), JSON.stringify(valor, null, 2), "utf-8");
}

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
