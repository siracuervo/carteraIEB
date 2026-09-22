import { promises as fs } from "fs";
import path from "path";
import { resolverTickersConPortafolio } from "./calculos.js";

const DATA_DIR = path.join(process.cwd(), "data");
// En Vercel (filesystem efímero) los JSON viven en Vercel Blob; en local siguen
// en ./data. Se activa solo con BLOB_READ_WRITE_TOKEN configurado.
const usaBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function asegurarDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function leerJSON(nombre, porDefecto) {
  if (!usaBlob) {
    try {
      const contenido = await fs.readFile(path.join(DATA_DIR, nombre), "utf-8");
      return JSON.parse(contenido);
    } catch (err) {
      if (err.code === "ENOENT") return porDefecto;
      throw err;
    }
  }
  const { list } = await import("@vercel/blob");
  // Prefijos aceptados, en orden: `datos/` (lo que escribe la app y
  // migrarABlob.mjs), `data/` (subir la carpeta a mano al store) y la raíz.
  const candidatos = [`datos/${nombre}`, `data/${nombre}`, `${nombre}`];
  let actual = null;
  for (const prefijo of candidatos) {
    const { blobs } = await list({ prefix: prefijo, limit: 20 });
    const mejor = blobs
      .filter((b) => b.pathname === `${prefijo}.json` || b.pathname.startsWith(`${prefijo}-`))
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))[0];
    if (mejor) {
      actual = mejor;
      break;
    }
  }
  if (!actual) return porDefecto;
  // downloadUrl funciona también con blobs privados; url solo con públicos.
  // En stores privados la descarga exige el token (en públicos se ignora).
  const tokenLectura = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(actual.downloadUrl ?? actual.url, {
    cache: "no-store",
    headers: tokenLectura ? { Authorization: `Bearer ${tokenLectura}` } : {},
  });
  if (!res.ok) {
    console.error(`[storage] No se pudo leer ${actual.pathname}: HTTP ${res.status}`);
    return porDefecto;
  }
  try {
    return await res.json();
  } catch {
    return porDefecto;
  }
}

async function escribirJSON(nombre, valor) {
  if (!usaBlob) {
    try {
      await asegurarDataDir();
      await fs.writeFile(path.join(DATA_DIR, nombre), JSON.stringify(valor, null, 2), "utf-8");
    } catch (err) {
      if (process.env.VERCEL) {
        throw new Error(
          "En Vercel hay que configurar BLOB_READ_WRITE_TOKEN (conectá un Blob Store en Storage) para guardar datos; después redeployá."
        );
      }
      throw err;
    }
    return;
  }
  const { put, del, list } = await import("@vercel/blob");
  const prefijo = `datos/${nombre}`;
  const cuerpo = JSON.stringify(valor, null, 2);
  // El store puede ser público o privado: se intenta público primero y se cae
  // a privado si el store lo exige.
  let creado = null;
  for (const access of ["public", "private"]) {
    try {
      creado = await put(`${prefijo}.json`, cuerpo, { access, contentType: "application/json" });
      break;
    } catch (err) {
      if (access === "private" || !/private store|public access/i.test(err.message)) throw err;
    }
  }
  // Borra versiones anteriores (cada put crea una URL nueva con sufijo aleatorio).
  const { blobs } = await list({ prefix: prefijo, limit: 20 });
  await Promise.all(
    blobs
      .filter((b) => b.url !== creado.url)
      .map((b) => del(b.url).catch(() => {}))
  );
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

export async function leerCierresManuales() {
  return leerJSON("cierresManuales.json", {});
}

/** Archivos que forman el respaldo completo de la app (whitelist de import/export). */
export const ARCHIVOS_RESPALDO = [
  "transacciones.json",
  "portafolioHistorial.json",
  "cierresDiarios.json",
  "cierresManuales.json",
  "movimientosFondos.json",
  "patrimonioAuto.json",
  "proyeccion.json",
  "traspasosEfectivo.json",
  "tradeNotas.json",
  "clasificaciones.json",
];

const POR_DEFECTO_RESPALDO = {
  "transacciones.json": [],
  "portafolioHistorial.json": [],
  "cierresDiarios.json": {},
  "cierresManuales.json": {},
  "movimientosFondos.json": [],
  "patrimonioAuto.json": {},
  "proyeccion.json": {},
  "traspasosEfectivo.json": [],
  "tradeNotas.json": {},
  "clasificaciones.json": {},
};

/** Lee todos los datasets para exportar el respaldo completo. */
export async function leerTodosLosDatos() {
  const pares = await Promise.all(
    ARCHIVOS_RESPALDO.map(async (nombre) => [nombre, await leerJSON(nombre, POR_DEFECTO_RESPALDO[nombre] ?? null)])
  );
  return Object.fromEntries(pares);
}

/**
 * Restaura el respaldo completo: valida que solo vengan archivos conocidos y
 * que cada contenido sea un objeto/array JSON válido antes de escribir.
 * Devuelve la lista de archivos escritos.
 */
export async function restaurarTodosLosDatos(objeto) {
  if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) {
    throw new Error("El archivo no es un respaldo válido.");
  }
  const archivos = objeto.archivos && typeof objeto.archivos === "object" ? objeto.archivos : objeto;
  const escritos = [];
  for (const [nombre, contenido] of Object.entries(archivos)) {
    if (!ARCHIVOS_RESPALDO.includes(nombre)) continue;
    if (contenido == null || typeof contenido !== "object") {
      throw new Error(`Contenido inválido en ${nombre}.`);
    }
    JSON.stringify(contenido);
    await escribirJSON(nombre, contenido);
    escritos.push(nombre);
  }
  if (!escritos.length) throw new Error("El archivo no trae ningún dato conocido.");
  return escritos;
}

