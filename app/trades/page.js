import { leerTransacciones, leerPortafolioHistorial, leerClasificaciones, leerNotasTrades, leerCierresDiarios, leerCierresManuales } from "@/lib/storage";
import { resolverTickersConPortafolio, calcularTrades } from "@/lib/calculos";
import { obtenerPrecios } from "@/lib/precios";
import { aISO } from "@/lib/accesosRapidosFecha";
import { SLEEVES } from "@/lib/sleeves";
import { TICKERS_NO_MERCADO } from "@/lib/clasificacion";
import TablaTrades from "@/app/components/TablaTrades";
import FiltroFechasTrades from "@/app/components/FiltroFechasTrades";
import AutoRefreshTrades from "@/app/components/AutoRefreshTrades";
import ValorSensible from "@/app/components/ValorSensible";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function resColor(valor) {
  return valor == null || valor === 0 ? "var(--text-muted)" : valor > 0 ? "var(--good)" : "var(--bad)";
}

function signo(valor) {
  return valor == null || valor === 0 ? "" : valor > 0 ? "+" : "−";
}

export default async function TradesPage({ searchParams }) {
  const sp = await searchParams;
  const desde = sp?.desde || null;
  const hasta = sp?.hasta || null;
  const [transaccionesRaw, portafolioHistorial, overrides, notasTrades, cierresDiarios, cierresManuales] = await Promise.all([
    leerTransacciones(),
    leerPortafolioHistorial(),
    leerClasificaciones(),
    leerNotasTrades(),
    leerCierresDiarios(),
    leerCierresManuales(),
  ]);
  const transacciones = resolverTickersConPortafolio(transaccionesRaw, portafolioHistorial);
  const tickersUnicos = Array.from(new Set(transacciones.map((t) => t.ticker).filter(Boolean))).filter(
    (t) => !TICKERS_NO_MERCADO.has(String(t).toUpperCase())
  );
  const precios = tickersUnicos.length ? await obtenerPrecios(tickersUnicos) : new Map();
  // Sin cotización viva: último cierre capturado. Un cierre guardado a mano hoy
  // pisa el vivo aunque haya cotización.
  {
    const fechasDesc = Object.keys(cierresDiarios).sort().reverse();
    function ultimoCierre(ticker) {
      for (const f of fechasDesc) {
        const p = cierresDiarios[f]?.[ticker];
        if (p != null && p > 0) return p;
      }
      return null;
    }
    for (const tk of tickersUnicos) {
      if (precios.get(tk)) continue;
      const p = ultimoCierre(tk);
      if (p != null) precios.set(tk, { precio: p, ultimo: p, moneda: "ARS", variacionDiariaPct: null });
    }
    const hoyISOTrades = aISO(new Date());
    const manualesHoy = cierresManuales[hoyISOTrades];
    if (manualesHoy) {
      for (const tk of tickersUnicos) {
        const pHoy = manualesHoy[tk];
        if (pHoy != null && pHoy > 0) precios.set(tk, { precio: pHoy, ultimo: pHoy, moneda: "ARS", variacionDiariaPct: null, cierreManual: true });
      }
    }
  }
  const { cerrados: cerradosTodos, abiertos, resumen } = calcularTrades(transacciones, overrides, { sleeve: SLEEVES.TRADING, precios });
  const fechasVentas = cerradosTodos.map((t) => t.fechaVenta).filter(Boolean).sort();
  const fechasTrans = transacciones.map((t) => t.fecha).filter(Boolean).sort();
  const minFecha = fechasVentas[0] || fechasTrans[0] || null;
  const hoyISO = aISO(new Date());
  const maxFecha = fechasVentas[fechasVentas.length - 1] || hoyISO;
  const dentroRango = (t) => {
    const f = t.fechaVenta;
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  };
  const cerrados = desde || hasta ? cerradosTodos.filter(dentroRango) : cerradosTodos;
  const ganadores = cerrados.filter((t) => t.resultado > 0).length;
  const perdedores = cerrados.filter((t) => t.resultado < 0).length;
  const total = ganadores + perdedores;
  const winRate = total > 0 ? ganadores / total : null;
  const resultadoTotal = cerrados.filter((t) => t.resultado != null).reduce((acc, t) => acc + t.resultado, 0);
  const gananciaPromedio =
    ganadores > 0 ? cerrados.filter((t) => t.resultado > 0).reduce((acc, t) => acc + t.resultado, 0) / ganadores : null;
  const perdidaPromedio =
    perdedores > 0 ? cerrados.filter((t) => t.resultado < 0).reduce((acc, t) => acc + t.resultado, 0) / perdedores : null;
  const totalGanado = cerrados.filter((t) => t.resultado > 0).reduce((acc, t) => acc + t.resultado, 0);
  const totalPerdido = cerrados.filter((t) => t.resultado < 0).reduce((acc, t) => acc + t.resultado, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <AutoRefreshTrades intervaloMs={30_000} />
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Trades
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Solo estrategia trading. Cada trade es una compra con su venta apareada (FIFO: la venta consume primero
          las compras más viejas). Si una venta consume dos compras, cuenta como dos trades. Las posiciones abiertas
          se muestran valuadas como si se cerraran ahora (precio en vivo).
        </p>
      </div>

      <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <div className="border-b px-3 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <FiltroFechasTrades desde={desde} hasta={hasta} minFecha={minFecha} maxFecha={maxFecha} embedded />
        </div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Trades cerrados</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            <span>{cerrados.length}</span>
            {(desde || hasta) && (
              <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                de {cerradosTodos.length}
              </span>
            )}
            <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: resColor(resultadoTotal) }}>
              <ValorSensible>{signo(resultadoTotal)}{formatoARS.format(Math.abs(resultadoTotal))}</ValorSensible>
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Resultado realizado</div>
          <div className="mt-2 flex items-center gap-2 border-t pt-2 text-xs" style={{ borderColor: "var(--border)" }}>
            <span style={{ color: "var(--text-muted)" }}>Posiciones abiertas</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{resumen.abiertas}</span>
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Ganadores / Perdedores</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--good)" }}>{ganadores}</span>
            {" / "}
            <span style={{ color: "var(--bad)" }}>{perdedores}</span>
            {winRate != null && (
              <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-muted)" }}>
                ({(winRate * 100).toFixed(0)}%)
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Ganancia prom. por trade</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--good)" }}>
            {gananciaPromedio != null ? (
              <ValorSensible>+{formatoARS.format(gananciaPromedio)}</ValorSensible>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Pérdida prom. por trade</div>
          <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--bad)" }}>
            {perdidaPromedio != null ? (
              <ValorSensible>−{formatoARS.format(Math.abs(perdidaPromedio))}</ValorSensible>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total ganado / perdido</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-semibold tabular-nums">
            <span style={{ color: "var(--good)" }}>
              <ValorSensible>{totalGanado > 0 ? `+${formatoARS.format(totalGanado)}` : "—"}</ValorSensible>
            </span>
            <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "var(--bad)" }}>
              <ValorSensible>{totalPerdido < 0 ? `−${formatoARS.format(Math.abs(totalPerdido))}` : "—"}</ValorSensible>
            </span>
          </div>
        </div>
          </div>
        </div>
      </div>

      <TablaTrades cerrados={cerrados} abiertos={abiertos} costoAbierto={resumen.costoAbierto} notasTrades={notasTrades} />
    </main>
  );
}
