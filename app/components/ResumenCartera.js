import ValorSensible from "./ValorSensible";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

function Tarjeta({ etiqueta, valor, color }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: color || "var(--text-primary)" }}>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tarjeta etiqueta="Valor de cartera" valor={<ValorSensible>{formatoARS.format(valorTotalARS)}</ValorSensible>} />
        {efectivoARS > 0 && (
          <Tarjeta etiqueta="Efectivo" valor={<ValorSensible>{formatoARS.format(efectivoARS)}</ValorSensible>} />
        )}
        <Tarjeta etiqueta="Invertido (costo)" valor={<ValorSensible>{formatoARS.format(invertidoTotalARS)}</ValorSensible>} />
        <Tarjeta
          etiqueta="Resultado"
          valor={<ValorSensible>{formatoARS.format(gananciaTotalARS)}</ValorSensible>}
          color={colorGanancia}
        />
        <Tarjeta
          etiqueta="Retorno"
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
