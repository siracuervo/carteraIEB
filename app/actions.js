"use server";

import { revalidatePath } from "next/cache";
import { guardarClasificacion, mergeTransacciones, agregarAlPortafolioHistorial } from "@/lib/storage";
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

  if (!activo) return { error: "Falta el nombre del activo.", exito: null };
  if (!fecha) return { error: "Falta la fecha.", exito: null };
  if (cantidad == null || cantidad <= 0) return { error: "La cantidad tiene que ser un número positivo.", exito: null };
  if (precio == null || precio <= 0) return { error: "El precio tiene que ser un número positivo.", exito: null };
  if (importe != null && importe <= 0) return { error: "El importe tiene que ser un número positivo.", exito: null };
  if (cclManual != null && cclManual <= 0) return { error: "El dólar CCL tiene que ser un número positivo.", exito: null };

  const esCompra = operacion === "compra";
  const nueva = {
    activo,
    ticker: ticker || null,
    operacion: esCompra ? "COMPRA NORMAL" : "VENTA",
    fecha,
    fechaLiquidacion: fecha,
    hora: hora || null,
    cclManual,
    precio,
    cantidad: esCompra ? Math.abs(cantidad) : -Math.abs(cantidad),
    importeARS: importe ?? null,
    divisa,
    saldoTenencia: null,
    fuente: "manual",
    nroOperacion: `manual-${Date.now()}`,
  };

  await mergeTransacciones([nueva]);
  revalidatePath("/movimientos");
  revalidatePath("/", "layout");
  return { error: null, exito: { activo, operacion: esCompra ? "compra" : "venta" } };
}
