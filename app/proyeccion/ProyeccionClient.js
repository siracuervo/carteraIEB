"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  guardarProyeccionReturn,
  agregarIngresoProyeccionAction,
  eliminarIngresoProyeccionAction,
  actualizarIngresoProyeccionAction,
  agregarTraspasoProyeccionAction,
  eliminarTraspasoProyeccionAction,
  actualizarTraspasoProyeccionAction,
} from "./actions";
import { fechaLocal } from "@/lib/fechas";
import { aISO } from "@/lib/accesosRapidosFecha";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric" });
const formatoFechaLarga = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const FIN_PROYECCION = "2027-07-01";
const FIN_VENTANA = "2027-07-31";

function isoPrimerDiaMes(iso) {
  return iso.slice(0, 7) + "-01";
}

function generarMeses(desdeISO, hastaISO) {
  const lista = [];
  let [y, m] = desdeISO.split("-").map(Number);
  const [ey, em] = hastaISO.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    lista.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return lista;
}

// La tabla arranca en el mes en curso y llega hasta julio 2027. Se calcula
// en cada visita (no a nivel módulo) para que los meses pasados se caigan
// solos aunque el servidor lleve días corriendo.
function mesesProyeccion() {
  const lista = generarMeses(isoPrimerDiaMes(aISO(new Date())), FIN_PROYECCION);
  return lista.length ? lista : [FIN_PROYECCION];
}

// La proyección arranca hoy (el mes en curso se prorratea por días restantes).
function inicioProyeccion() {
  const hoy = aISO(new Date());
  return hoy <= FIN_VENTANA ? hoy : FIN_PROYECCION;
}

function mesKey(fecha) {
  return fecha.slice(0, 7);
}
function diasEnMes(fechaISO) {
  const [y, m] = fechaISO.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function esDiaHabil(y, m, d) {
  const dia = new Date(y, m - 1, d).getDay();
  return dia >= 1 && dia <= 5;
}

function habilesEnMes(mesISO) {
  const [y, m] = mesISO.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dim; d++) if (esDiaHabil(y, m, d)) n++;
  return n;
}

function habilesEntre(mesISO, desdeDia, hastaDia) {
  const [y, m] = mesISO.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = Math.max(1, desdeDia); d <= Math.min(hastaDia, dim); d++) {
    if (esDiaHabil(y, m, d)) n++;
  }
  return n;
}

/** Proporción del mes que rinde desde el día de inicio (1 = mes completo). */
function factorMesSleeve({ mesISO, diaInicioMes, soloHabiles }) {
  const dim = diasEnMes(mesISO);
  const desde = Math.min(Math.max(diaInicioMes ?? 1, 1), dim);
  if (soloHabiles) {
    const tot = habilesEnMes(mesISO);
    return tot > 0 ? habilesEntre(mesISO, desde, dim) / tot : 0;
  }
  return dim > 0 ? (dim - desde + 1) / dim : 0;
}

