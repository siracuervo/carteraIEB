import ValorSensible from "./ValorSensible";
import ValorEnDolarOficial from "./ValorEnDolarOficial";
import BotonPrivacidadTotal from "./BotonPrivacidadTotal";
import EvolucionPatrimonio from "./EvolucionPatrimonio";
import PanelEvolucionPatrimonio from "./PanelEvolucionPatrimonio";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoProporcion = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
// Fecha "de hoy" en hora argentina: el server corre en UTC y de 21:00 a 24:00 ART
// mostraría la fecha de mañana.
const formatoFechaCortaART = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

const CLASE_TARJETA = "flex flex-col justify-center rounded-lg border p-3";

export default function ResumenCartera({ resumen, tipoCambioCCL, evolucion, evolucionSemana, semanasEvolucion, serieEvolucion, snapshots, transacciones, fondos, traspasos, serieLargo, serieTrading, serieEfectivoTrading, serieEfectivoLargo, serieRentaFija, serieEfectivoRentaFija, serieCostoTrading, serieCostoLargo, serieCostoRentaFija, fechaCorteSleeves, efectivoSleeves, tenencias }) {
  const {
    valorTotalARS,
    dividendosTotalARS,
    conversionIncompleta,
    composicion,
  } = resumen;
  const hoy = formatoFechaCortaART.format(new Date());
  const valorTradingARS = (() => {
    if (!tenencias?.length) return null;
    // Suma posiciones + caja de trading (las filas de PESOS · Trading ya vienen con sleeve)
    let total = 0;
    let hay = false;
    for (const t of tenencias) {
      if (t.sleeve !== "trading") continue;
      if (t.valorActualARS == null) continue;
      hay = true;
      total += t.valorActualARS;
    }
    return hay ? total : null;
  })();
  const valorRentaFijaARS = (() => {
    if (!tenencias?.length) return null;
    let total = 0;
    let hay = false;
    for (const t of tenencias) {
      if (t.sleeve !== "rentaFija") continue;
      if (t.valorActualARS == null) continue;
      hay = true;
      total += t.valorActualARS;
    }
    return hay ? total : null;
  })();

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-1 flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <div className={`${CLASE_TARJETA} p-2 lg:min-w-56`} style={{ borderColor: "var(--marca)", background: "var(--marca-suave)" }}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <div className="text-sm font-semibold" style={{ color: "var(--marca)" }}>Valor de Portafolio</div>
              <BotonPrivacidadTotal />
              <div className="text-xs font-semibold tabular-nums sm:text-sm" style={{ color: "var(--text-primary)" }}>{hoy}</div>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--marca)" }}>
              <ValorSensible ambito="total">{formatoARS.format(valorTotalARS)}</ValorSensible>
            </div>
            <div className="text-xs">
              <ValorSensible ambito="total">
                <ValorEnDolarOficial valorARS={valorTotalARS} />
              </ValorSensible>
            </div>
          </div>

          <div className={`${CLASE_TARJETA} p-2 lg:min-w-56`} style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Valor de Trading</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl" style={{ color: "var(--text-primary)" }}>
              <ValorSensible ambito="total">{valorTradingARS != null ? formatoARS.format(valorTradingARS) : "—"}</ValorSensible>
            </div>
            <div className="text-xs">
              <ValorSensible ambito="total">
                <ValorEnDolarOficial valorARS={valorTradingARS} />
              </ValorSensible>
            </div>
            {valorRentaFijaARS != null && (
              <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Renta fija</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  <ValorSensible ambito="total">{formatoARS.format(valorRentaFijaARS)}</ValorSensible>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1 flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <div className={`${CLASE_TARJETA} p-2`} style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Composición de Portafolio</div>
            <div
              className="mt-1.5 flex items-start justify-between gap-2 sm:gap-3"
              title="Proporciones sobre el valor en ARS de las posiciones valuadas"
            >
              {(composicion ?? []).map((grupo) => (
                <div key={grupo.etiqueta} className="min-w-0 flex-1 text-center">
                  <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{grupo.etiqueta}</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    <ValorSensible>{formatoProporcion.format(grupo.pct)}</ValorSensible>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <EvolucionPatrimonio evolucion={evolucion} evolucionSemana={evolucionSemana} semanasEvolucion={semanasEvolucion} />
          </div>
        </div>
        <div className="col-span-1 min-w-0 sm:col-span-2 lg:col-span-1">
          <PanelEvolucionPatrimonio serie={serieEvolucion} snapshots={snapshots} transacciones={transacciones} fondos={fondos} traspasos={traspasos} serieLargo={serieLargo} serieTrading={serieTrading} serieEfectivoTrading={serieEfectivoTrading} serieEfectivoLargo={serieEfectivoLargo} serieRentaFija={serieRentaFija} serieEfectivoRentaFija={serieEfectivoRentaFija} serieCostoTrading={serieCostoTrading} serieCostoLargo={serieCostoLargo} serieCostoRentaFija={serieCostoRentaFija} fechaCorteSleeves={fechaCorteSleeves} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {tipoCambioCCL && <span>Dólar CCL usado: {formatoARS.format(tipoCambioCCL)}</span>}
        {dividendosTotalARS > 0 && (
          <span>
            Dividendos cobrados: <ValorSensible>{formatoARS.format(dividendosTotalARS)}</ValorSensible>
          </span>
        )}
        {conversionIncompleta && (
          <span style={{ color: "var(--bad)" }}>
            Hay activos en USD sin poder convertir a ARS (no se pudo obtener el tipo de cambio) — el total puede estar subestimado.
          </span>
        )}
      </div>
    </div>
  );
}
