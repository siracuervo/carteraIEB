import { promises as fs } from "fs";
import path from "path";
import { resolverTickersConPortafolio } from "./calculos.js";

const DATA_DIR = path.join(process.cwd(), "data");
// Dónde viven los JSON:
// - Con R2_* configurado (Cloudflare R2): ahí.
// - En local, archivos en ./data.
const usaR2 = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY
);
const usaRemoto = usaR2;

// Caché en memoria de lecturas remotas con TTL corto (30 s). En Vercel cada
// request re-lee el mismo puñado de JSON desde el store (varias descargas por
// render de la home); con este TTL el segundo request en fila contesta casi sin
// I/O. Se invalida al escribir (escribirJSON) y solo aplica en remoto: en local
// las ediciones de data/*.json se leen siempre directo.
const TTL_LECTURAS_MS = 30 * 1000;
const cacheLecturas = new Map();

function leerCacheado(nombre) {
  const e = cacheLecturas.get(nombre);
  if (e && Date.now() - e.t < TTL_LECTURAS_MS) return e.v;
  return undefined;
}

function guardarCache(nombre, valor) {
  cacheLecturas.set(nombre, { v: valor, t: Date.now() });
}

function invalidarCache(nombre) {
  cacheLecturas.delete(nombre);
}

// Versión de escrituras: se incrementa con cada write (local o remoto). Sirve
// para invalidar cachés derivados (ej. el resultado de obtenerDatosCartera)
// sin acoplamientos circulares: el lector guarda la versión junto al dato y
// la compara en cada acceso.
let versionEscrituras = 0;
export function versionDatos() {
  return versionEscrituras;
}

async function asegurarDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ---------- Cloudflare R2 (API S3-compatible) ----------

let clienteR2 = null;
async function r2() {
  if (!clienteR2) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    clienteR2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return clienteR2;
}

const CLAVES_R2 = (nombre) => [`datos/${nombre}`, `data/${nombre}`, `${nombre}`];

/** Lee `nombre` de R2 (claves fijas, sin listados). null si no existe o falla. */
async function leerR2(nombre) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await r2();
  for (const Key of CLAVES_R2(nombre)) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key }));
      const texto = await res.Body.transformToString();
      try {
        return JSON.parse(texto);
      } catch {
        console.error(`[storage] R2:${Key} corrupto, se prueba la clave siguiente`);
        continue;
      }
    } catch (err) {
      if (err?.name !== "NoSuchKey" && err?.$metadata?.httpStatusCode !== 404) throw err;
    }
  }
  return null;
}

async function escribirR2(nombre, valor) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await r2();
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: `datos/${nombre}`,
      Body: JSON.stringify(valor, null, 2),
      ContentType: "application/json",
    })
  );
}

async function leerJSON(nombre, porDefecto) {
  // En remoto, lecturas recientes (TTL 30 s) se sirven de memoria.
  if (usaRemoto) {
    const cacheado = leerCacheado(nombre);
    if (cacheado !== undefined) return cacheado;
  }
  let resultado;
  if (!usaRemoto) {
    try {
      const contenido = await fs.readFile(path.join(DATA_DIR, nombre), "utf-8");
      try {
        resultado = JSON.parse(contenido);
      } catch {
        console.error(`[storage] ${nombre} corrupto, se usa valor por defecto`);
        return porDefecto;
      }
    } catch (err) {
      if (err.code === "ENOENT") return porDefecto;
      throw err;
    }
  } else {
    try {
      resultado = await leerR2(nombre);
      if (resultado == null) return porDefecto;
    } catch (err) {
      console.error(`[storage] Falló lectura R2 de ${nombre}:`, err.message);
      return porDefecto;
    }
  }
  // No se cachea el valor por defecto ante errores: el próximo request reintenta.
  if (usaRemoto) guardarCache(nombre, resultado);
  return resultado;
}

async function escribirJSON(nombre, valor) {
  // Un write invalida siempre: la próxima lectura vuelve a bajar del store...
  if (usaRemoto) invalidarCache(nombre);
  // ...y los cachés derivados (datos de cartera) se enteran por versión.
  versionEscrituras += 1;
  if (!usaRemoto) {
    try {
      await asegurarDataDir();
      await fs.writeFile(path.join(DATA_DIR, nombre), JSON.stringify(valor, null, 2), "utf-8");
    } catch (err) {
      if (process.env.VERCEL) {
        throw new Error(
          "En Vercel hay que configurar el store remoto (vars R2_* de Cloudflare R2); después redeployá."
        );
      }
      throw err;
    }
    return;
  }
  await escribirR2(nombre, valor);
}

/**
 * Throttle de escrituras AUTOMÁTICAS (captura de vivos en cada render): como
 * mucho 1 persistencia cada 3 minutos por archivo. Devuelve el mergeado en
 * memoria igual (el render usa valores frescos), solo difiere el guardado.
 * Las vías manuales/cron/import usan `forzar: true` y persisten siempre.
 */
const ultimoWriteAuto = new Map();
const MIN_INTERVALO_AUTO_MS = 180 * 1000;