function simularSleeveConEventos({ inicio, mensual, ingresos, traspasosDesde, traspasosHacia, mesISO, diaInicioMes, soloHabiles }) {
  const dim = diasEnMes(mesISO);
  const eventos = [];
  for (const ing of ingresos || []) eventos.push({ fecha: ing.fecha, tipo: "ingreso", monto: ing.monto, raw: ing });
  for (const tr of traspasosDesde || []) {
    let monto = tr.monto ?? 0;
    if (tr.esPorcentaje && tr.porcentaje > 0) monto = inicio * mensual * tr.porcentaje;
    eventos.push({ fecha: tr.fecha, tipo: "traspasoDesde", monto, raw: tr });
  }
  for (const tr of traspasosHacia || []) {
    // Para traspasos hacia que son % del origen, el monto ya fue calculado en el origen;
    // aquí el monto viene del traspaso mismo si es fijo, o si es % y es hacia, no lo recalculamos (sería 0)
    // Para evitar doble conteo, solo consideramos traspasos hacia que son fijos o cuyo origen no es %?
    // Simplificamos: si el traspaso es % y es hacia, su monto ya fue restado del origen y sumado aquí con el mismo valor
    // Pero como no tenemos el monto efectivo del origen aquí, lo recalculamos si es % y el origen es otro sleeve
    // Para no complicar, si es % y es hacia, lo ignoramos aquí porque ya se sumó en el origen como salida y se sumará como entrada con el mismo monto
    // En la práctica, los traspasos % se definen con desde, así que los hacia con % son raros
    let monto = tr.monto ?? 0;
    eventos.push({ fecha: tr.fecha, tipo: "traspasoHacia", monto, raw: tr });
  }
  // Resolver montos efectivos para traspasos % hacia que vienen de otro sleeve
  // Necesitamos mapear los traspasos % que son hacia: su monto debe ser el mismo que se restó del origen
  // Como los traspasos se guardan como un único registro con desde/hacia, ya están en ambas listas (desde y hacia)
  // Así que el monto para el hacia con % ya está calculado arriba como inicio_origen * mensual * %, pero aquí no tenemos inicio_origen
  // Para simplificar, si es % y es hacia, calculamos con 0 (ya se sumó en el desde, pero aquí necesitamos sumarlo)
  // Hacemos que los traspasos % se manejen solo en el desde, y el hacia es solo recepción del mismo monto
  // Por eso, para los hacia con %, buscamos el traspaso original y usamos su monto efectivo
  // Como los traspasos se duplican (uno en desde y uno en hacia son el mismo registro), el monto efectivo ya está en el registro
  // Si es % y es hacia, el monto en el registro es 0, pero el efectivo debería ser el del origen
  // Para evitar complejidad, tratamos los traspasos % solo en el desde, y en el hacia los ignoramos si son % (ya se sumó el monto en el desde como salida, pero la entrada no se suma)
  // Mejor: en el cálculo de traspasos % hacia, no sumamos nada aquí, la suma se hará cuando procesemos el traspaso como desde en su sleeve origen
  // Así que filtramos los hacia con % para no duplicar
  const eventosFiltrados = eventos.filter((ev) => !(ev.tipo === "traspasoHacia" && ev.raw.esPorcentaje));
  // Para los traspasos % desde, ya calculamos monto, para los hacia fijos, ya tienen monto
  // Ahora ordenamos y simulamos
  const todosEventos = [];
  for (const ing of ingresos || []) todosEventos.push({ fecha: ing.fecha, tipo: "ingreso", monto: ing.monto });
  for (const tr of traspasosDesde || []) {
    let m = tr.monto ?? 0;
    if (tr.esPorcentaje && tr.porcentaje > 0) m = inicio * mensual * tr.porcentaje;
    todosEventos.push({ fecha: tr.fecha, tipo: "traspasoDesde", monto: m });
  }
  for (const tr of traspasosHacia || []) {
    if (tr.esPorcentaje) continue;
    todosEventos.push({ fecha: tr.fecha, tipo: "traspasoHacia", monto: tr.monto ?? 0 });
  }
  todosEventos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  let valor = inicio;
  let gananciaTotal = 0;
  let ingresoTotal = 0;
  let traspasoNet = 0;
  let diaPrevio = Math.min(Math.max(diaInicioMes ?? 1, 1), dim);
  const habilesMes = soloHabiles ? habilesEnMes(mesISO) : 0;
  // Proporción del mes que rinde un tramo de días [desdeDia, hastaDia]
  // (inclusive): renta fija cuenta días corridos; trading y largo plazo,
  // solo días hábiles (Lun–Vie) sobre los hábiles totales del mes.
  function porcion(desdeDia, hastaDia) {
    if (soloHabiles) {
      return habilesMes > 0 ? habilesEntre(mesISO, desdeDia, hastaDia) / habilesMes : 0;
    }
    const n = Math.min(hastaDia, dim) - Math.max(desdeDia, 1) + 1;
    return dim > 0 ? Math.max(0, n) / dim : 0;
  }
  for (const ev of todosEventos) {
    const diaEvento = Number(ev.fecha.slice(8, 10));
    if (valor > 0) {
      const g = valor * mensual * porcion(diaPrevio, diaEvento - 1);
      gananciaTotal += g;
      valor += g;
    }
    if (ev.tipo === "ingreso") {
      valor += ev.monto;
      ingresoTotal += ev.monto;
    } else if (ev.tipo === "traspasoDesde") {
      valor -= ev.monto;
      traspasoNet -= ev.monto;
    } else if (ev.tipo === "traspasoHacia") {
      valor += ev.monto;
      traspasoNet += ev.monto;
    }
    diaPrevio = Math.max(diaPrevio, diaEvento);
  }
  if (valor > 0) {
    const g = valor * mensual * porcion(diaPrevio, dim);
    gananciaTotal += g;
    valor += g;
  }
  return { fin: valor, ganancia: gananciaTotal, ingresoTotal, traspasoNet };
}

