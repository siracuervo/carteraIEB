"use server";

import { revalidatePath } from "next/cache";
import { guardarClasificacion, mergeTransacciones, agregarAlPortafolioHistorial, mergeCierresDiarios, actualizarTransaccion, claveTransaccion, agregarMovimientoFondo as guardarMovimientoFondo, eliminarMovimientoFondo, actualizarMovimientoFondo, agregarTraspasoEfectivo as guardarTraspaso, eliminarTraspasoEfectivo, guardarNotaTrade as persistirNotaTrade } from "@/lib/storage";
import { clasificar, CLASES } from "@/lib/clasificacion";
import { parseArchivoIEB } from "@/lib/parseIEB";
import { parsePortafolio } from "@/lib/parsePortafolio";

export async function actualizarClasificacion(formData) {
  const clave = formData.get("clave");
  if (!clave) return;

  const claseActivo = formData.get("claseActivo");
  const sector = formData.get("sector");
  const nombre = formData.get("nombre");
  const precioManualTexto = formData.get("precioManual");
  const pppManualTexto = formData.get("pppManual");

  const datos = {};
  if (claseActivo) datos.claseActivo = claseActivo;
  if (sector) datos.sector = sector;
  if (nombre) datos.nombre = nombre.trim();
  if (precioManualTexto) {
    const precio = Number(String(precioManualTexto).replace(",", "."));
    if (Number.isFinite(precio) && precio > 0) datos.precioManual = precio;
  }
  if (pppManualTexto) {
    const ppp = Number(String(pppManualTexto).replace(",", "."));
    if (Number.isFinite(ppp) && ppp > 0) datos.pppManual = ppp;
  }

  await guardarClasificacion(clave, datos);
  revalidatePath("/", "layout");
}

export async function importarPortafolio(prevState, formData) {
  const archivos = formData.getAll("archivos").filter((f) => f && typeof f === "object" && f.size > 0);
  if (!archivos.length) {
    return { error: "Seleccioná al menos un archivo de Portafolio (.xlsx).", exito: null };
  }

  let importados = 0;
  let ultimoPatrimonio = null;
  const errores = [];

  for (const archivo of archivos) {
    try {
      const buffer = Buffer.from(await archivo.arrayBuffer());
      const portafolio = await parsePortafolio(buffer);
      if (!portafolio.fecha || portafolio.patrimonioTotal == null) {
        throw new Error("no se reconoce como un export de Portafolio de IEB");
      }
      await agregarAlPortafolioHistorial(portafolio);
      // Los precios del snapshot también alimentan los cierres diarios: así los
      // tickers sin API (ej. TMF27) quedan guardados para valuar días pasados.
      const preciosSnapshot = {};
      for (const t of portafolio.tenencias || []) {
        if (t.ticker && t.precio != null) preciosSnapshot[t.ticker] = t.precio;
      }
      if (Object.keys(preciosSnapshot).length) {
        await mergeCierresDiarios({ [portafolio.fecha]: preciosSnapshot }, { forzar: true });
      }
      importados++;
      ultimoPatrimonio = portafolio.patrimonioTotal;
    } catch (err) {
      errores.push(`${archivo.name}: ${err.message}`);
    }
  }

  if (!importados) {
    return { error: errores.join(" · "), exito: null };
  }

  revalidatePath("/", "layout");
  return {
    error: errores.length ? errores.join(" · ") : null,
    exito: { importados, ultimoPatrimonio },
  };
}

export async function importarMovimientos(prevState, formData) {
  const archivos = formData.getAll("archivos").filter((f) => f && typeof f === "object" && f.size > 0);
  if (!archivos.length) {
    return { error: "Seleccioná al menos un archivo exportado de IEB (.xlsx).", exito: null };
  }

  let agregadasTotal = 0;
  let actualizadasTotal = 0;
  const errores = [];

  for (const archivo of archivos) {
    try {
      const buffer = Buffer.from(await archivo.arrayBuffer());
      const { transacciones } = await parseArchivoIEB(buffer);
      const { agregadas, actualizadas } = await mergeTransacciones(transacciones);
      agregadasTotal += agregadas;
      actualizadasTotal += actualizadas;
    } catch (err) {
      errores.push(`${archivo.name}: ${err.message}`);
    }
  }

  if (errores.length && agregadasTotal === 0 && actualizadasTotal === 0) {
    return { error: errores.join(" · "), exito: null };
  }

  revalidatePath("/", "layout");
  return {
    error: errores.length ? errores.join(" · ") : null,
    exito: { agregadas: agregadasTotal, actualizadas: actualizadasTotal },
  };
}