export async function mergeCierresManuales(cierres) {
  if (!cierres || typeof cierres !== "object") return await leerCierresManuales();
  const actuales = await leerCierresManuales();
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
  if (cambio) await escribirJSON("cierresManuales.json", actuales);
  return actuales;
}

export async function eliminarCierreManual(fecha, ticker) {
  const tk = String(ticker || "").toUpperCase();
  let cambioManual = false;
  const manuales = await leerCierresManuales();
  if (manuales[fecha]?.[tk] != null) {
    delete manuales[fecha][tk];
    if (!Object.keys(manuales[fecha]).length) delete manuales[fecha];
    await escribirJSON("cierresManuales.json", manuales);
    cambioManual = true;
  }
  let cambioDiario = false;
  const diarios = await leerCierresDiarios();
  if (diarios[fecha]?.[tk] != null) {
    delete diarios[fecha][tk];
    if (!Object.keys(diarios[fecha]).length) delete diarios[fecha];
    await escribirJSON("cierresDiarios.json", diarios);
    cambioDiario = true;
  }
  return cambioManual || cambioDiario;
}

export async function actualizarCierreManual(fecha, ticker, precio) {
  const tk = String(ticker || "").toUpperCase();
  const p = Number(precio);
  if (!fecha || !tk || !Number.isFinite(p) || p <= 0) throw new Error("Datos inválidos");
  await mergeCierresManuales({ [fecha]: { [tk]: p } });
  await mergeCierresDiarios({ [fecha]: { [tk]: p } });
  return { fecha, ticker: tk, precio: p };
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
 * Total del patrimonio visto en vivo por fecha ({ "2026-09-18": { valor, rentaFija } }).
 * Se guarda solo, sin importar el Portafolio: cada vez que la app valúa la
 * cartera con precios en vivo, persiste el total de la sesión (última visita
 * del día gana, así converge al cierre). Junto al total va la renta fija viva,
 * para que los snapshots de días sin Portfolio (ej. un domingo) también tengan
 * desglose y la variación "sin renta fija" se pueda calcular. Pisa el valor
 * reconstruido en snapshots/serie; ante un Portfolio importado de la misma
 * fecha, el Portfolio (dato oficial IEB) tiene prioridad y este no se aplica.
 * Las entradas viejas en formato número se leen como { valor, rentaFija: null }.
 */
export async function leerPatrimonioAuto() {
  return leerJSON("patrimonioAuto.json", {});
}

export async function guardarPatrimonioAuto(fecha, valorTotalARS, rentaFijaARS = null) {
  const actuales = await leerPatrimonioAuto();
  const previo = actuales[fecha];
  const previoValor = typeof previo === "number" ? previo : (previo?.valor ?? 0);
  const previoRF = typeof previo === "number" ? null : (previo?.rentaFija ?? null);
  const rf = rentaFijaARS ?? previoRF ?? null;
  const mismoValor = Math.abs(previoValor - valorTotalARS) < 0.5;
  const mismaRF = (rf == null && previoRF == null) || (rf != null && previoRF != null && Math.abs(rf - previoRF) < 0.5);
  if (mismoValor && mismaRF) return actuales;
  actuales[fecha] = { valor: valorTotalARS, rentaFija: rf };
  await escribirJSON("patrimonioAuto.json", actuales);
  return actuales;
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

export async function agregarMovimientoFondo({ fecha, tipo, monto, nota, destino }) {
  const lista = await leerMovimientosFondos();
  const entrada = {
    id: `fondo-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fecha,
    tipo: tipo === "retiro" ? "retiro" : "ingreso",
    monto: Math.abs(monto),
    nota: nota?.trim() ? nota.trim().slice(0, 120) : null,
    // A qué estrategia va (o de cuál sale): trading | largo | rentaFija.
    // El histórico sin destino se lee como rentaFija (ver destinoDeFondo).
    destino: ["trading", "largo", "rentaFija"].includes(destino) ? destino : null,
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

export async function actualizarMovimientoFondo(id, datos) {
  const lista = await leerMovimientosFondos();
  const idx = lista.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  const actual = lista[idx];
  const actualizado = {
    ...actual,
    fecha: datos.fecha ?? actual.fecha,
    tipo: datos.tipo === "retiro" ? "retiro" : datos.tipo === "ingreso" ? "ingreso" : actual.tipo,
    monto: datos.monto != null && Number.isFinite(Number(datos.monto)) && Number(datos.monto) > 0 ? Math.abs(Number(datos.monto)) : actual.monto,
    nota: datos.nota !== undefined ? (String(datos.nota).trim() ? String(datos.nota).trim().slice(0, 120) : null) : actual.nota,
    destino: ["trading", "largo", "rentaFija"].includes(datos.destino) ? datos.destino : actual.destino,
  };
  lista[idx] = actualizado;
  lista.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("movimientosFondos.json", lista);
  return true;
}

/**
 * Traspasos internos de efectivo entre estrategias (trading/largo/rentaFija):
 * mueven la proporción de caja sin que entre ni salga plata de la cuenta.
 * Cada uno: { id, fecha, desde, hacia, monto (>0), nota }.
 */
export async function leerTraspasosEfectivo() {
  return leerJSON("traspasosEfectivo.json", []);
}

export async function agregarTraspasoEfectivo({ fecha, desde, hacia, monto, nota }) {
  const validos = ["trading", "largo", "rentaFija"];
  if (!validos.includes(desde) || !validos.includes(hacia) || desde === hacia) {
    throw new Error("Traspaso inválido: origen y destino tienen que ser estrategias distintas.");
  }
  const lista = await leerTraspasosEfectivo();
  const entrada = {
    id: `traspaso-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fecha,
    desde,
    hacia,
    monto: Math.abs(monto),
    nota: nota?.trim() ? nota.trim().slice(0, 120) : null,
  };
  lista.push(entrada);
  lista.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("traspasosEfectivo.json", lista);
  return entrada;
}

export async function eliminarTraspasoEfectivo(id) {
  const lista = await leerTraspasosEfectivo();
  const filtrada = lista.filter((t) => t.id !== id);
  if (filtrada.length === lista.length) return false;
  await escribirJSON("traspasosEfectivo.json", filtrada);
  return true;
}

export async function leerProyeccion() {
  return leerJSON("proyeccion.json", {
    rfMensual: 0.015,
    tradingMensual: 0.03,
    largoMensual: 0.02,
    ingresos: [],
    traspasos: [],
  });
}

export async function guardarProyeccion(datos) {
  const actual = await leerProyeccion();
  const merged = { ...actual, ...datos };
  await escribirJSON("proyeccion.json", merged);
  return merged;
}

export async function agregarIngresoProyeccion({ fecha, monto, destino, nota }) {
  const proy = await leerProyeccion();
  const entrada = {
    id: `ing-proy-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fecha,
    monto: Math.abs(monto),
    destino: ["trading", "largo", "rentaFija"].includes(destino) ? destino : "rentaFija",
    nota: nota?.trim() ? nota.trim().slice(0, 120) : null,
  };
  proy.ingresos = [...(proy.ingresos || []), entrada].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("proyeccion.json", proy);
  return entrada;
}

export async function eliminarIngresoProyeccion(id) {
  const proy = await leerProyeccion();
  const filtrada = (proy.ingresos || []).filter((x) => x.id !== id);
  if (filtrada.length === (proy.ingresos || []).length) return false;
  proy.ingresos = filtrada;
  await escribirJSON("proyeccion.json", proy);
  return true;
}

export async function actualizarIngresoProyeccion(id, datos) {
  const proy = await leerProyeccion();
  const idx = (proy.ingresos || []).findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const actual = proy.ingresos[idx];
  proy.ingresos[idx] = {
    ...actual,
    fecha: datos.fecha ?? actual.fecha,
    monto: datos.monto != null && Number.isFinite(Number(datos.monto)) && Number(datos.monto) > 0 ? Math.abs(Number(datos.monto)) : actual.monto,
    destino: ["trading", "largo", "rentaFija"].includes(datos.destino) ? datos.destino : actual.destino,
    nota: datos.nota !== undefined ? (String(datos.nota).trim() ? String(datos.nota).trim().slice(0, 120) : null) : actual.nota,
  };
  proy.ingresos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("proyeccion.json", proy);
  return true;
}

export async function agregarTraspasoProyeccion({ fecha, desde, hacia, monto, nota, esPorcentaje, porcentaje }) {
  const validos = ["trading", "largo", "rentaFija"];
  if (!validos.includes(desde) || !validos.includes(hacia) || desde === hacia) throw new Error("Traspaso inválido");
  const proy = await leerProyeccion();
  const entrada = {
    id: `trasp-proy-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    fecha,
    desde,
    hacia,
    monto: Math.abs(monto) || 0,
    nota: nota?.trim() ? nota.trim().slice(0, 120) : null,
    esPorcentaje: Boolean(esPorcentaje),
    porcentaje: esPorcentaje ? Math.max(0, Math.min(1, Number(porcentaje) || 0)) : 0,
  };
  proy.traspasos = [...(proy.traspasos || []), entrada].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("proyeccion.json", proy);
  return entrada;
}

export async function eliminarTraspasoProyeccion(id) {
  const proy = await leerProyeccion();
  const filtrada = (proy.traspasos || []).filter((x) => x.id !== id);
  if (filtrada.length === (proy.traspasos || []).length) return false;
  proy.traspasos = filtrada;
  await escribirJSON("proyeccion.json", proy);
  return true;
}

export async function actualizarTraspasoProyeccion(id, datos) {
  const proy = await leerProyeccion();
  const idx = (proy.traspasos || []).findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const actual = proy.traspasos[idx];
  const esPorcentaje = datos.esPorcentaje !== undefined ? Boolean(datos.esPorcentaje) : actual.esPorcentaje;
  proy.traspasos[idx] = {
    ...actual,
    fecha: datos.fecha ?? actual.fecha,
    desde: ["trading", "largo", "rentaFija"].includes(datos.desde) ? datos.desde : actual.desde,
    hacia: ["trading", "largo", "rentaFija"].includes(datos.hacia) ? datos.hacia : actual.hacia,
    monto: datos.monto != null && Number.isFinite(Number(datos.monto)) ? Math.abs(Number(datos.monto)) : actual.monto,
    nota: datos.nota !== undefined ? (String(datos.nota).trim() ? String(datos.nota).trim().slice(0, 120) : null) : actual.nota,
    esPorcentaje,
    porcentaje: esPorcentaje ? Math.max(0, Math.min(1, Number(datos.porcentaje) || actual.porcentaje || 0)) : 0,
  };
  if (proy.traspasos[idx].desde === proy.traspasos[idx].hacia) return false;
  proy.traspasos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  await escribirJSON("proyeccion.json", proy);
  return true;
}

/** overrides: { [claveActivo]: { claseActivo?, sector?, precioManual? } } */
export async function guardarClasificacion(claveActivo, datos) {
  const actuales = await leerClasificaciones();
  actuales[claveActivo] = { ...actuales[claveActivo], ...datos };
  await escribirJSON("clasificaciones.json", actuales);
  return actuales;
}

/**
 * Notas por trade (razón y errores) — { [tradeId]: { razon, errores, updatedAt } }
 */
export async function leerNotasTrades() {
  return leerJSON("tradeNotas.json", {});
}

export async function guardarNotaTrade(id, { razon, errores }) {
  if (!id) throw new Error("Falta id del trade");
  const actuales = await leerNotasTrades();
  const r = razon?.trim() ? String(razon).trim().slice(0, 2000) : "";
  const e = errores?.trim() ? String(errores).trim().slice(0, 2000) : "";
  if (!r && !e) {
    delete actuales[id];
  } else {
    actuales[id] = { razon: r || null, errores: e || null, updatedAt: new Date().toISOString() };
  }
  await escribirJSON("tradeNotas.json", actuales);
  return actuales[id] || null;
}
