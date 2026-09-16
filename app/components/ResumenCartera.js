import ValorSensible from "./ValorSensible";
import DolarCCLEnVivo from "./DolarCCLEnVivo";
import ValorEnDolarOficial from "./ValorEnDolarOficial";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

function Tarjeta({ etiqueta, valor, color, style }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)", ...style }}
    >
      <div className="min-h-8 text-xs leading-4" style={{ color: "var(--text-primary)" }}>{etiqueta}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: color || "var(--text-primary)" }}>
        {valor}
      </div>
    </div>
  );
}

export default function ResumenCartera({ resumen, tipoCambioCCL }) {
  const {
    valorTotalARS,
    invertidoTotalARS,
    gananciaTotalARS,
    retornoTotalPct,
    dividendosTotalARS,
    conversionIncompleta,
    efectivoARS,
  } = resumen;
  const colorGanancia = gananciaTotalARS >= 0 ? "var(--good)" : "var(--bad)";

  return (
    <div>
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm" style={{ color: "var(--text-primary)" }}>Valor de cartera</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums lg:text-3xl" style={{ color: "var(--text-primary)" }}>
              <ValorSensible>{formatoARS.format(valorTotalARS)}</ValorSensible>
            </div>
            <ValorEnDolarOficial valorARS={valorTotalARS} />
          </div>
          <DolarCCLEnVivo referencia={tipoCambioCCL} />
        </div>
      </div>

      <div className={`mt-3 grid gap-3 ${efectivoARS > 0 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
        <Tarjeta
          etiqueta="Invertido (costo)"
          valor={<ValorSensible>{formatoARS.format(invertidoTotalARS)}</ValorSensible>}
          style={efectivoARS > 0 ? undefined : { gridColumn: "1 / -1" }}
        />
        {efectivoARS > 0 && (
          <Tarjeta etiqueta="Efectivo" valor={<ValorSensible>{formatoARS.format(efectivoARS)}</ValorSensible>} />
        )}
        <Tarjeta
          etiqueta="Resultado sobre posiciones activas"
          valor={<ValorSensible>{formatoARS.format(gananciaTotalARS)}</ValorSensible>}
          color={colorGanancia}
        />
        <Tarjeta
          etiqueta="Retorno sobre posiciones activas"
          valor={retornoTotalPct == null ? "—" : formatoPct.format(retornoTotalPct)}
          color={retornoTotalPct == null ? undefined : colorGanancia}
        />
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