function calcularProyeccion({ totalesIniciales, rfMensual, tradingMensual, largoMensual, ingresos, traspasos, meses, inicio }) {
  const MESES = meses && meses.length ? meses : [FIN_PROYECCION];
  const fechaInicioProyeccion = inicio || FIN_PROYECCION;
  let trading = totalesIniciales.trading ?? 0;
  let largo = totalesIniciales.largo ?? 0;
  let rentaFija = totalesIniciales.rentaFija ?? 0;
  // Si el inicio es a mitad de mes, el primer mes se prorratea por días restantes
  const diaInicioNum = Number(fechaInicioProyeccion.slice(8, 10));
  const esPrimerMesParcial = diaInicioNum > 1;
  const filas = [];
  const porMesIngresos = new Map();
  for (const ing of ingresos || []) {
    const k = mesKey(ing.fecha);
    if (!porMesIngresos.has(k)) porMesIngresos.set(k, []);
    porMesIngresos.get(k).push(ing);
  }
  const porMesTraspasos = new Map();
  for (const tr of traspasos || []) {
    const k = mesKey(tr.fecha);
    if (!porMesTraspasos.has(k)) porMesTraspasos.set(k, []);
    porMesTraspasos.get(k).push(tr);
  }
  for (const mesISO of MESES) {
    const k = mesKey(mesISO);
    const inicioTrading = trading;
    const inicioLargo = largo;
    const inicioRF = rentaFija;

    const ingresosTrading = (porMesIngresos.get(k) || []).filter((x) => x.destino === "trading");
    const ingresosLargo = (porMesIngresos.get(k) || []).filter((x) => x.destino === "largo");
    const ingresosRF = (porMesIngresos.get(k) || []).filter((x) => x.destino !== "trading" && x.destino !== "largo");
    const traspasosDesdeTrading = (porMesTraspasos.get(k) || []).filter((x) => x.desde === "trading");
    const traspasosHaciaTrading = (porMesTraspasos.get(k) || []).filter((x) => x.hacia === "trading");
    const traspasosDesdeLargo = (porMesTraspasos.get(k) || []).filter((x) => x.desde === "largo");
    const traspasosHaciaLargo = (porMesTraspasos.get(k) || []).filter((x) => x.hacia === "largo");
    const traspasosDesdeRF = (porMesTraspasos.get(k) || []).filter((x) => x.desde === "rentaFija");
    const traspasosHaciaRF = (porMesTraspasos.get(k) || []).filter((x) => x.hacia === "rentaFija");

    const esPrimerMes = mesISO === MESES[0];
    const diaInicioMes = esPrimerMes ? Number(fechaInicioProyeccion.slice(8,10)) : 1;
    // Los traspasos "% de la ganancia" se resuelven a monto acá —con el inicio,
    // la tasa y los días del mes de la estrategia ORIGEN— para que el destino
    // también los acredite. Dentro de cada sim solo circulan montos fijos.
    const mensuales = { trading: tradingMensual, largo: largoMensual, rentaFija: rfMensual };
    const iniciosMes = { trading: inicioTrading, largo: inicioLargo, rentaFija: inicioRF };
    const traspasosResueltos = (porMesTraspasos.get(k) || []).map((tr) => {
      if (!tr.esPorcentaje) return tr;
      const f = factorMesSleeve({ mesISO, diaInicioMes, soloHabiles: tr.desde !== "rentaFija" });
      return { ...tr, monto: (iniciosMes[tr.desde] ?? 0) * (mensuales[tr.desde] ?? 0) * f * (tr.porcentaje ?? 0), esPorcentaje: false };
    });
    const trDesde = (s) => traspasosResueltos.filter((x) => x.desde === s);
    const trHacia = (s) => traspasosResueltos.filter((x) => x.hacia === s);
    const simTrading = simularSleeveConEventos({ inicio: inicioTrading, mensual: tradingMensual, ingresos: ingresosTrading, traspasosDesde: trDesde("trading"), traspasosHacia: trHacia("trading"), mesISO, diaInicioMes, soloHabiles: true });
    const simLargo = simularSleeveConEventos({ inicio: inicioLargo, mensual: largoMensual, ingresos: ingresosLargo, traspasosDesde: trDesde("largo"), traspasosHacia: trHacia("largo"), mesISO, diaInicioMes, soloHabiles: true });
    const simRF = simularSleeveConEventos({ inicio: inicioRF, mensual: rfMensual, ingresos: ingresosRF, traspasosDesde: trDesde("rentaFija"), traspasosHacia: trHacia("rentaFija"), mesISO, diaInicioMes, soloHabiles: false });

    trading = simTrading.fin;
    largo = simLargo.fin;
    rentaFija = simRF.fin;

    const total = trading + largo + rentaFija;
    filas.push({
      mes: mesISO,
      etiqueta: formatoFecha.format(fechaLocal(mesISO)),
      trading: { inicio: inicioTrading, ganancia: simTrading.ganancia, ingreso: simTrading.ingresoTotal, traspasoNet: simTrading.traspasoNet, fin: trading, ingresosDetalle: ingresosTrading, traspasosDetalle: [...traspasosDesdeTrading, ...traspasosHaciaTrading] },
      largo: { inicio: inicioLargo, ganancia: simLargo.ganancia, ingreso: simLargo.ingresoTotal, traspasoNet: simLargo.traspasoNet, fin: largo, ingresosDetalle: ingresosLargo },
      rentaFija: { inicio: inicioRF, ganancia: simRF.ganancia, ingreso: simRF.ingresoTotal, traspasoNet: simRF.traspasoNet, fin: rentaFija, ingresosDetalle: ingresosRF },
      total,
    });
  }
  return filas;
}

