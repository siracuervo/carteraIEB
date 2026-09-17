import { promises as fs } from "fs";
import path from "path";
import { resolverTickersConPortafolio } from "./calculos.js";

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
 * Actualiza una transacción existente, identificada por su clave de dedup
 * (claveTransaccion). Reescribe los campos que vengan en `datos`; devuelve false
 * si no encontró ninguna transacción con esa clave.
 */
export async function actualizarTransaccion(clave, datos) {
  const lista = await leerTransacciones();
  const idx = lista.findIndex((t) => claveTransaccion(t) === clave);
  if (idx === -1) return false;
  lista[idx] = { ...lista[idx], ...datos };
  const historial = await leerPortafolioHistorial();
  const resultado = resolverTickersConPortafolio(lista, historial);
  await escribirJSON("transacciones.json", resultado);
  return true;
}

/**
 * Mergea transacciones nuevas con las existentes, dedup por claveTransaccion.
 * Cuando la misma operación aparece en ambos archivos de IEB, combina los campos
 * (se completan los que falten, nunca se pisa un dato ya cargado por null).
 */
export async function mergeTransacciones(nuevas) {
  const existentes = await leerTransacciones();
  const porClave = new Map(existentes.map((t) => [claveTransaccion(t), t]));

  // Duplicados genuinos dentro del mismo lote: dos fills idénticos (mismo ticker,
  // operación, fecha, cantidad y precio — IEB informa boleto "0") colapsarían en una
  // sola fila. Se desambigua por orden de aparición, determinístico entre reimports
  // del mismo archivo.
  const vistos = new Map();
  const lote = (nuevas || []).map((t) => {
    const base = claveTransaccion(t);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    if (n > 1 && !t.nroOperacion) {
      return { ...t, nroOperacion: `dup-${n}-${t.fecha}-${t.ticker || t.activo}-${t.cantidad}` };
    }
    return t;
  });

  let agregadas = 0;
  let actualizadas = 0;

  for (const t of lote) {
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
  // operación del mismo activo que sí lo trae. Además usamos el historial de
  // Portafolios como diccionario nombre→ticker para las que nunca vienen con
  // "Referencia" (ej. el export de histórico de tenencia).
  const historial = await leerPortafolioHistorial();
  const resultado = resolverTickersConPortafolio(Array.from(porClave.values()), historial);
  await escribirJSON("transacciones.json", resultado);
  return { agregadas, actualizadas, total: resultado.length };
}

export async function leerPortafolioHistorial() {
  return leerJSON("portafolioHistorial.json", []);
}

export async function leerCierresDiarios() {
  return leerJSON("cierresDiarios.json", {});
}

export async function mergeCierresDiarios(cierres) {
  if (!cierres || typeof cierres !== "object") return await leerCierresDiarios();
  const actuales = await leerCierresDiarios();
  let cambio = false;
  for (const [fecha, precios] of Object.entries(cierres)) {
    if (!precios || typeof precios !== "object") continue;
    const destino = actuales[fecha] ?? (actuales[fecha] = {});
    for (const [ticker, precio] of Object.entries(precios)) {
      if (precio == null || !isFinite(precio)) continue;
      const prev = destino[ticker];
      if (prev == null || Math.abs(prev - precio) > 1e-9) {
        destino[ticker] = precio;
        cambio = true;
      }
    }
  }
  if (cambio) await escribirJSON("cierresDiarios.json", actuales);
  return actuales;
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

/**
 * Movimientos de fondos (plata que entra/sale por fuera del mercado:
 * depósitos, transferencias, retiros). La caja del dashboard es
 * efectivo(snapshot) + tickets posteriores + estos movimientos (misma regla:
 * solo los posteriores al último Portafolio, que el snapshot ya los incluye).
 * Cada uno: { id, fecha, tipo: "ingreso"|"retiro", monto (>0), nota }.
 */
export async function leerMovimientosFondos() {
  return leerJSON("movimientosFondos.json", []);
}

export async function agregarMovimientoFondo({ fecha, tipo, monto, nota }) {
  const lista = await leerMovimientosFondos();
  const entrada = {
    id: `fondo-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fecha,
    tipo: tipo === "retiro" ? "retiro" : "ingreso",
    monto: Math.abs(monto),
    nota: nota?.trim() ? nota.trim().slice(0, 120) : null,
  };
  lista.push(entrada);
  lista.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("movimientosFondos.json", lista);
  return entrada;
}

export async function eliminarMovimientoFondo(id) {
  const lista = await leerMovimientosFondos();
  const filtrada = lista.filter((f) => f.id !== id);
  if (filtrada.length === lista.length) return false;
  await escribirJSON("movimientosFondos.json", filtrada);
  return true;
}

/** overrides: { [claveActivo]: { claseActivo?, sector?, precioManual? } } */
export async function guardarClasificacion(claveActivo, datos) {
  const actuales = await leerClasificaciones();
  actuales[claveActivo] = { ...actuales[claveActivo], ...datos };
  await escribirJSON("clasificaciones.json", actuales);
  return actuales;
}
