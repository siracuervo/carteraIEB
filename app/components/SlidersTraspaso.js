"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agregarTraspasoEfectivo } from "@/app/actions";
import { aISO } from "@/lib/accesosRapidosFecha";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const SLEEVES = [
  { id: "trading", etiqueta: "Trading" },
  { id: "largo", etiqueta: "Largo plazo" },
  { id: "rentaFija", etiqueta: "Renta fija" },
];

/**
 * Rebalanceo de caja con sliders: cada slider fija el monto objetivo de una
 * estrategia; al aplicar se generan los traspasos necesarios (orígenes con
 * excedente → destinos con faltante). La suma siempre tiene que dar el total.
 */
export default function SlidersTraspaso({ saldos }) {
  const actual = useMemo(() => ({
    trading: Math.round(saldos?.trading ?? 0),
    largo: Math.round(saldos?.largo ?? 0),
    rentaFija: Math.round(saldos?.rentaFija ?? 0),
  }), [saldos]);
  const total = Math.max(0, actual.trading + actual.largo + actual.rentaFija);

  const [objetivos, setObjetivos] = useState(actual);
  const [pendiente, start] = useTransition();
  const [mensaje, setMensaje] = useState(null);
  const router = useRouter();

  const suma = objetivos.trading + objetivos.largo + objetivos.rentaFija;
  const diferencia = suma - total;
  const balanceado = diferencia === 0;

  function aplicar() {
    setMensaje(null);
    start(async () => {
      const diffs = {
        trading: objetivos.trading - actual.trading,
        largo: objetivos.largo - actual.largo,
        rentaFija: objetivos.rentaFija - actual.rentaFija,
      };
      const origenes = SLEEVES.filter((s) => diffs[s.id] < 0).map((s) => ({ id: s.id, monto: -diffs[s.id] }));
      const destinos = SLEEVES.filter((s) => diffs[s.id] > 0).map((s) => ({ id: s.id, monto: diffs[s.id] }));
      const hoy = aISO(new Date());
      let creados = 0;
      let i = 0;
      let j = 0;
      while (i < origenes.length && j < destinos.length) {
        const monto = Math.min(origenes[i].monto, destinos[j].monto);
        if (!(monto > 0)) break;
        const fd = new FormData();
        fd.set("fecha", hoy);
        fd.set("desde", origenes[i].id);
        fd.set("hacia", destinos[j].id);
        fd.set("monto", String(monto));
        fd.set("nota", "rebalanceo por sliders");
        const res = await agregarTraspasoEfectivo(null, fd);
        if (res?.error) {
          setMensaje(res.error);
          return;
        }
        creados++;
        origenes[i].monto -= monto;
        destinos[j].monto -= monto;
        if (origenes[i].monto <= 0) i++;
        if (destinos[j].monto <= 0) j++;
      }
      setMensaje(creados ? `Listo — ${creados} traspaso${creados === 1 ? "" : "s"} aplicado${creados === 1 ? "" : "s"}.` : "Sin cambios para aplicar.");
      router.refresh();
    });
  }

  if (total <= 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No hay caja para repartir entre estrategias.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Pesos totales en cuenta
        </span>
        <span className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatoARS.format(total)}
        </span>
      </div>
      {SLEEVES.map((s) => {
        const pct = total > 0 ? objetivos[s.id] / total : 0;
        const delta = objetivos[s.id] - actual[s.id];
        return (
          <div key={s.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{s.etiqueta}</span>
              <span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1 tabular-nums" style={{ color: "var(--text-primary)" }}>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={objetivos[s.id]}
                  onChange={(e) => {
                    const v = Number(String(e.target.value).replace(",", "."));
                    setObjetivos((o) => ({ ...o, [s.id]: Number.isFinite(v) && v > 0 ? Math.round(v) : 0 }));
                  }}
                  className="w-24 rounded border px-2 py-0.5 text-right text-sm tabular-nums sm:w-28"
                  style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  aria-label={`Monto objetivo de ${s.etiqueta}`}
                />
                <span style={{ color: "var(--text-muted)" }}> · {(pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</span>
                {delta !== 0 && (
                  <span style={{ color: delta > 0 ? "var(--good)" : "var(--bad)" }}>
                    {" "}({delta > 0 ? "+" : "−"}{formatoARS.format(Math.abs(delta))})
                  </span>
                )}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={total}
              step={1}
              value={Math.min(Math.max(objetivos[s.id], 0), total)}
              onChange={(e) => setObjetivos((o) => ({ ...o, [s.id]: Number(e.target.value) }))}
              className="w-full"
              aria-label={`Objetivo de ${s.etiqueta}`}
            />
            <div className="flex justify-between text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              <span>actual {formatoARS.format(actual[s.id])}</span>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums" style={{ color: balanceado ? "var(--text-muted)" : "var(--bad)" }}>
          Total {formatoARS.format(suma)} de {formatoARS.format(total)}
          {!balanceado && (
            <> · {diferencia > 0 ? "te pasaste por" : "te faltan"} {formatoARS.format(Math.abs(diferencia))}</>
          )}
        </p>
        <button
          type="button"
          disabled={pendiente || !balanceado}
          onClick={aplicar}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--marca)" }}
        >
          {pendiente ? "Aplicando…" : "Aplicar rebalanceo"}
        </button>
      </div>
      {mensaje && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          {mensaje}
        </p>
      )}
    </div>
  );
}
