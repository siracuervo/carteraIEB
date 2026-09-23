"use client";

import { useState } from "react";
import ValorSensible from "./ValorSensible";
import { fechaLocal, hoyArgentina } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

/** Índice (0=lunes .. 4=viernes) del día hábil a mostrar por defecto. Sáb/dom caen en el viernes. */
function indiceHoy() {
  const dia = new Date().getDay();
  if (dia === 0) return 4;
  return Math.min(dia - 1, 4);
}

function SelectorDias({ dias, seleccionado, onSeleccionar }) {
  // Hoy en hora argentina (el server corre en UTC: con `new Date()` a la noche
  // el miércoles ya figuraba como "no futuro" siendo martes).
  const hoyART = hoyArgentina();
  return (
    <div className="flex shrink-0 gap-1">
      {dias.map((d, i) => {
        const activo = i === seleccionado;
        const futuro = d.fecha > hoyART;
        // Hoy sin datos (pre-sesión) tampoco se puede elegir: el día se
        // habilita cuando abre la rueda. Los días pasados sin import se
        // pueden tocar igual (muestran el aviso).
        const deshabilitado = futuro || (d.fecha === hoyART && !d.disponible);
        let estilo;
        if (d.disponible) {
          estilo = activo
            ? { background: "var(--marca)", color: "#fff" }
            : { background: "var(--marca-suave)", color: "var(--marca)" };
        } else {
          estilo = activo
            ? { background: "var(--gridline)", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--text-muted)" }
            : { background: "transparent", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--border)" };
        }
        return (
          <button
            key={i}
            type="button"
            disabled={deshabilitado}
            onClick={() => onSeleccionar(i)}
            title={d.fecha}
            className="h-6 w-6 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={estilo}
          >
            {d.letra}
          </button>
        );
      })}
    </div>
  );
}

/** Flechas ‹ › para moverse entre semanas del historial + etiqueta de la semana visible. */
function NavegacionSemanas({ semanas, indiceSemana, onCambiar }) {
  if (!semanas?.length) return null;
  const semana = semanas[Math.min(indiceSemana, semanas.length - 1)];
  const enLaPrimera = indiceSemana <= 0;
  const enLaUltima = indiceSemana >= semanas.length - 1;
  const estiloActivo = { background: "var(--marca-suave)", color: "var(--marca)" };
  const estiloDeshabilitado = { background: "transparent", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--border)" };
  const claseBoton = "flex h-6 w-6 items-center justify-center rounded-md text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Semana anterior"
        title="Semana anterior"
        disabled={enLaPrimera}
        onClick={() => onCambiar(indiceSemana - 1)}
        className={claseBoton}
        style={enLaPrimera ? estiloDeshabilitado : estiloActivo}
      >
        ‹
      </button>
      <span
        className="min-w-24 text-center text-xs font-medium tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        {enLaUltima && indiceSemana === semanas.length - 1
          ? "Semana actual"
          : `Semana ${formatoFechaCorta.format(fechaLocal(semana.inicioISO))}`}
      </span>
      <button
        type="button"
        aria-label="Semana siguiente"
        title="Semana siguiente"
        disabled={enLaUltima}
        onClick={() => onCambiar(indiceSemana + 1)}
        className={claseBoton}
        style={enLaUltima ? estiloDeshabilitado : estiloActivo}
      >
        ›
      </button>
    </div>
  );
}