const SLEEVES = [
  { id: "trading", etiqueta: "Trading" },
  { id: "largo", etiqueta: "Largo plazo" },
  { id: "rentaFija", etiqueta: "Renta fija" },
];

const ETIQUETA_SLEEVE = { trading: "Trading", largo: "Largo plazo", rentaFija: "Renta fija" };

const MIN_FECHA = "2026-10-01";
const MAX_FECHA = "2027-07-31";

function colorGanancia(v) {
  return v == null || v === 0 ? "var(--text-muted)" : v > 0 ? "var(--good)" : "var(--bad)";
}

function signo(v) {
  return v == null || v === 0 ? "" : v > 0 ? "+" : "−";
}

function aDecimalMensual(texto) {
  const v = Number(String(texto).replace(",", "."));
  if (!Number.isFinite(v)) return null;
  return v / 100;
}

/**
 * Tasa decimal (0.025) a texto para <input type="number">: siempre con punto,
 * porque la coma decimal se considera valor inválido y el campo se ve vacío
 * en navegadores con locale inglés.
 */
function formateaTasa(decimal) {
  const v = Math.round(Number(decimal) * 100 * 1000) / 1000;
  return Number.isFinite(v) ? String(v) : "";
}

function ContenidoSleeve({ dato, ingresos }) {
  const lista = ingresos || [];
  return (
    <>
      <div className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {formatoARS.format(dato.fin)}
      </div>
      <div className="text-xs tabular-nums" style={{ color: colorGanancia(dato.ganancia) }}>
        {signo(dato.ganancia)}{formatoARS.format(Math.abs(dato.ganancia ?? 0))} en el mes
      </div>
      {lista.length > 0 && (
        <div className="mt-1 whitespace-normal break-words text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Ingresos:
        </div>
      )}
      {lista.map((ing) => (
        <div key={ing.id} className="mt-0.5 whitespace-normal break-words text-xs tabular-nums">
          <span style={{ color: "var(--text-muted)" }}>
            {ing.fecha ? formatoFechaLarga.format(fechaLocal(ing.fecha)) : "—"} ·{" "}
          </span>
          <span style={{ color: "var(--good)" }}>
            +{formatoARS.format(ing.monto)}{ing.nota ? ` · ${ing.nota}` : ""}
          </span>
        </div>
      ))}
    </>
  );
}

function CeldaSleeve({ dato, ingresos }) {
  return (
    <td className="whitespace-nowrap px-3 py-2 text-left tabular-nums align-top">
      <ContenidoSleeve dato={dato} ingresos={ingresos} />
    </td>
  );
}

function NotaMesParcial({ indice, diaInicioMes, diasRestantes, habilesRestantes }) {
  if (indice !== 0 || !(diaInicioMes > 1)) return null;
  return (
    <div className="mt-0.5 whitespace-normal text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
      rinden los {diasRestantes} días restantes ({habilesRestantes} hábiles)
    </div>
  );
}

