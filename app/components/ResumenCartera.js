import ValorSensible from "./ValorSensible";
import ValorEnDolarOficial from "./ValorEnDolarOficial";
import EvolucionPatrimonio from "./EvolucionPatrimonio";
import PanelEvolucionPatrimonio from "./PanelEvolucionPatrimonio";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoProporcion = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const CLASE_TARJETA = "flex flex-col justify-center rounded-lg border p-3";

export default function ResumenCartera({ resumen, tipoCambioCCL, evolucion, evolucionSemana, semanasEvolucion, serieEvolucion, snapshots, transacciones, fondos }) {
  const {
    valorTotalARS,
    dividendosTotalARS,
    conversionIncompleta,
    composicion,
  } = resumen;
  const hoy = formatoFechaCorta.format(new Date());

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 flex h-full flex-col gap-3 lg:col-span-1">
          <div className={`${CLASE_TARJETA} flex-1 lg:min-w-56`} style={{ borderColor: "var(--marca)", background: "var(--marca-suave)" }}>
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-semibold" style={{ color: "var(--marca)" }}>Valor de cartera</div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{hoy}</div>
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: "var(--marca)" }}>
              <ValorSensible>{formatoARS.format(valorTotalARS)}</ValorSensible>
            </div>
            <ValorEnDolarOficial valorARS={valorTotalARS} />
          </div>

          <div className={`${CLASE_TARJETA} flex-1 lg:min-w-56`} style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div
              className="flex items-start justify-between gap-3"
              title="Proporciones sobre el valor en ARS de las posiciones valuadas"
            >
              {(composicion ?? []).map((grupo) => (
                <div key={grupo.etiqueta}>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{grupo.etiqueta}</div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    <ValorSensible>{formatoProporcion.format(grupo.pct)}</ValorSensible>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <EvolucionPatrimonio evolucion={evolucion} evolucionSemana={evolucionSemana} semanasEvolucion={semanasEvolucion} />
        </div>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <PanelEvolucionPatrimonio serie={serieEvolucion} snapshots={snapshots} transacciones={transacciones} fondos={fondos} />
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
