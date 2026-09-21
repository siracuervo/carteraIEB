"use server";

import { revalidatePath } from "next/cache";
import {
  guardarProyeccion,
  agregarIngresoProyeccion,
  eliminarIngresoProyeccion,
  actualizarIngresoProyeccion,
  agregarTraspasoProyeccion,
  eliminarTraspasoProyeccion,
  actualizarTraspasoProyeccion,
} from "@/lib/storage";

export async function guardarProyeccionReturn(datos) {
  const rf = Number(datos.rfMensual);
  const tr = Number(datos.tradingMensual);
  const la = Number(datos.largoMensual);
  const payload = {};
  if (Number.isFinite(rf)) payload.rfMensual = Math.max(0, Math.min(0.5, rf));
  if (Number.isFinite(tr)) payload.tradingMensual = Math.max(0, Math.min(0.5, tr));
  if (Number.isFinite(la)) payload.largoMensual = Math.max(0, Math.min(0.5, la));
  await guardarProyeccion(payload);
  revalidatePath("/proyeccion");
  return payload;
}

export async function agregarIngresoProyeccionAction({ fecha, monto, destino, nota }) {
  const m = Number(String(monto).replace(",", "."));
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(m > 0)) throw new Error("Fecha y monto inválidos");
  if (fecha < "2026-10-01" || fecha > "2027-07-31") throw new Error("Fecha fuera de rango (oct 2026 a jul 2027)");
  const res = await agregarIngresoProyeccion({ fecha, monto: m, destino, nota });
  revalidatePath("/proyeccion");
  return res;
}

export async function eliminarIngresoProyeccionAction(id) {
  await eliminarIngresoProyeccion(id);
  revalidatePath("/proyeccion");
  return { ok: true };
}

export async function agregarTraspasoProyeccionAction({ fecha, desde, hacia, monto, esPorcentaje, porcentaje, nota }) {
  const m = Number(String(monto).replace(",", "."));
  const pct = Number(String(porcentaje).replace(",", "."));
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha inválida");
  if (fecha < "2026-10-01" || fecha > "2027-07-31") throw new Error("Fecha fuera de rango");
  if (esPorcentaje) {
    if (!(pct > 0 && pct <= 1)) throw new Error("Porcentaje inválido");
    const res = await agregarTraspasoProyeccion({ fecha, desde, hacia, monto: 0, nota, esPorcentaje: true, porcentaje: pct });
    revalidatePath("/proyeccion");
    return res;
  }
  if (!(m > 0)) throw new Error("Monto inválido");
  const res = await agregarTraspasoProyeccion({ fecha, desde, hacia, monto: m, nota, esPorcentaje: false, porcentaje: 0 });
  revalidatePath("/proyeccion");
  return res;
}

export async function eliminarTraspasoProyeccionAction(id) {
  await eliminarTraspasoProyeccion(id);
  revalidatePath("/proyeccion");
  return { ok: true };
}

export async function actualizarIngresoProyeccionAction({ id, fecha, monto, destino, nota }) {
  const m = Number(String(monto).replace(",", "."));
  if (!id || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(m > 0)) throw new Error("Datos inválidos");
  if (fecha < "2026-10-01" || fecha > "2027-07-31") throw new Error("Fecha fuera de rango");
  const ok = await actualizarIngresoProyeccion(id, { fecha, monto: m, destino, nota });
  if (!ok) throw new Error("No se encontró el ingreso");
  revalidatePath("/proyeccion");
  return { ok: true };
}

export async function actualizarTraspasoProyeccionAction({ id, fecha, desde, hacia, monto, esPorcentaje, porcentaje, nota }) {
  const m = Number(String(monto).replace(",", "."));
  const pct = Number(String(porcentaje).replace(",", "."));
  if (!id || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Datos inválidos");
  if (fecha < "2026-10-01" || fecha > "2027-07-31") throw new Error("Fecha fuera de rango");
  const payload = { fecha, desde, hacia, monto: esPorcentaje ? 0 : m, nota, esPorcentaje: Boolean(esPorcentaje), porcentaje: esPorcentaje ? pct : 0 };
  if (esPorcentaje && !(pct > 0 && pct <= 1)) throw new Error("Porcentaje inválido");
  if (!esPorcentaje && !(m > 0)) throw new Error("Monto inválido");
  const ok = await actualizarTraspasoProyeccion(id, payload);
  if (!ok) throw new Error("No se encontró el traspaso");
  revalidatePath("/proyeccion");
  return { ok: true };
}