function Fila({ etiqueta, subtitulo, variacion }) {
  if (!variacion) {
    return (
      <div className="border-t pt-1.5 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{etiqueta}</div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitulo}</p>
      </div>
    );
  }

  const color = variacion.diffARS >= 0 ? "var(--good)" : "var(--bad)";
  const tieneValores = variacion.desdeValorARS != null && variacion.hastaValorARS != null;
  return (
    <div className="border-t pt-1.5 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{etiqueta}</div>
        <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {formatoFechaCorta.format(fechaLocal(variacion.desdeFecha))} → {formatoFechaCorta.format(fechaLocal(variacion.hastaFecha))}
        </div>
      </div>
      {tieneValores && (
        <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
            <ValorSensible>{formatoARS.format(variacion.desdeValorARS)}</ValorSensible>
            <span aria-hidden="true">→</span>
            <ValorSensible>{formatoARS.format(variacion.hastaValorARS)}</ValorSensible>
          </div>
          <div className="flex shrink-0 items-baseline gap-1.5">
            <span className="text-xs tabular-nums" style={{ color }}>
              <ValorSensible>{formatoARS.format(variacion.diffARS)}</ValorSensible>
            </span>
            <span className="text-base sm:text-lg font-semibold tabular-nums" style={{ color }}>
              {formatoPct.format(variacion.diffPct)}
            </span>
          </div>
        </div>
      )}
      {variacion.sinRentaFija && (
        <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          Sin renta fija:{" "}
          <span style={{ color: variacion.sinRentaFija.diffARS >= 0 ? "var(--good)" : "var(--bad)" }}>
            {variacion.sinRentaFija.diffARS > 0 ? "+" : ""}
            <ValorSensible>{formatoARS.format(variacion.sinRentaFija.diffARS)}</ValorSensible>
            {" "}({variacion.sinRentaFija.diffPct != null ? formatoPct.format(variacion.sinRentaFija.diffPct) : "—"})
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compara el último Portfolio importado contra el anterior (diaria, según el día
 * elegido en el selector L M M J V) y contra el lunes de esa semana (o el último
 * cierre previo si el lunes no tiene snapshot), mostrado como "lunes → hoy". El selector arranca en el día de
 * hoy (sáb/dom muestran el viernes) y solo deja elegir días violeta (con Portfolio
 * importado ese día y con un snapshot previo contra el cual compararlo); los grises
 * no tienen ese dato todavía.
 */
export default function EvolucionPatrimonio({ evolucion, evolucionSemana, semanasEvolucion }) {
  const semanas = semanasEvolucion || [];
  // El día de hoy solo se habilita cuando abre la sesión: si todavía no tiene
  // dato (pre-sesión), se arranca en el último día disponible de la semana.
  const [indiceDia, setIndiceDia] = useState(() => {
    const ultima = semanas.length ? semanas[semanas.length - 1] : null;
    const dias = ultima ? ultima.dias : (evolucionSemana || []);
    const hoy = indiceHoy();
    if (dias[hoy]?.disponible) return hoy;
    const ultimoDisponible = dias.reduce((acc, d, j) => (d.disponible ? j : acc), -1);
    return ultimoDisponible >= 0 ? ultimoDisponible : hoy;
  });
  const [indiceSemana, setIndiceSemana] = useState(() => (semanas.length ? semanas.length - 1 : 0));

  if (!evolucion) return null;

  const semana = semanas.length ? semanas[Math.min(indiceSemana, semanas.length - 1)] : null;
  const dias = semana ? semana.dias : (evolucionSemana || []);

  const cambiarSemana = (i) => {
    if (i < 0 || i >= semanas.length) return;
    setIndiceSemana(i);
    const s = semanas[i];
    if (s) {
      const ultimoDisponible = s.dias.reduce((acc, d, j) => (d.disponible ? j : acc), -1);
      if (ultimoDisponible >= 0) setIndiceDia(ultimoDisponible);
    }
  };

  const diaActivo = dias[indiceDia];
  const semanalBase = semana ? semana.semanal : (evolucion.semanal ?? null);
  // Semanal acumulada HASTA el día elegido (no hasta el último de la semana):
  // misma base (cierre de la semana anterior) pero valuada al día activo.
  const varDia = diaActivo?.disponible ? diaActivo.variacion : null;
  let semanal = semanalBase;
  if (semanalBase?.desdeValorARS != null && varDia?.hastaValorARS != null && diaActivo?.fecha) {
    const diffARS = varDia.hastaValorARS - semanalBase.desdeValorARS;
    // Ex-RF por día: viene precalculada con flujos neteados; si falta se estima
    // directo de los extremos (sin neteo).
    const baseSinRF = semanalBase.sinRentaFija;
    const diaSinRF = varDia.sinRentaFija;
    let sinRentaFija = varDia.sinRentaFijaSemanal ?? baseSinRF ?? null;
    if (!varDia.sinRentaFijaSemanal && baseSinRF && diaSinRF && diaSinRF.hastaValorARS != null && baseSinRF.desdeValorARS != null) {
      const dRF = diaSinRF.hastaValorARS - baseSinRF.desdeValorARS;
      sinRentaFija = {
        desdeFecha: baseSinRF.desdeFecha,
        hastaFecha: diaActivo.fecha,
        desdeValorARS: baseSinRF.desdeValorARS,
        hastaValorARS: diaSinRF.hastaValorARS,
        diffARS: dRF,
        diffPct: semanalBase.desdeValorARS > 0 ? dRF / semanalBase.desdeValorARS : null,
      };
    }
    semanal = {
      desdeFecha: semanalBase.desdeFecha,
      hastaFecha: diaActivo.fecha,
      desdeValorARS: semanalBase.desdeValorARS,
      hastaValorARS: varDia.hastaValorARS,
      diffARS,
      diffPct: semanalBase.desdeValorARS > 0 ? diffARS / semanalBase.desdeValorARS : null,
      sinRentaFija,
    };
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {semana && <NavegacionSemanas semanas={semanas} indiceSemana={indiceSemana} onCambiar={cambiarSemana} />}
          {dias.length > 0 && <SelectorDias dias={dias} seleccionado={indiceDia} onSeleccionar={setIndiceDia} />}
        </div>
      </div>
      <Fila
        etiqueta="Variación diaria"
        subtitulo={
          diaActivo?.fecha > hoyArgentina()
            ? "Ese día todavía no llegó."
            : "No se importó el Portfolio de ese día (o es el primero del historial, sin uno previo para comparar)."
        }
        variacion={diaActivo?.disponible ? diaActivo.variacion : null}
      />
      <Fila
        etiqueta="Variación semanal"
        subtitulo="Necesitás un Portfolio importado de una semana anterior para calcular la variación semanal."
        variacion={semanal}
      />
    </div>
  );
}