export default function ProyeccionClient({ totalesIniciales, proyeccionInicial }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const guardadas = {
    rfMensual: Number(proyeccionInicial?.rfMensual ?? 0.015),
    tradingMensual: Number(proyeccionInicial?.tradingMensual ?? 0.03),
    largoMensual: Number(proyeccionInicial?.largoMensual ?? 0.02),
  };
  const [rf, setRf] = useState(() => formateaTasa(guardadas.rfMensual));
  const [tasaTrading, setTasaTrading] = useState(() => formateaTasa(guardadas.tradingMensual));
  const [tasaLargo, setTasaLargo] = useState(() => formateaTasa(guardadas.largoMensual));

  const [ingFecha, setIngFecha] = useState("");
  const [ingMonto, setIngMonto] = useState("");
  const [ingDestino, setIngDestino] = useState("trading");
  const [ingNota, setIngNota] = useState("");

  const [trFecha, setTrFecha] = useState("");
  const [trDesde, setTrDesde] = useState("trading");
  const [trHacia, setTrHacia] = useState("rentaFija");
  const [trModo, setTrModo] = useState("monto");
  const [trMonto, setTrMonto] = useState("");
  const [trPorcentaje, setTrPorcentaje] = useState("");
  const [trNota, setTrNota] = useState("");

  const meses = useMemo(() => mesesProyeccion(), []);
  const inicioProy = useMemo(() => inicioProyeccion(), []);

  // El primer mes puede arrancar a mitad de mes: días que quedan (corridos y
  // hábiles) para aclararlo en la fila.
  const { diaInicioMes, diasRestantes, habilesRestantes } = useMemo(() => {
    if (!meses.length) return { diaInicioMes: 1, diasRestantes: 0, habilesRestantes: 0 };
    const dim = diasEnMes(meses[0]);
    const [y, m] = meses[0].split("-").map(Number);
    const [iy, im, id] = String(inicioProy).split("-").map(Number);
    const inicio = iy === y && im === m ? Math.min(Math.max(id, 1), dim) : 1;
    return {
      diaInicioMes: inicio,
      diasRestantes: dim - inicio + 1,
      habilesRestantes: habilesEntre(meses[0], inicio, dim),
    };
  }, [meses, inicioProy]);

  const tasas = useMemo(() => ({    rfMensual: aDecimalMensual(rf),
    tradingMensual: aDecimalMensual(tasaTrading),
    largoMensual: aDecimalMensual(tasaLargo),
  }), [rf, tasaTrading, tasaLargo]);

  const tasasValidas =
    tasas.rfMensual != null && tasas.tradingMensual != null && tasas.largoMensual != null &&
    [tasas.rfMensual, tasas.tradingMensual, tasas.largoMensual].every((v) => v >= 0 && v <= 0.5);

  const hayCambiosSinGuardar =
    tasasValidas &&
    (tasas.rfMensual !== guardadas.rfMensual ||
      tasas.tradingMensual !== guardadas.tradingMensual ||
      tasas.largoMensual !== guardadas.largoMensual);

  const filas = useMemo(() => {
    if (!tasasValidas) return [];
    return calcularProyeccion({
      totalesIniciales: totalesIniciales || { trading: 0, largo: 0, rentaFija: 0 },
      rfMensual: tasas.rfMensual,
      tradingMensual: tasas.tradingMensual,
      largoMensual: tasas.largoMensual,
      ingresos: proyeccionInicial?.ingresos || [],
      traspasos: proyeccionInicial?.traspasos || [],
      meses,
      inicio: inicioProy,
    });
  }, [totalesIniciales, tasas, tasasValidas, proyeccionInicial, meses, inicioProy]);

  const resumen = useMemo(() => {
    if (!filas.length) return null;
    const ultima = filas[filas.length - 1];
    const suma = (sel) => filas.reduce((acc, f) => acc + (sel(f) ?? 0), 0);
    return {
      fin: { trading: ultima.trading.fin, largo: ultima.largo.fin, rentaFija: ultima.rentaFija.fin, total: ultima.total },
      ganancia: {
        trading: suma((f) => f.trading.ganancia),
        largo: suma((f) => f.largo.ganancia),
        rentaFija: suma((f) => f.rentaFija.ganancia),
      },
    };
  }, [filas]);

  const ingresos = proyeccionInicial?.ingresos || [];
  const traspasos = proyeccionInicial?.traspasos || [];

  function correr(promesa, mensajeOk, limpiar) {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        await promesa();
        if (limpiar) limpiar();
        if (mensajeOk) setOk(mensajeOk);
        router.refresh();
      } catch (e) {
        setError(e?.message || "Algo falló — probá de nuevo.");
      }
    });
  }

  function guardarTasas() {
    if (!tasasValidas) {
      setError("Revisá las tasas: tienen que ser porcentajes entre 0 y 50.");
      return;
    }
    correr(
      () => guardarProyeccionReturn({ rfMensual: tasas.rfMensual, tradingMensual: tasas.tradingMensual, largoMensual: tasas.largoMensual }),
      "Tasas guardadas."
    );
  }

  function agregarIngreso() {
    correr(
      () => agregarIngresoProyeccionAction({ fecha: ingFecha, monto: ingMonto, destino: ingDestino, nota: ingNota }),
      "Ingreso agregado.",
      () => { setIngFecha(""); setIngMonto(""); setIngNota(""); }
    );
  }

  function agregarTraspaso() {
    const esPorcentaje = trModo === "porcentaje";
    correr(
      () => agregarTraspasoProyeccionAction({
        fecha: trFecha,
        desde: trDesde,
        hacia: trHacia,
        monto: esPorcentaje ? 0 : trMonto,
        esPorcentaje,
        porcentaje: esPorcentaje ? Number(String(trPorcentaje).replace(",", ".")) / 100 : 0,
        nota: trNota,
      }),
      "Traspaso agregado.",
      () => { setTrFecha(""); setTrMonto(""); setTrPorcentaje(""); setTrNota(""); }
    );
  }

  const estiloInput = {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
    color: "var(--text-primary)",
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--bad)", color: "var(--bad)", background: "var(--surface-1)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--good)", color: "var(--good)", background: "var(--surface-1)" }}>
          {ok}
        </p>
      )}

      <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Rendimiento mensual por estrategia</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Parte de tu cartera actual: Trading {formatoARS.format(totalesIniciales?.trading ?? 0)} · Largo plazo{" "}
          {formatoARS.format(totalesIniciales?.largo ?? 0)} · Renta fija {formatoARS.format(totalesIniciales?.rentaFija ?? 0)}.
          La tabla arranca en {meses.length ? formatoFecha.format(fechaLocal(meses[0])) : "—"} (mes en curso, prorrateado desde hoy)
          y se recalcula al instante; guardá para que quede registrado. La renta fija rinde por días corridos;
          trading y largo plazo, por días hábiles.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { etiqueta: "Trading (% mensual)", valor: tasaTrading, fijar: setTasaTrading },
            { etiqueta: "Largo plazo (% mensual)", valor: tasaLargo, fijar: setTasaLargo },
            { etiqueta: "Renta fija (% mensual)", valor: rf, fijar: setRf },
          ].map((c) => (
            <label key={c.etiqueta} className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {c.etiqueta}
              <input
                type="number"
                min={0}
                max={50}
                step="0.1"
                value={c.valor}
                onChange={(e) => c.fijar(e.target.value.replace(",", "."))}
                className="w-full min-w-0 rounded border px-2 py-1 text-sm tabular-nums"
                style={estiloInput}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendiente || !tasasValidas}
            onClick={guardarTasas}
            className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--marca)" }}
          >
            {pendiente ? "Guardando…" : "Guardar tasas"}
          </button>
          {hayCambiosSinGuardar && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Tenés cambios sin guardar (la tabla ya los muestra como vista previa).
            </span>
          )}
        </div>
      </section>

      <section className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h2 className="px-4 pt-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Mes a mes hasta julio 2027</h2>
        {!filas.length ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Revisá las tasas de arriba para ver la proyección.
          </p>
        ) : (
          <div className="mt-2 hidden overflow-x-auto pb-2 md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="px-3 py-2 font-medium">Mes</th>
                  <th className="px-3 py-2 text-left font-medium">Trading</th>
                  <th className="px-3 py-2 text-left font-medium">Largo plazo</th>
                  <th className="px-3 py-2 text-left font-medium">Renta fija</th>
                  <th className="px-3 py-2 text-left font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.mes} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium align-top" style={{ color: "var(--text-primary)" }}>
                      {f.etiqueta}
                      <NotaMesParcial indice={i} diaInicioMes={diaInicioMes} diasRestantes={diasRestantes} habilesRestantes={habilesRestantes} />
                    </td>
                    <CeldaSleeve dato={f.trading} ingresos={f.trading.ingresosDetalle} />
                    <CeldaSleeve dato={f.largo} ingresos={f.largo.ingresosDetalle} />
                    <CeldaSleeve dato={f.rentaFija} ingresos={f.rentaFija.ingresosDetalle} />
                    <td className="whitespace-nowrap px-3 py-2 text-left font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {formatoARS.format(f.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {resumen && (
                <tfoot>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Final + ganancia total
                    </td>
                    {["trading", "largo", "rentaFija"].map((s) => (
                      <td key={s} className="whitespace-nowrap px-3 py-2 text-left tabular-nums">
                        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {formatoARS.format(resumen.fin[s])}
                        </div>
                        <div className="text-xs" style={{ color: colorGanancia(resumen.ganancia[s]) }}>
                          {signo(resumen.ganancia[s])}{formatoARS.format(Math.abs(resumen.ganancia[s]))}
                        </div>
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-left font-semibold tabular-nums" style={{ color: "var(--marca)" }}>
                      {formatoARS.format(resumen.fin.total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {!!filas.length && (
          <div className="mt-2 md:hidden">
            {filas.map((f, i) => (
              <div key={f.mes} className="border-t px-4 py-3 first:border-t-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {f.etiqueta}
                    <NotaMesParcial indice={i} diaInicioMes={diaInicioMes} diasRestantes={diasRestantes} habilesRestantes={habilesRestantes} />
                  </div>
                  <div className="text-base font-semibold tabular-nums" style={{ color: "var(--marca)" }}>
                    {formatoARS.format(f.total)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {[
                    { etiqueta: "Trading", dato: f.trading, ingresos: f.trading.ingresosDetalle },
                    { etiqueta: "Largo plazo", dato: f.largo, ingresos: f.largo.ingresosDetalle },
                    { etiqueta: "Renta fija", dato: f.rentaFija, ingresos: f.rentaFija.ingresosDetalle },
                  ].map((s) => (
                    <div key={s.etiqueta} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{s.etiqueta}</div>
                      <div className="mt-1 text-sm">
                        <ContenidoSleeve dato={s.dato} ingresos={s.ingresos} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {resumen && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Final + ganancia total
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {[
                    { etiqueta: "Trading", fin: resumen.fin.trading, ganancia: resumen.ganancia.trading },
                    { etiqueta: "Largo plazo", fin: resumen.fin.largo, ganancia: resumen.ganancia.largo },
                    { etiqueta: "Renta fija", fin: resumen.fin.rentaFija, ganancia: resumen.ganancia.rentaFija },
                  ].map((s) => (
                    <div key={s.etiqueta} className="flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.etiqueta}</span>
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {formatoARS.format(s.fin)}{" "}
                        <span className="text-xs font-normal" style={{ color: colorGanancia(s.ganancia) }}>
                          ({signo(s.ganancia)}{formatoARS.format(Math.abs(s.ganancia))})
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Total</span>
                    <span className="text-base font-semibold" style={{ color: "var(--marca)" }}>
                      {formatoARS.format(resumen.fin.total)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Ingresos futuros</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Plata nueva que va a entrar (sueldo, aportes) y en qué estrategia cae.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Fecha
              <input type="date" value={ingFecha} min={MIN_FECHA} max={MAX_FECHA} onChange={(e) => setIngFecha(e.target.value)} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Monto (ARS)
              <input type="number" min={0} step="any" value={ingMonto} onChange={(e) => setIngMonto(e.target.value)} placeholder="500000" className="w-full min-w-0 rounded border px-2 py-1 text-sm tabular-nums" style={estiloInput} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Destino
              <select value={ingDestino} onChange={(e) => setIngDestino(e.target.value)} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput}>
                {SLEEVES.map((s) => (
                  <option key={s.id} value={s.id}>{s.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Nota (opcional)
              <input value={ingNota} onChange={(e) => setIngNota(e.target.value)} placeholder="Aguinaldo" maxLength={120} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput} />
            </label>
          </div>
          <button
            type="button"
            disabled={pendiente}
            onClick={agregarIngreso}
            className="mt-3 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--marca)" }}
          >
            Agregar ingreso
          </button>
          <ul className="mt-3 space-y-2">
            {ingresos.map((ing) => (
              <li key={ing.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {formatoARS.format(ing.monto)} → {ETIQUETA_SLEEVE[ing.destino] || ing.destino}
                  </div>
                  <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {ing.fecha ? formatoFechaLarga.format(fechaLocal(ing.fecha)) : "—"}{ing.nota ? ` · ${ing.nota}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => correr(() => eliminarIngresoProyeccionAction(ing.id), null)}
                  className="shrink-0 cursor-pointer rounded-md border px-2 py-1 text-xs disabled:opacity-60"
                  style={{ borderColor: "var(--border)", color: "var(--bad)" }}
                >
                  Eliminar
                </button>
              </li>
            ))}
            {!ingresos.length && (
              <li className="text-xs" style={{ color: "var(--text-muted)" }}>Todavía no agregaste ingresos.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Traspasos de ganancias</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Mové plata entre estrategias en una fecha: monto fijo o un % de la ganancia de ese mes
            (el % se calcula sobre la ganancia del origen y también se acredita en destino).
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Fecha
              <input type="date" value={trFecha} min={MIN_FECHA} max={MAX_FECHA} onChange={(e) => setTrFecha(e.target.value)} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput} />
            </label>
            <div className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Tipo
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setTrModo("monto")}
                  className="flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors"
                  style={trModo === "monto" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
                >
                  Monto fijo
                </button>
                <button
                  type="button"
                  onClick={() => setTrModo("porcentaje")}
                  className="flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors"
                  style={trModo === "porcentaje" ? { background: "var(--marca)", color: "#fff" } : { color: "var(--text-muted)" }}
                >
                  % ganancia
                </button>
              </div>
            </div>
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Desde
              <select value={trDesde} onChange={(e) => setTrDesde(e.target.value)} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput}>
                {SLEEVES.map((s) => (
                  <option key={s.id} value={s.id}>{s.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Hacia
              <select value={trHacia} onChange={(e) => setTrHacia(e.target.value)} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput}>
                {SLEEVES.map((s) => (
                  <option key={s.id} value={s.id}>{s.etiqueta}</option>
                ))}
              </select>
            </label>
            {trModo === "monto" ? (
              <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                Monto (ARS)
                <input type="number" min={0} step="any" value={trMonto} onChange={(e) => setTrMonto(e.target.value)} placeholder="200000" className="w-full min-w-0 rounded border px-2 py-1 text-sm tabular-nums" style={estiloInput} />
              </label>
            ) : (
              <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                % de la ganancia del mes (0–100)
                <input type="number" min={0} max={100} step="any" value={trPorcentaje} onChange={(e) => setTrPorcentaje(e.target.value)} placeholder="50" className="w-full min-w-0 rounded border px-2 py-1 text-sm tabular-nums" style={estiloInput} />
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Nota (opcional)
              <input value={trNota} onChange={(e) => setTrNota(e.target.value)} placeholder="Tomo ganancias" maxLength={120} className="w-full min-w-0 rounded border px-2 py-1 text-sm" style={estiloInput} />
            </label>
          </div>
          <button
            type="button"
            disabled={pendiente}
            onClick={agregarTraspaso}
            className="mt-3 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--marca)" }}
          >
            Agregar traspaso
          </button>
          <ul className="mt-3 space-y-2">
            {traspasos.map((tr) => (
              <li key={tr.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {ETIQUETA_SLEEVE[tr.desde] || tr.desde} → {ETIQUETA_SLEEVE[tr.hacia] || tr.hacia} ·{" "}
                    {tr.esPorcentaje
                      ? `${(Number(tr.porcentaje) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}% ganancia`
                      : formatoARS.format(tr.monto)}
                  </div>
                  <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {tr.fecha ? formatoFechaLarga.format(fechaLocal(tr.fecha)) : "—"}{tr.nota ? ` · ${tr.nota}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => correr(() => eliminarTraspasoProyeccionAction(tr.id), null)}
                  className="shrink-0 cursor-pointer rounded-md border px-2 py-1 text-xs disabled:opacity-60"
                  style={{ borderColor: "var(--border)", color: "var(--bad)" }}
                >
                  Eliminar
                </button>
              </li>
            ))}
            {!traspasos.length && (
              <li className="text-xs" style={{ color: "var(--text-muted)" }}>Todavía no agregaste traspasos.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