/**
 * Importa el export diario "Operaciones del día" (compras y ventas del día) como
 * movimientos de Compras y ventas. Va por separado del import de Portafolio: el
 * Portafolio actualiza las posiciones, este solo agrega operaciones al historial.
 */
export async function importarOperacionesDelDia(prevState, formData) {
  const archivos = formData.getAll("archivos").filter((f) => f && typeof f === "object" && f.size > 0);
  if (!archivos.length) {
    return { error: "Seleccioná al menos un archivo de 'Operaciones del día' (.xlsx).", exito: null };
  }

  const importId = `imp-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;
  let agregadasTotal = 0;
  let actualizadasTotal = 0;
  const errores = [];
  const dias = new Set();

  for (const archivo of archivos) {
    try {
      const buffer = Buffer.from(await archivo.arrayBuffer());
      const { formato, transacciones } = await parseArchivoIEB(buffer);
      if (formato !== "operaciones-del-dia") {
        throw new Error("no es un export de 'Operaciones del día' (usá la otra sección para otros formatos)");
      }
      if (!transacciones?.length) {
        throw new Error("el archivo no trae operaciones de compra/venta");
      }
      for (const t of transacciones) if (t?.fecha) dias.add(t.fecha);
      const { agregadas, actualizadas } = await mergeTransacciones(transacciones, { importId });
      agregadasTotal += agregadas;
      actualizadasTotal += actualizadas;
    } catch (err) {
      errores.push(`${archivo.name}: ${err.message}`);
    }
  }

  if (errores.length && agregadasTotal === 0 && actualizadasTotal === 0) {
    return { error: errores.join(" · "), exito: null };
  }

  if (agregadasTotal > 0 || actualizadasTotal > 0) {
    const { registrarImportacion } = await import("@/lib/storage");
    await registrarImportacion({
      id: importId,
      tipo: "operaciones-del-dia",
      archivos: archivos.map((a) => a.name),
      agregadas: agregadasTotal,
      actualizadas: actualizadasTotal,
      dias: [...dias].sort(),
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  return {
    error: errores.length ? errores.join(" · ") : null,
    exito: { agregadas: agregadasTotal, actualizadas: actualizadasTotal, importId },
  };
}

/**
 * Deshace una importación del día: elimina las operaciones que ese lote agregó
 * como nuevas. Las que ya existían (solo se completaron datos) no se tocan.
 */
export async function eliminarImportacion(importId) {
  if (!importId || typeof importId !== "string") return;
  const { eliminarImportacion: eliminar } = await import("@/lib/storage");
  await eliminar(importId);
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
}

/**
 * Carga manual de un precio de cierre (ticker + fecha + precio) para tickers
 * sin API (ej. TMF27): queda guardado en los cierres diarios y se usa para
 * valuar días pasados. Pisar un valor existente lo reemplaza.
 */
export async function guardarCierreManual(prevState, formData) {
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const fecha = String(formData.get("fecha") || "");
  const precio = Number(String(formData.get("precio") || "").replace(",", "."));
  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(precio) || precio <= 0) {
    return { error: "Completá ticker, fecha y un precio válido.", exito: null };
  }
  await mergeCierresDiarios({ [fecha]: { [ticker]: precio } }, { forzar: true });
  const { mergeCierresManuales } = await import("@/lib/storage");
  await mergeCierresManuales({ [fecha]: { [ticker]: precio } });
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  return { error: null, exito: { ticker, fecha, precio } };
}

export async function eliminarCierreManualAction(prevState, formData) {
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const fecha = String(formData.get("fecha") || "");
  if (!ticker || !fecha) return { error: "Faltan datos.", exito: null };
  const { eliminarCierreManual } = await import("@/lib/storage");
  const ok = await eliminarCierreManual(fecha, ticker);
  if (!ok) return { error: "No se encontró el cierre.", exito: null };
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  return { error: null, exito: { ticker, fecha } };
}

export async function actualizarCierreManualAction(prevState, formData) {
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const fecha = String(formData.get("fecha") || "");
  const precio = Number(String(formData.get("precio") || "").replace(",", "."));
  if (!ticker || !fecha || !Number.isFinite(precio) || precio <= 0) {
    return { error: "Precio inválido.", exito: null };
  }
  const { actualizarCierreManual } = await import("@/lib/storage");
  try {
    await actualizarCierreManual(fecha, ticker, precio);
  } catch (e) {
    return { error: e.message, exito: null };
  }
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  return { error: null, exito: { ticker, fecha, precio } };
}

/**
 * Repara un punto del gráfico pisado por un auto-guardado: elimina el punto
 * auto-guardado de esa fecha para que el snapshot se reconstruya desde los
 * cierres/imports (ej. el 22/9 superpuesto con el valor de la mañana siguiente).
 */
export async function repararPuntoAuto(prevState, formData) {
  const fecha = String(formData.get("fecha") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { error: "Elegí una fecha válida.", exito: null };
  }
  const { eliminarPuntoAuto } = await import("@/lib/storage");
  const ok = await eliminarPuntoAuto(fecha);
  if (!ok) return { error: "Esa fecha no tiene punto auto-guardado para reparar.", exito: null };
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  return { error: null, exito: { fecha } };
}

function aNumero(texto) {
  const limpio = String(texto || "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export async function agregarOperacionManual(prevState, formData) {
  const activo = String(formData.get("activo") || "").trim();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const operacion = formData.get("operacion"); // "compra" | "venta"
  const fecha = String(formData.get("fecha") || "").trim();
  const hora = String(formData.get("hora") || "").trim();
  const divisa = formData.get("divisa") === "USD" ? "USD" : "ARS";

  const cantidad = aNumero(formData.get("cantidad"));
  const precio = aNumero(formData.get("precio"));
  const importe = aNumero(formData.get("importe"));
  const cclManual = aNumero(formData.get("ccl"));
  const precioUSD = aNumero(formData.get("precioUSD"));
  // Estrategia del lote (trading/largo plazo/renta fija; los bonos van a
  // renta fija aunque se elija otra).
  const sleeveCrudo = String(formData.get("sleeve") || "").trim();
  // Caución: colocación o vencimiento de plazo fijo bursátil (sin precio ni
  // cantidad — solo monto, tasa y plazo).
  const esCaucionManual = ticker === "CAUCION" || /caucion/i.test(activo);
  const tipoCaucion = formData.get("tipoCaucion") === "vencimiento" ? "vencimiento" : "colocacion";
  const monto = aNumero(formData.get("monto"));
  const tasa = aNumero(formData.get("tasa"));
  const plazoDias = aNumero(formData.get("plazoDias"));

  if (!activo) return { error: "Falta el nombre del activo.", exito: null };
  if (!fecha) return { error: "Falta la fecha.", exito: null };

  if (esCaucionManual) {
    if (monto == null || monto <= 0) return { error: "El monto tiene que ser un número positivo.", exito: null };
    if (tasa != null && tasa <= 0) return { error: "La tasa tiene que ser un número positivo.", exito: null };
    if (plazoDias != null && (!Number.isInteger(plazoDias) || plazoDias <= 0)) {
      return { error: "El plazo tiene que ser un número entero de días.", exito: null };
    }
    const esColocacion = tipoCaucion !== "vencimiento";
    const sleeve = ["trading", "largo", "rentaFija"].includes(sleeveCrudo) ? sleeveCrudo : "trading";
    const nueva = {
      activo: activo || "Caución",
      ticker: "CAUCION",
      operacion: esColocacion ? "CAUCION COLOCACION" : "CAUCION VENCIMIENTO",
      fecha,
      fechaLiquidacion: fecha,
      hora: hora || null,
      precio: null,
      cantidad: null,
      // Colocación sale de caja (negativo), vencimiento entra (positivo, con interés).
      importeARS: esColocacion ? -Math.abs(monto) : Math.abs(monto),
      divisa: "ARS",
      sleeve,
      tasa: tasa ?? null,
      plazoDias: plazoDias ?? null,
      saldoTenencia: null,
      fuente: "manual",
      nroOperacion: `manual-${Date.now()}`,
    };
    await mergeTransacciones([nueva]);
    revalidatePath("/movimientos");
    revalidatePath("/", "layout");
    return { error: null, exito: { activo: nueva.activo, operacion: esColocacion ? "colocacion" : "vencimiento" } };
  }

  if (cantidad == null || cantidad <= 0) return { error: "La cantidad tiene que ser un número positivo.", exito: null };
  if (precio == null || precio <= 0) return { error: "El precio tiene que ser un número positivo.", exito: null };
  if (importe != null && importe <= 0) return { error: "El importe tiene que ser un número positivo.", exito: null };
  if (cclManual != null && cclManual <= 0) return { error: "El dólar CCL tiene que ser un número positivo.", exito: null };
  if (precioUSD != null && precioUSD <= 0) return { error: "El precio en dólares tiene que ser un número positivo.", exito: null };

  const esCompra = operacion === "compra";
  let sleeve = ["trading", "largo", "rentaFija"].includes(sleeveCrudo) ? sleeveCrudo : null;
  if (!sleeve) return { error: "Elegí la estrategia: trading, largo plazo o renta fija (los bonos van a renta fija).", exito: null };
  // Los bonos siempre van a renta fija, sin importar lo elegido.
  const clase = clasificar({ activo, ticker: ticker || null, operacion: esCompra ? "COMPRA NORMAL" : "VENTA" }).claseActivo;
  if (clase === CLASES.BONO_SOBERANO) sleeve = "rentaFija";
  const nueva = {
    activo,
    ticker: ticker || null,
    operacion: esCompra ? "COMPRA NORMAL" : "VENTA",
    fecha,
    fechaLiquidacion: fecha,
    hora: hora || null,
    cclManual,
    precioUSD,
    precio,
    cantidad: esCompra ? Math.abs(cantidad) : -Math.abs(cantidad),
    // Signo igual que cantidad: negativo en compras, positivo en ventas.
    importeARS: importe != null ? (esCompra ? -Math.abs(importe) : Math.abs(importe)) : null,
    divisa,
    sleeve,
    saldoTenencia: null,
    fuente: "manual",
    nroOperacion: `manual-${Date.now()}`,
  };

  await mergeTransacciones([nueva]);
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { activo, operacion: esCompra ? "compra" : "venta" } };
}

/**
 * Edita una operación ya guardada (importada o cargada a mano): fecha, cantidad,
 * precio, importe ARS, divisa y/o el CCL del día. Busca la transacción original
 * por su clave de dedup (que no cambia con la edición) y actualiza esos campos,
 * dejando intacto el resto.
 */
export async function editarOperacion(prevState, formData) {
  const clave = String(formData.get("clave") || "").trim();
  const activo = String(formData.get("activo") || "").trim();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const operacion = formData.get("operacion"); // "compra" | "venta"
  const fecha = String(formData.get("fecha") || "").trim();
  const divisa = formData.get("divisa") === "USD" ? "USD" : "ARS";

  const cantidad = aNumero(formData.get("cantidad"));
  const precio = aNumero(formData.get("precio"));
  const importe = aNumero(formData.get("importe"));
  const cclManual = aNumero(formData.get("ccl"));
  const precioUSD = aNumero(formData.get("precioUSD"));
  const hora = String(formData.get("hora") || "").trim();
  const sleeveCrudo = String(formData.get("sleeve") || "").trim();

  if (!clave) return { error: "No se pudo identificar la operación a editar.", exito: null };
  if (!activo) return { error: "Falta el nombre del activo.", exito: null };
  if (!fecha) return { error: "Falta la fecha.", exito: null };

  // Edición de caución: monto, tasa, plazo y estrategia (sin precio/cantidad).
  if (ticker === "CAUCION" || /caucion/i.test(activo)) {
    const monto = aNumero(formData.get("monto"));
    const tasa = aNumero(formData.get("tasa"));
    const plazoDias = aNumero(formData.get("plazoDias"));
    const tipoCaucion = formData.get("tipoCaucion") === "vencimiento" ? "vencimiento" : "colocacion";
    const sleeveCaucion = ["trading", "largo", "rentaFija"].includes(sleeveCrudo) ? sleeveCrudo : "trading";
    if (monto == null || monto <= 0) return { error: "El monto tiene que ser un número positivo.", exito: null };
    if (tasa != null && tasa <= 0) return { error: "La tasa tiene que ser un número positivo.", exito: null };
    if (plazoDias != null && (!Number.isInteger(plazoDias) || plazoDias <= 0)) {
      return { error: "El plazo tiene que ser un número entero de días.", exito: null };
    }
    const esColocacion = tipoCaucion !== "vencimiento";
    const okCaucion = await actualizarTransaccion(clave, {
      activo: activo || "Caución",
      ticker: "CAUCION",
      operacion: esColocacion ? "CAUCION COLOCACION" : "CAUCION VENCIMIENTO",
      fecha,
      hora: hora || null,
      precio: null,
      cantidad: null,
      importeARS: esColocacion ? -Math.abs(monto) : Math.abs(monto),
      divisa: "ARS",
      sleeve: sleeveCaucion,
      tasa: tasa ?? null,
      plazoDias: plazoDias ?? null,
    });
    if (!okCaucion) {
      return { error: "No se encontró la operación guardada — ¿cambió la fecha o los datos del activo?", exito: null };
    }
    revalidatePath("/movimientos");
    revalidatePath("/", "layout");
    return { error: null, exito: { activo, operacion: esColocacion ? "colocacion" : "vencimiento" } };
  }

  if (cantidad == null || cantidad <= 0) return { error: "La cantidad tiene que ser un número positivo.", exito: null };
  if (precio == null || precio <= 0) return { error: "El precio tiene que ser un número positivo.", exito: null };
  if (importe != null && importe <= 0) return { error: "El importe tiene que ser un número positivo.", exito: null };
  if (cclManual != null && cclManual <= 0) return { error: "El dólar CCL tiene que ser un número positivo.", exito: null };
  if (precioUSD != null && precioUSD <= 0) return { error: "El precio en dólares tiene que ser un número positivo.", exito: null };

  const esCompra = operacion === "compra";
  const sleeve = ["trading", "largo", "rentaFija"].includes(sleeveCrudo) ? sleeveCrudo : null;
  const datos = {
    activo,
    ticker: ticker || null,
    operacion: esCompra ? "COMPRA NORMAL" : "VENTA",
    fecha,
    hora: hora || null,
    cantidad: esCompra ? Math.abs(cantidad) : -Math.abs(cantidad),
    precio,
    // El importe sigue la misma convención de signo que cantidad y que los
    // exports de IEB: negativo en compras (sale de caja), positivo en ventas.
    importeARS: importe != null ? (esCompra ? -Math.abs(importe) : Math.abs(importe)) : null,
    divisa,
    cclManual,
    precioUSD,
    ...(sleeve ? { sleeve } : {}),
  };

  const ok = await actualizarTransaccion(clave, datos);
  if (!ok) {
    return { error: "No se encontró la operación guardada — ¿cambió la fecha o los datos del activo?", exito: null };
  }

  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { activo, operacion: esCompra ? "compra" : "venta" } };
}

/**
 * Carga un movimiento de fondos (dinero que entra/sale por fuera del mercado).
 * Entra a caja de inmediato: un ingreso sube el efectivo y el total ese mismo
 * día, y una compra posterior lo descuenta por su propio ticket (sin duplicar).
 */
export async function agregarMovimientoFondo(prevState, formData) {
  const fecha = String(formData.get("fecha") || "").trim();
  const tipo = formData.get("tipo") === "retiro" ? "retiro" : "ingreso";
  const monto = aNumero(formData.get("monto"));
  const nota = String(formData.get("nota") || "").trim();
  const destino = String(formData.get("destino") || "").trim();

  if (!fecha) return { error: "Falta la fecha.", exito: null };
  if (monto == null || monto <= 0) return { error: "El monto tiene que ser un número positivo.", exito: null };
  if (!["trading", "largo", "rentaFija"].includes(destino)) {
    return { error: "Elegí a qué estrategia va (o de cuál sale): trading, largo plazo o renta fija.", exito: null };
  }

  const entrada = await guardarMovimientoFondo({ fecha, tipo, monto, nota, destino });
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { tipo, monto: entrada.monto, fecha } };
}

export async function quitarMovimientoFondo(id) {
  if (!id) return { error: "Falta el movimiento.", exito: null };
  const ok = await eliminarMovimientoFondo(String(id));
  if (!ok) return { error: "No se encontró el movimiento.", exito: null };
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { eliminado: true } };
}

export async function editarMovimientoFondo(prevState, formData) {
  const id = String(formData.get("id") || "").trim();
  const fecha = String(formData.get("fecha") || "").trim();
  const tipo = formData.get("tipo") === "retiro" ? "retiro" : "ingreso";
  const monto = aNumero(formData.get("monto"));
  const nota = String(formData.get("nota") || "").trim();
  const destino = String(formData.get("destino") || "").trim();
  if (!id) return { error: "Falta el movimiento a editar.", exito: null };
  if (!fecha) return { error: "Falta la fecha.", exito: null };
  if (monto == null || monto <= 0) return { error: "El monto tiene que ser un número positivo.", exito: null };
  if (!["trading", "largo", "rentaFija"].includes(destino)) {
    return { error: "Elegí a qué estrategia va (o de cuál sale).", exito: null };
  }
  const ok = await actualizarMovimientoFondo(id, { fecha, tipo, monto, nota, destino });
  if (!ok) return { error: "No se encontró el movimiento.", exito: null };
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { id, fecha, tipo, monto } };
}

/**
 * Traspaso interno de efectivo entre estrategias: cambia la proporción de
 * caja sin que entre ni salga plata de la cuenta.
 */
export async function agregarTraspasoEfectivo(prevState, formData) {
  const fecha = String(formData.get("fecha") || "").trim();
  const desde = String(formData.get("desde") || "").trim();
  const hacia = String(formData.get("hacia") || "").trim();
  const monto = aNumero(formData.get("monto"));
  const nota = String(formData.get("nota") || "").trim();

  if (!fecha) return { error: "Falta la fecha.", exito: null };
  if (monto == null || monto <= 0) return { error: "El monto tiene que ser un número positivo.", exito: null };
  if (!["trading", "largo", "rentaFija"].includes(desde) || !["trading", "largo", "rentaFija"].includes(hacia) || desde === hacia) {
    return { error: "Elegí origen y destino distintos.", exito: null };
  }

  try {
    await guardarTraspaso({ fecha, desde, hacia, monto, nota });
  } catch (err) {
    return { error: err.message, exito: null };
  }
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { desde, hacia, monto } };
}

/**
 * Restaura el respaldo completo de la carpeta data desde un JSON exportado
 * (el que descarga /api/respaldo). Pisa los datos actuales con los del
 * archivo — en Vercel esto sube todos los JSON necesarios al Blob sin
 * importarlos uno por uno.
 */
export async function importarRespaldo(prevState, formData) {
  const archivos = formData.getAll("archivos").filter((f) => f && typeof f === "object" && f.size > 0);
  if (!archivos.length) {
    return { error: "Seleccioná el archivo de respaldo (.json).", exito: null };
  }
  if (archivos.length > 1) {
    return { error: "Subí un solo archivo de respaldo por vez.", exito: null };
  }
  const archivo = archivos[0];
  if (archivo.size > 20 * 1024 * 1024) {
    return { error: "El archivo es demasiado grande (máximo 20 MB).", exito: null };
  }
  let objeto;
  try {
    objeto = JSON.parse(await archivo.text());
  } catch {
    return { error: "El archivo no es un JSON válido.", exito: null };
  }
  const { restaurarTodosLosDatos } = await import("@/lib/storage");
  let escritos;
  try {
    escritos = await restaurarTodosLosDatos(objeto);
  } catch (err) {
    return { error: err.message, exito: null };
  }
  revalidatePath("/", "layout");
  revalidatePath("/movimientos");
  revalidatePath("/trades");
  return { error: null, exito: { escritos } };
}

export async function quitarTraspasoEfectivo(id) {
  if (!id) return { error: "Falta el traspaso.", exito: null };
  const ok = await eliminarTraspasoEfectivo(String(id));
  if (!ok) return { error: "No se encontró el traspaso.", exito: null };
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { eliminado: true } };
}

/** Elimina una operación (manual o importada) por su clave. */
export async function quitarTransaccion(clave) {
  if (!clave) return { error: "Falta la operación.", exito: null };
  const { eliminarTransaccion } = await import("@/lib/storage");
  const ok = await eliminarTransaccion(String(clave));
  if (!ok) return { error: "No se encontró la operación.", exito: null };
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  revalidatePath("/trades");
  return { error: null, exito: { eliminado: true } };
}

export async function guardarNotaTrade(prevState, formData) {
  const id = String(formData.get("id") || "").trim();
  const razon = String(formData.get("razon") || "");
  const errores = String(formData.get("errores") || "");
  if (!id) return { error: "Falta el trade.", exito: null };
  try {
    await persistirNotaTrade(id, { razon, errores });
  } catch (err) {
    return { error: err.message, exito: null };
  }
  revalidatePath("/trades");
  return { error: null, exito: { id } };
}
