"use client";

import { fechaLocal } from "@/lib/fechas";
import ValorSensible from "./ValorSensible";
import { ajusteFlujosRentaFija, factorPrecioPorClase, importeConDerechos } from "@/lib/calculos";
import { clasificar } from "@/lib/clasificacion";
import { sleeveDeTransaccion, balanceCaucion, SLEEVES } from "@/lib/sleeves";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Valor más cercano con fecha <= a la pedida, o el primero si no hay ninguno. */
function indiceDesde(puntos, iso) {
  let idx = -1;
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].fecha <= iso) idx = i;
  }
  return idx === -1 ? 0 : idx;
}

/** Última foto a la fecha o anterior (igual que desde): en días sin mercado
    (finde/feriado) vale el cierre previo, nunca una foto futura. Así una misma
    fecha siempre vale lo mismo esté en "desde" o en "hasta". */
function indiceHasta(puntos, iso) {
  let idx = -1;
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].fecha <= iso) idx = i;
  }
  return idx === -1 ? 0 : idx;
}

function puntosDe(snapshots) {
  return (snapshots || []).filter((p) => p.fecha && p.valorTotalARS != null);
}

/**
 * Medidor de ganancia total entre dos periodos elegidos (las fechas las maneja
 * el Panel). Usa los Portfolios importados con todo el historial: para cada
 * fecha elegida toma la última foto a esa fecha o anterior.
 * Netea los ingresos/retiros de fondos en (fotoDesde, fotoHasta] para no leer
 * un aporte como ganancia (ni un retiro como pérdida).
 */
export default function MedidorGanancia({ snapshots, desde, hasta, fondos, transacciones }) {
  const puntos = puntosDe(snapshots);

  if (!puntos.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Rendimiento por periodos</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
  }

  const periodoInvalido = desde && hasta && hasta < desde;

  let idxDesde = 0;
  let idxHasta = puntos.length - 1;
  let delta = null;
  let pct = null;
  let dias = null;
  let flujoFondos = 0;
  let caucionD = 0;
  let caucionH = 0;
  if (!periodoInvalido && desde && hasta) {
    idxDesde = indiceDesde(puntos, desde);
    idxHasta = indiceHasta(puntos, hasta);
    if (idxDesde > idxHasta) idxHasta = idxDesde;
    const vDesde = puntos[idxDesde].valorTotalARS;
    const vHasta = puntos[idxHasta].valorTotalARS;
    // Aportes/retiros externos entre las fotos reales (no las fechas pedidas):
    // un ingreso sube el total sin ser rendimiento.
    const fD = puntos[idxDesde].fecha;
    const fH = puntos[idxHasta].fecha;
    flujoFondos = (fondos || []).reduce((acc, f) => {
      if (!f.fecha || f.fecha <= fD || f.fecha > fH || !(f.monto > 0)) return acc;
      return acc + (f.tipo === "retiro" ? -f.monto : f.monto);
    }, 0);
    // Caución colocada y no vencida a cada foto: salió de caja pero sigue
    // siendo patrimonio — sin esto una colocación se leería como pérdida.
    caucionD = balanceCaucion(transacciones, fD);
    caucionH = balanceCaucion(transacciones, fH);
    delta = (vHasta + caucionH - vDesde - caucionD) - flujoFondos;
    if (vDesde > 0) pct = (delta / vDesde) * 100;
    const f1 = fechaLocal(puntos[idxDesde].fecha);
    const f2 = fechaLocal(puntos[idxHasta].fecha);
    dias = Math.round((f2 - f1) / 86400000);
  }

  const color = delta == null ? "var(--text-muted)" : delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-muted)";
  const signo = delta != null && delta > 0 ? "+" : "";

  const baja = Math.min(puntos[idxDesde]?.valorTotalARS ?? 0, puntos[idxHasta]?.valorTotalARS ?? 0);
  const alta = Math.max(puntos[idxDesde]?.valorTotalARS ?? 0, puntos[idxHasta]?.valorTotalARS ?? 0);
  const span = alta - baja;
  const pctDesde = span === 0 ? 0 : ((puntos[idxDesde].valorTotalARS - baja) / span) * 100;
  const pctHasta = span === 0 ? 100 : ((puntos[idxHasta].valorTotalARS - baja) / span) * 100;
  const minPct = Math.min(pctDesde, pctHasta);
  const maxPct = Math.max(pctDesde, pctHasta);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {periodoInvalido ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
        </p>
      ) : delta != null ? (
        <div>
          <div className="flex items-baseline gap-2" style={{ color }}>
            <span className="text-xl font-semibold tabular-nums">
              {pct != null ? `${signo}${(pct || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              <ValorSensible>{delta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(delta))}`}</ValorSensible>
              {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
            </span>
          </div>

          <div className="mt-2">
            <div className="relative h-1.5 w-full rounded-full" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div
                className="absolute bottom-0 top-0 rounded-full"
                style={{ left: `${minPct}%`, width: `${Math.max(1, maxPct - minPct)}%`, background: color, opacity: 0.7 }}
              />
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>
                <ValorSensible>{formatoFecha.format(fechaLocal(puntos[idxDesde].fecha))} · {formatoARS.format(puntos[idxDesde].valorTotalARS)}</ValorSensible>
              </span>
              <span>
                <ValorSensible>{formatoFecha.format(fechaLocal(puntos[idxHasta].fecha))} · {formatoARS.format(puntos[idxHasta].valorTotalARS)}</ValorSensible>
              </span>
            </div>
            {flujoFondos !== 0 && (
              <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                Neteados <ValorSensible>{`${formatoARS.format(Math.abs(flujoFondos))}`}</ValorSensible> por{" "}
                {flujoFondos > 0 ? "aportes" : "retiros"} en el periodo. Sin netear:{" "}
                <ValorSensible>{formatoARS.format(puntos[idxHasta].valorTotalARS - puntos[idxDesde].valorTotalARS)}</ValorSensible>.
              </div>
            )}
            {(caucionD !== 0 || caucionH !== 0) && (
              <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                Incluye caución colocada: <ValorSensible>{formatoARS.format(caucionD)}</ValorSensible>
                {" → "}
                <ValorSensible>{formatoARS.format(caucionH)}</ValorSensible>.
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Elegí el periodo para ver la ganancia.</p>
      )}
    </div>
  );
}

