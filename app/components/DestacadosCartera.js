import Logo from "./Logo";
import ValorSensible from "./ValorSensible";
import MiniBarras from "./MiniBarras";
import BadgeVariacionDiaria from "./BadgeVariacionDiaria";
import { fechaLocal } from "@/lib/fechas";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

function formatoMoneda(valor, divisa) {
  if (valor == null) return "—";
  return divisa === "USD" ? formatoUSD.format(valor) : formatoARS.format(valor);
}

function FilaDestacada({ etiqueta, tenencia, valor, colorValor, detalle }) {
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
      {!tenencia ? (
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>—</p>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <Logo ticker={tenencia.ticker} nombre={tenencia.activo} size={28} />
          <div className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {tenencia.activo}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums" style={{ color: colorValor || "var(--text-primary)" }}>
              {valor}
            </div>
            {detalle && (
              <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                <ValorSensible>{detalle}</ValorSensible>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaConteo({ etiqueta, cantidad, pct, color, items }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums" style={{ color }}>{cantidad}</span>
        {pct != null && (
          <span className="text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
            ({formatoPct.format(pct).replace(/^\+/, "")} de las posiciones)
          </span>
        )}
      </div>
      <MiniBarras items={items} color={color} />
    </div>
  );
}

function EtiquetaMovimiento({ tipo, pctAgregado }) {
  const esNueva = tipo === "nueva";
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-medium"
      style={{
        background: esNueva ? "var(--marca-suave)" : "var(--gridline)",
        color: esNueva ? "var(--marca)" : "var(--text-secondary)",
      }}
    >
      {esNueva ? "Nueva" : pctAgregado != null ? formatoPct.format(pctAgregado) : "Aumentó"}
    </span>
  );
}

function TarjetaNuevasEnCartera({ nuevasEnCartera }) {
  const { movimientos, fechaAnterior } = nuevasEnCartera || {};

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Novedades en la cartera</div>
      {!movimientos?.length ? (
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          {fechaAnterior
            ? `Sin compras nuevas desde el ${formatoFechaCorta.format(fechaLocal(fechaAnterior))}.`
            : "Necesitás al menos dos Portfolios importados para ver novedades."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {movimientos.map((t) => (
            <li key={t.clave} className="flex items-center gap-2">
              <Logo ticker={t.ticker} nombre={t.activo} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t.ticker || t.activo}
                  </span>
                  <EtiquetaMovimiento tipo={t.tipo} pctAgregado={t.pctAgregado} />
                </div>
                <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatoMoneda(t.precioActual, t.divisa)}
                </div>
              </div>
              <BadgeVariacionDiaria pct={t.variacionDiariaPct} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DestacadosCartera({ tenencias, nuevasEnCartera }) {
  const reales = tenencias.filter((t) => !t.esCash);
  if (!reales.length) return null;

  const mayorPeso = [...reales].sort((a, b) => (b.pctCartera ?? 0) - (a.pctCartera ?? 0))[0];
  const conRetorno = reales.filter((t) => t.retornoPct != null);
  const mejorPosicion = conRetorno.length ? [...conRetorno].sort((a, b) => b.retornoPct - a.retornoPct)[0] : null;

  const ganadoras = conRetorno.filter((t) => t.retornoPct >= 0);
  const perdedoras = conRetorno.filter((t) => t.retornoPct < 0);
  const pctGanadoras = conRetorno.length ? ganadoras.length / conRetorno.length : null;
  const pctPerdedoras = conRetorno.length ? perdedoras.length / conRetorno.length : null;
  const top5Ganadoras = [...ganadoras].sort((a, b) => b.retornoPct - a.retornoPct).slice(0, 5);
  const top5Perdedoras = [...perdedoras].sort((a, b) => a.retornoPct - b.retornoPct).slice(0, 5);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <FilaDestacada
          etiqueta="Mayor posición de la cartera"
          tenencia={mayorPeso}
          valor={mayorPeso?.pctCartera != null ? formatoPct.format(mayorPeso.pctCartera).replace(/^\+/, "") : "—"}
          detalle={mayorPeso?.valorActualARS != null ? formatoARS.format(mayorPeso.valorActualARS) : null}
        />
        <FilaDestacada
          etiqueta="Mejor retorno sobre costo"
          tenencia={mejorPosicion}
          valor={mejorPosicion ? formatoPct.format(mejorPosicion.retornoPct) : "—"}
          colorValor={mejorPosicion ? (mejorPosicion.retornoPct >= 0 ? "var(--good)" : "var(--bad)") : undefined}
          detalle={mejorPosicion?.gananciaNoRealizada != null ? formatoARS.format(mejorPosicion.gananciaNoRealizada) : null}
        />
      </div>
      <TarjetaNuevasEnCartera nuevasEnCartera={nuevasEnCartera} />
      <TarjetaConteo
        etiqueta="Posiciones en ganancia"
        cantidad={ganadoras.length}
        pct={pctGanadoras}
        color="var(--good)"
        items={top5Ganadoras}
      />
      <TarjetaConteo
        etiqueta="Posiciones en pérdida"
        cantidad={perdedoras.length}
        pct={pctPerdedoras}
        color="var(--bad)"
        items={top5Perdedoras}
      />
    </div>
  );
}