function puedeEscribirAuto(nombre) {
  const ahora = Date.now();
  if (ahora - (ultimoWriteAuto.get(nombre) ?? 0) < MIN_INTERVALO_AUTO_MS) return false;
  ultimoWriteAuto.set(nombre, ahora);
  return true;
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
export async function mergeTransacciones(nuevas, { importId = null } = {}) {
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
      // Solo las filas realmente NUEVAS llevan el sello del lote: así la
      // importación se puede deshacer sin tocar lo que ya existía (las
      // "actualizadas" no se borran nunca).
      porClave.set(clave, importId ? { ...t, importId } : t);
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

/** Elimina una operación por su clave de dedup (las manuales tienen clave
 * única `manual-<ts>`). Devuelve true si borró algo. */
export async function eliminarTransaccion(clave) {
  if (!clave) return false;
  const transacciones = await leerTransacciones();
  const resto = transacciones.filter((t) => claveTransaccion(t) !== clave);
  if (resto.length === transacciones.length) return false;
  await escribirJSON("transacciones.json", resto);
  return true;
}

/**
 * Registro de lotes importados (para poder deshacer una importación del día
 * recién cargada). Cada entrada: { id, tipo, archivos, agregadas,
 * actualizadas, dias, creadoEl }. Solo las filas selladas con el importId se
 * borran al deshacer; las preexistentes ("actualizadas") no se tocan.
 */
export async function leerImportaciones() {
  return leerJSON("importaciones.json", []);
}

export async function registrarImportacion(entrada) {
  const lista = await leerImportaciones();
  lista.push({ ...entrada, creadoEl: new Date().toISOString() });
  await escribirJSON("importaciones.json", lista.slice(-50));
  return entrada;
}

export async function eliminarImportacion(id) {
  if (!id) return { eliminadas: 0 };
  const transacciones = await leerTransacciones();
  const resto = transacciones.filter((t) => t.importId !== id);
  const eliminadas = transacciones.length - resto.length;
  if (!eliminadas) return { eliminadas: 0 };
  await escribirJSON("transacciones.json", resto);
  const lista = await leerImportaciones();
  await escribirJSON("importaciones.json", lista.filter((e) => e.id !== id));
  return { eliminadas };
}

export async function leerCierresDiarios() {
  return leerJSON("cierresDiarios.json", {});
}

export async function mergeCierresDiarios(cierres, { forzar = false } = {}) {
  if (!cierres || typeof cierres !== "object") return await leerCierresDiarios().catch(() => ({}));
  try {
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
    // Vía automática (captura de vivos en cada render): throttled — el render
    // usa igual el objeto mergeado en memoria. Vía manual/cron/import: forzar.
    if (cambio && (forzar || puedeEscribirAuto("cierresDiarios.json"))) {
      await escribirJSON("cierresDiarios.json", actuales);
    }
    return actuales;
  } catch (err) {
    console.error("[storage] mergeCierresDiarios:", err.message);
    return await leerCierresDiarios().catch(() => ({}));
  }
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
  "importaciones.json",
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
  "importaciones.json": [],
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
  if (!cierres || typeof cierres !== "object") return await leerCierresManuales().catch(() => ({}));
  try {
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
  } catch (err) {
    console.error("[storage] mergeCierresManuales:", err.message);
    return await leerCierresManuales().catch(() => ({}));
  }
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
  await mergeCierresDiarios({ [fecha]: { [tk]: p } }, { forzar: true });
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

/**
 * Elimina el punto auto-guardado de una fecha (reparación): el snapshot vuelve
 * a calcularse desde los cierres/imports. Para cuando un auto-guardado pisó un
 * cierre real con un valor vivo (ej. la mañana siguiente superpuesta).
 * Devuelve true si existía y se borró.
 */
export async function eliminarPuntoAuto(fecha) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const actuales = await leerPatrimonioAuto();
  if (actuales[fecha] == null) return false;
  delete actuales[fecha];
  await escribirJSON("patrimonioAuto.json", actuales);
  return true;
}

export async function guardarPatrimonioAuto(fecha, valorTotalARS, rentaFijaARS = null) {
  try {
    const actuales = await leerPatrimonioAuto();
    const previo = actuales[fecha];
    const previoValor = typeof previo === "number" ? previo : (previo?.valor ?? 0);
    const previoRF = typeof previo === "number" ? null : (previo?.rentaFija ?? null);
    const rf = rentaFijaARS ?? previoRF ?? null;
    const mismoValor = Math.abs(previoValor - valorTotalARS) < 0.5;
    const mismaRF = (rf == null && previoRF == null) || (rf != null && previoRF != null && Math.abs(rf - previoRF) < 0.5);
    if (mismoValor && mismaRF) return actuales;
    // Único llamador es la valuación automática de cada render: throttled para
    // no quemar operaciones de Blob con cada tick del precio vivo.
    if (!puedeEscribirAuto("patrimonioAuto.json")) {
      actuales[fecha] = { valor: valorTotalARS, rentaFija: rf };
      return actuales;
    }
    actuales[fecha] = { valor: valorTotalARS, rentaFija: rf };
    await escribirJSON("patrimonioAuto.json", actuales);
    return actuales;
  } catch (err) {
    console.error("[storage] guardarPatrimonioAuto:", err.message);
    return {};
  }
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
