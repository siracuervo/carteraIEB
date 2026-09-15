import { plegarEnOtros, SERIES_VARS } from "@/lib/paleta";

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

const UMBRAL_ETIQUETA_INLINE = 0.06; // por debajo de esto el segmento es muy angosto para el texto adentro

/** Acá el espacio es angosto — "Efectivo y equivalentes" no entra cómodo. */
function etiquetaCorta(etiqueta) {
  return etiqueta === "Efectivo y equivalentes" ? "Efectivo" : etiqueta;
}

/** Composición por sector como una única barra fina de ancho completo — misma
 * paleta categórica y el mismo plegado en "Otros" que el resto de la app, solo
 * que en vez de una torta ocupa todo el ancho y se lee más de un vistazo. */
export default function BarraSectores({ datos, titulo = "Por sector" }) {
  const plegado = plegarEnOtros(datos);

  if (!plegado.length) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{titulo}</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Sin datos suficientes.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{titulo}</h3>
      <div className="mt-3 flex h-7 w-full overflow-hidden rounded-md" style={{ background: "var(--surface-1)" }}>
        {plegado.map((d, i) => (
          <div
            key={d.etiqueta}
            title={`${etiquetaCorta(d.etiqueta)}: ${formatoARS.format(d.valorARS)} (${formatoPct.format(d.pct)})`}
            className="flex h-full shrink-0 items-center justify-center overflow-hidden text-xs font-medium text-white"
            style={{
              width: `${d.pct * 100}%`,
              background: SERIES_VARS[i % SERIES_VARS.length],
              marginRight: i < plegado.length - 1 ? 2 : 0,
            }}
          >
            {d.pct >= UMBRAL_ETIQUETA_INLINE && <span className="truncate px-1">{etiquetaCorta(d.etiqueta)}</span>}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {plegado.map((d, i) => (
          <li key={d.etiqueta} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_VARS[i % SERIES_VARS.length] }} />
            <span style={{ color: "var(--text-primary)" }}>{etiquetaCorta(d.etiqueta)}</span>
            <span style={{ color: "var(--text-muted)" }}>{formatoPct.format(d.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
