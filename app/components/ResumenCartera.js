import ValorSensible from "./ValorSensible";
import ValorEnDolarOficial from "./ValorEnDolarOficial";
import EvolucionPatrimonio from "./EvolucionPatrimonio";
import PanelEvolucionPatrimonio from "./PanelEvolucionPatrimonio";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoProporcion = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const CLASE_TARJETA = "flex flex-col justify-center rounded-lg border p-3";

export default function ResumenCartera({ resumen, tipoCambioCCL, evolucion, evolucionSemana, semanasEvolucion, serieEvolucion, snapshots, transacciones, fondos, traspasos, serieLargo, serieTrading, serieEfectivoTrading, serieEfectivoLargo, serieRentaFija, serieEfectivoRentaFija, serieCostoTrading, serieCostoLargo, serieCostoRentaFija, fechaCorteSleeves }) {
  const {
    valorTotalARS,
    dividendosTotalARS,
    conversionIncompleta,
    composicion,
  } = resumen;
  const hoy = formatoFechaCorta.format(new Date());

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-1 flex h-full flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <div className={`${CLASE_TARJETA} flex-1 p-2 sm:p-3 lg:min-w-56`} style={{ borderColor: "var(--marca)", background: "var(--marca-suave)" }}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <div className="text-sm font-semibold" style={{ color: "var(--marca)" }}>Valor de cartera</div>
              <div className="text-xs font-semibold tabular-nums sm:text-sm" style={{ color: "var(--text-primary)" }}>{hoy}</div>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--marca)" }}>
              <ValorSensible>{formatoARS.format(valorTotalARS)}</ValorSensible>
            </div>
            <ValorEnDolarOficial valorARS={valorTotalARS} />
          </div>

          <div className={`${CLASE_TARJETA} flex-1 p-2 sm:p-3 lg:min-w-56`} style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div
              className="flex items-start justify-between gap-2 sm:gap-3"
              title="Proporciones sobre el valor en ARS de las posiciones valuadas"
            >
              {(composicion ?? []).map((grupo) => (
                <div key={grupo.etiqueta} className="min-w-0 flex-1">
                  <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{grupo.etiqueta}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl" style={{ color: "var(--text-primary)" }}>
                    <ValorSensible>{formatoProporcion.format(grupo.pct)}</ValorSensible>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-1 sm:col-span-2 lg:col-span-1">
          <EvolucionPatrimonio evolucion={evolucion} evolucionSemana={evolucionSemana} semanasEvolucion={semanasEvolucion} />
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