/**
 * Ganancia de trading en el periodo elegido: solo el sleeve trading (la
 * historia previa al corte autónomo es toda trading). Netea los flujos a
 * renta fija (compras de bonos) y los aportes/retiros a sleeves variables
 * para no leerlos como rendimiento. El largo plazo se muestra como detalle.
 */
export function GananciaTrading({ snapshots, transacciones, fondos, traspasos, desde, hasta, serieLargo, serieTrading, serieEfectivoTrading, serieEfectivoLargo }) {
  const puntos = puntosDe(snapshots);

  if (puntos.length < 1) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
  }

  const periodoInvalido = desde && hasta && hasta < desde;

  let varD = null;
  let flujoRF = 0;
  let varDelta = null;
  let dias = null;
  let fotoDesde = null;
  let fotoHasta = null;
  if (!periodoInvalido && desde && hasta) {
    const idxDesde = indiceDesde(puntos, desde);
    const idxHasta = Math.max(indiceHasta(puntos, hasta), idxDesde);
    const pD = puntos[idxDesde];
    const pH = puntos[idxHasta];
    fotoDesde = pD.fecha;
    fotoHasta = pH.fecha;
    if (pD.rentaFijaARS != null && pH.rentaFijaARS != null) {
      const vD = pD.valorTotalARS;
      // La caución colocada vive en la parte variable con efectivo.
      const bD = balanceCaucion(transacciones, pD.fecha);
      const bH = balanceCaucion(transacciones, pH.fecha);
      varD = vD - pD.rentaFijaARS - (pD.efectivoParaRF ?? 0) + bD;
      const varH = pH.valorTotalARS - pH.rentaFijaARS - (pH.efectivoParaRF ?? 0) + bH;
      const flujo = ajusteFlujosRentaFija(transacciones, fondos, pD.fecha, pH.fecha);
      flujoRF = flujo || 0;
      varDelta = (varH - varD) + flujoRF;
      const f1 = fechaLocal(pD.fecha);
      const f2 = fechaLocal(pH.fecha);
      dias = Math.round((f2 - f1) / 86400000);
    }
  }

  // Detalle por estrategia: el largo plazo nace en el corte autónomo, así que
  // su ganancia del periodo sale de su serie de valor invertido (fotos) menos
  // el neto de compras/ventas de sus lotes en la ventana.
  let largoDelta = null;
  let largoValorD = 0;
  let largoValorH = 0;
  let flujoLotesLargo = 0;
  let fondosLargo = 0;
  let fondosVar = 0;
  if (!periodoInvalido && varDelta != null && fotoDesde && fotoHasta) {
    // Aportes/retiros a sleeves variables en la ventana: son capital externo,
    // no rendimiento (los de RF ya los netea flujoRF).
    fondosVar = (fondos || []).reduce((acc, f) => {
      if (!f.fecha || f.fecha <= fotoDesde || f.fecha > fotoHasta || !(f.monto > 0)) return acc;
      const d = f.destino || SLEEVES.RENTA_FIJA;
      if (d !== SLEEVES.TRADING && d !== SLEEVES.LARGO) return acc;
      return acc + (f.tipo === "retiro" ? -f.monto : f.monto);
    }, 0);
    if ((serieLargo || []).length) {
      const valorSerieEn = (fecha) => {
        let v = 0;
        for (const p of serieLargo) {
          if (p.fecha <= fecha) v = p.valor ?? 0;
        }
        return v;
      };
      largoValorD = valorSerieEn(fotoDesde);
      largoValorH = valorSerieEn(fotoHasta);
      for (const t of transacciones || []) {
        if (!t.fecha || t.fecha <= fotoDesde || t.fecha > fotoHasta) continue;
        if (sleeveDeTransaccion(t) !== SLEEVES.LARGO) continue;
        const op = (t.operacion || "").toUpperCase();
        const esC = op.includes("COMPRA");
        const esV = op.includes("VENTA");
        if (!esC && !esV) continue;
        const { claseActivo } = clasificar({ activo: t.activo, ticker: t.ticker, operacion: t.operacion });
        const factor = factorPrecioPorClase(claseActivo);
        const monto = t.importeARS != null
          ? Math.abs(t.importeARS)
          : (!op.includes("PARIDAD") && (t.divisa || "ARS") === "ARS" && t.precio != null && t.cantidad != null
            ? importeConDerechos(Math.abs(t.cantidad * t.precio) * factor, esC)
            : null);
        if (monto == null) continue;
        flujoLotesLargo += esC ? monto : -monto;
      }
      fondosLargo = (fondos || []).reduce((acc, f) => {
        if (!f.fecha || f.fecha <= fotoDesde || f.fecha > fotoHasta || !(f.monto > 0)) return acc;
        if ((f.destino || SLEEVES.RENTA_FIJA) !== SLEEVES.LARGO) return acc;
        return acc + (f.tipo === "retiro" ? -f.monto : f.monto);
      }, 0);
      largoDelta = (largoValorH - largoValorD) - flujoLotesLargo;
    }
  }
  // Trading = variable neta menos largo. Sin serie de largo, todo es trading.
  // Si hay ledger autónomo con caja por sleeve, se mide trading directo por
  // posiciones+caja y se netean tanto fondos externos como traspasos internos:
  // mover plata de trading a RF/largo (o traerla de vuelta) no cuenta como
  // ganancia ni como pérdida, en ninguna dirección.
  let tradingDeltaFallback = null;
  let tradingBaseFallback = null;
  {
    const varNeta = varDelta != null ? varDelta - fondosVar : null;
    tradingDeltaFallback = varNeta != null ? varNeta - (largoDelta ?? 0) : null;
    tradingBaseFallback = varD != null ? varD - largoValorD : null;
  }
  let tradingDelta = tradingDeltaFallback;
  let tradingBase = tradingBaseFallback;
  let tradingPct = tradingBase > 0 && tradingDelta != null ? tradingDelta / tradingBase : null;
  let traspasoNetTrading = 0;
  let fondosNetTradingDirect = 0;
  if (fotoDesde && fotoHasta && serieTrading && serieEfectivoTrading) {
    const valorEn = (serie, fecha) => {
      let v = 0;
      for (const p of serie || []) if (p.fecha <= fecha) v = p.valor ?? 0;
      return v;
    };
    const posD = valorEn(serieTrading, fotoDesde);
    const posH = valorEn(serieTrading, fotoHasta);
    const cashD = valorEn(serieEfectivoTrading, fotoDesde);
    const cashH = valorEn(serieEfectivoTrading, fotoHasta);
    const valueD = posD + cashD;
    const valueH = posH + cashH;
    fondosNetTradingDirect = (fondos || []).reduce((acc, f) => {
      if (!f.fecha || f.fecha <= fotoDesde || f.fecha > fotoHasta || !(f.monto > 0)) return acc;
      if ((f.destino || SLEEVES.RENTA_FIJA) !== SLEEVES.TRADING) return acc;
      return acc + (f.tipo === "retiro" ? -f.monto : f.monto);
    }, 0);
    traspasoNetTrading = (traspasos || []).reduce((acc, t) => {
      if (!t.fecha || t.fecha <= fotoDesde || t.fecha > fotoHasta || !(t.monto > 0)) return acc;
      if (t.hacia === SLEEVES.TRADING) acc += t.monto;
      if (t.desde === SLEEVES.TRADING) acc -= t.monto;
      return acc;
    }, 0);
    const directDelta = (valueH - valueD) - fondosNetTradingDirect - traspasoNetTrading;
    // Solo pisa el fallback cuando el periodo toca el ledger autónomo (desde
    // el corte en adelante). Para periodos históricos sin caja por sleeve,
    // el fallback basado en snapshots sigue siendo el correcto.
    const tocaLedger = serieEfectivoTrading.some((p) => p.fecha >= fotoDesde && p.fecha <= fotoHasta) || serieTrading.some((p) => p.fecha >= fotoDesde);
    if (tocaLedger || valueD !== 0 || valueH !== 0) {
      tradingDelta = directDelta;
      tradingBase = valueD;
      tradingPct = tradingBase > 0 && tradingDelta != null ? tradingDelta / tradingBase : null;
    }
  }
  const color = tradingDelta == null ? "var(--text-muted)" : tradingDelta >= 0 ? "var(--good)" : "var(--bad)";
  const signo = tradingDelta != null && tradingDelta > 0 ? "+" : "";
  const colorLargo = largoDelta == null ? "var(--text-muted)" : largoDelta >= 0 ? "var(--good)" : "var(--bad)";
  const hayLargo = largoValorD !== 0 || largoValorH !== 0 || flujoLotesLargo !== 0 || fondosLargo !== 0;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {periodoInvalido ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.
        </p>
      ) : varDelta != null ? (
        <div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Trading
          </div>
          <div className="mt-1 flex items-baseline gap-2" style={{ color }}>
            <span className="text-xl font-semibold tabular-nums">
              {tradingPct != null ? `${signo}${(tradingPct * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              <ValorSensible>{tradingDelta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(tradingDelta))}`}</ValorSensible>
              {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
            </span>
          </div>
          {(tradingBase != null && tradingDelta != null) && (
            <div className="mt-2 flex flex-wrap items-baseline gap-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              <ValorSensible>{formatoARS.format(tradingBase)}</ValorSensible>
              <span aria-hidden="true">→</span>
              <ValorSensible>{formatoARS.format(tradingBase + tradingDelta)}</ValorSensible>
            </div>
          )}
          {(fondosVar !== 0 || traspasoNetTrading !== 0) && (
            <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {fondosVar !== 0 && (
                <>Neteados <ValorSensible>{`${formatoARS.format(Math.abs(fondosVar))}`}</ValorSensible> por {fondosVar > 0 ? "aportes a" : "retiros de"} trading/largo en el periodo.</>
              )}
              {fondosVar !== 0 && traspasoNetTrading !== 0 && <> · </>}
              {traspasoNetTrading !== 0 && (
                <>Traspasos netos a trading <ValorSensible>{`${traspasoNetTrading > 0 ? "+" : "−"}${formatoARS.format(Math.abs(traspasoNetTrading))}`}</ValorSensible> neteados (no cuentan como ganancia).</>
              )}
            </div>
          )}
          {hayLargo && largoDelta != null && (
            <div className="mt-2 border-t pt-2 text-xs tabular-nums" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <span>Largo plazo</span>
                <span style={{ color: colorLargo }}>
                  <ValorSensible>{`${largoDelta > 0 ? "+" : largoDelta < 0 ? "−" : ""}${formatoARS.format(Math.abs(largoDelta))}`}</ValorSensible>
                </span>
              </div>
              <div className="mt-1">
                Invertido largo <ValorSensible>{formatoARS.format(largoValorD)}</ValorSensible>
                {" → "}
                <ValorSensible>{formatoARS.format(largoValorH)}</ValorSensible>
                {" · "}neto compras/ventas <ValorSensible>{formatoARS.format(flujoLotesLargo)}</ValorSensible>
                {fondosLargo !== 0 && (
                  <>
                    {" · "}fondos a largo <ValorSensible>{formatoARS.format(fondosLargo)}</ValorSensible>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {puntos.some((p) => p.rentaFijaARS == null)
            ? "Faltan datos de renta fija para este periodo."
            : "Elegí el periodo para ver la ganancia."}
        </p>
      )}
    </div>
  );
}

/**
 * Ganancia de un sleeve (trading / largo plazo / renta fija) con el mismo
 * criterio autónomo: posiciones + PESOS del sleeve (+ caución si es RF),
 * neteando fondos externos y traspasos internos en la ventana — mover plata
 * entre sleeves no cuenta como ganancia en ninguna dirección.
 */
export function GananciaSleeve({ sleeve, snapshots, transacciones, fondos, traspasos, desde, hasta, serieValor, serieEfectivo, fechaCorteSleeves }) {
  const puntos = puntosDe(snapshots);
  if (!puntos.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Necesitás al menos dos Portfolios importados.</p>
      </div>
    );
  }
  const periodoInvalido = desde && hasta && hasta < desde;
  let delta = null;
  let pct = null;
  let dias = null;
  let base = null;
  let brutoH = null;
  let fotoDesde = null;
  let fotoHasta = null;
  let fondosNet = 0;
  let traspasoNet = 0;
  let flujoRF = 0;
  if (!periodoInvalido && desde && hasta) {
    const idxDesde = indiceDesde(puntos, desde);
    const idxHasta = Math.max(indiceHasta(puntos, hasta), idxDesde);
    const pD = puntos[idxDesde];
    const pH = puntos[idxHasta];
    fotoDesde = pD.fecha;
    fotoHasta = pH.fecha;
    const f1 = fechaLocal(pD.fecha);
    const f2 = fechaLocal(pH.fecha);
    dias = Math.round((f2 - f1) / 86400000);
    const valorSleeveEn = (fecha) => {
      if (!fecha) return 0;
      if (fechaCorteSleeves && fecha < fechaCorteSleeves) {
        const idx = indiceHasta(puntos, fecha);
        const p = puntos[idx];
        if (!p) return 0;
        if (sleeve === SLEEVES.RENTA_FIJA) return (p.rentaFijaARS ?? 0) + balanceCaucion(transacciones, fecha);
        if (sleeve === SLEEVES.LARGO) return 0;
        const b = balanceCaucion(transacciones, fecha);
        return (p.valorTotalARS - (p.rentaFijaARS ?? 0) - (p.efectivoParaRF ?? 0) + b);
      }
      let pos = 0;
      for (const q of serieValor || []) if (q.fecha <= fecha) pos = q.valor ?? 0;
      let cash = 0;
      for (const q of serieEfectivo || []) if (q.fecha <= fecha) cash = q.valor ?? 0;
      const cau = sleeve === SLEEVES.RENTA_FIJA ? balanceCaucion(transacciones, fecha) : 0;
      return pos + cash + cau;
    };
    base = valorSleeveEn(fotoDesde);
    let valueH = valorSleeveEn(fotoHasta);
    brutoH = valueH;
    // Si arranca en 0 (ej. RF antes de existir), tomar el primer valor >0 del periodo
    if (base === 0 && valueH > 0) {
      for (const p of puntos) {
        if (p.fecha < fotoDesde || p.fecha > fotoHasta) continue;
        const v = valorSleeveEn(p.fecha);
        if (v > 0) {
          fotoDesde = p.fecha;
          base = v;
          dias = Math.round((fechaLocal(fotoHasta) - fechaLocal(fotoDesde)) / 86400000);
          break;
        }
      }
    }
    // Para "Máximo", evitar el cash inicial distorsionado (17.5M) usando el corte
    // autónomo como base; así no se pierde el S30S6 pero tampoco se arrastra
    // el periodo 08-11→08-14 con RF=0.
    // Para "Máximo" en RF, evitar 0 → X: usar primer RF (08-14) para contar S30S6.
    // Trading sí cuenta desde el inicio (08-11) con todo el cash, neteando el flujo a RF.
    if (desde === puntos[0]?.fecha && sleeve === SLEEVES.RENTA_FIJA) {
      let firstRF = null;
      for (const p of puntos) if ((p.rentaFijaARS ?? 0) > 0) { firstRF = p.fecha; break; }
      if (firstRF && fotoDesde < firstRF) {
        fotoDesde = firstRF;
        base = valorSleeveEn(fotoDesde);
        dias = Math.round((fechaLocal(fotoHasta) - fechaLocal(fotoDesde)) / 86400000);
      }
    }

    fondosNet = (fondos || []).reduce((acc, f) => {
      if (!f.fecha || f.fecha <= fotoDesde || f.fecha > fotoHasta || !(f.monto > 0)) return acc;
      if ((f.destino || SLEEVES.RENTA_FIJA) !== sleeve) return acc;
      return acc + (f.tipo === "retiro" ? -f.monto : f.monto);
    }, 0);
    traspasoNet = (traspasos || []).reduce((acc, t) => {
      if (!t.fecha || t.fecha <= fotoDesde || t.fecha > fotoHasta || !(t.monto > 0)) return acc;
      if (t.hacia === sleeve) acc += t.monto;
      if (t.desde === sleeve) acc -= t.monto;
      return acc;
    }, 0);
    flujoRF = ajusteFlujosRentaFija(transacciones, fondos, fotoDesde, fotoHasta) || 0;
    const ajusteRF = sleeve === SLEEVES.TRADING ? flujoRF : sleeve === SLEEVES.RENTA_FIJA ? -flujoRF : 0;
    delta = (valueH - base) - fondosNet - traspasoNet + ajusteRF;
    pct = base > 0 && delta != null ? delta / base : null;
  }
  const etiqueta = sleeve === SLEEVES.TRADING ? "Trading" : sleeve === SLEEVES.LARGO ? "Largo plazo" : "Renta fija";
  const color = delta == null ? "var(--text-muted)" : delta >= 0 ? "var(--good)" : "var(--bad)";
  const signo = delta != null && delta > 0 ? "+" : "";
  const faltaRF = sleeve === SLEEVES.RENTA_FIJA && puntos.some((p) => p.rentaFijaARS == null);
  return (
    <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      {periodoInvalido ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>La fecha “hasta” es anterior a la de “desde” — el periodo no es válido.</p>
      ) : delta != null ? (
        <div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{etiqueta}</div>
          <div className="mt-1 flex items-baseline gap-2" style={{ color }}>
            <span className="text-xl font-semibold tabular-nums">
              {pct != null ? `${signo}${(pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—"}
            </span>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
              <ValorSensible>{delta === 0 ? "Sin variación" : `${signo}${formatoARS.format(Math.abs(delta))}`}</ValorSensible>
              {dias != null && <span style={{ color: "var(--text-muted)" }}> · {dias} días</span>}
            </span>
          </div>
          {(base != null && brutoH != null) && (
            <div className="mt-2 flex flex-wrap items-baseline gap-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              <ValorSensible>{formatoARS.format(base)}</ValorSensible>
              <span aria-hidden="true">→</span>
              <ValorSensible>{formatoARS.format(brutoH)}</ValorSensible>
            </div>
          )}
          {(fondosNet !== 0 || traspasoNet !== 0) && (
            <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {fondosNet !== 0 && <>Neteados <ValorSensible>{formatoARS.format(Math.abs(fondosNet))}</ValorSensible> por {fondosNet > 0 ? "aportes" : "retiros"} a {etiqueta.toLowerCase()} en el periodo.</>}
              {fondosNet !== 0 && traspasoNet !== 0 && <> · </>}
              {traspasoNet !== 0 && <>Traspasos netos a {etiqueta.toLowerCase()} <ValorSensible>{`${traspasoNet > 0 ? "+" : "−"}${formatoARS.format(Math.abs(traspasoNet))}`}</ValorSensible> neteados.</>}
            </div>
          )}
          {flujoRF !== 0 && (
            <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              Flujo a renta fija <ValorSensible>{formatoARS.format(Math.abs(flujoRF))}</ValorSensible> neteado.
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {faltaRF ? "Faltan datos de renta fija para este periodo." : "Elegí el periodo para ver la ganancia."}
        </p>
      )}
    </div>
  );
}
