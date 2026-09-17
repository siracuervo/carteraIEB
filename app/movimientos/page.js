import { leerTransacciones, leerPortafolioHistorial, claveTransaccion } from "@/lib/storage";
import { fechaLocal } from "@/lib/fechas";
import { resolverTickersConPortafolio } from "@/lib/calculos";
import { importarMovimientos } from "@/app/actions";
import FormularioImportar from "@/app/components/FormularioImportar";
import FormularioOperacionManual from "@/app/components/FormularioOperacionManual";
import ListaActivos from "@/app/components/ListaActivos";
import ListaMovimientos from "@/app/components/ListaMovimientos";
import SeccionCarga from "@/app/components/SeccionCarga";

export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function esCompra(t) {
  return (t.operacion || "").toUpperCase().includes("COMPRA");
}

function esVenta(t) {
  return (t.operacion || "").toUpperCase().includes("VENTA");
}

/** El mercado opera de lunes a viernes: los días sábado y domingo no cuentan. */
function esDiaHabil(fecha) {
  if (!fecha) return false;
  const dia = fechaLocal(fecha).getDay();
  return dia >= 1 && dia <= 5;
}

export default async function MovimientosPage() {
  const [transaccionesRaw, portafolioHistorial] = await Promise.all([leerTransacciones(), leerPortafolioHistorial()]);

  // Misma resolución de tickers que usan el dashboard y las páginas de activo, para
  // que la clave de cada operación coincida con la del enlace /activo/[clave].
  // La clave de edición se calcula sobre la transacción CRUDA (resolverTickers puede
  // agregar tickers que la original no tenía y cambiarían la clave sintética).
  const transacciones = resolverTickersConPortafolio(transaccionesRaw, portafolioHistorial);
  const conClave = transaccionesRaw.map((tRaw, i) => ({
    ...(transacciones[i] || tRaw),
    clave: claveTransaccion(tRaw),
  }));

  const compras = transacciones.filter(esCompra).length;
  const ventas = transacciones.filter(esVenta).length;
  const otros = transacciones.length - compras - ventas;
  const activos = new Set(transacciones.map((t) => t.ticker || t.activo || "Sin nombre")).size;

  const comprasHabilitas = transacciones.filter((t) => esCompra(t) && esDiaHabil(t.fecha));
  const diasConCompra = new Set(comprasHabilitas.map((t) => t.fecha));
  const promedioComprasPorDia = diasConCompra.size ? comprasHabilitas.length / diasConCompra.size : 0;

  const ordenadas = [...conClave].sort((a, b) => {
    const porFecha = (b.fecha || "").localeCompare(a.fecha || "");
    return porFecha !== 0 ? porFecha : Number(b.nroOperacion ?? 0) - Number(a.nroOperacion ?? 0);
  });

  const activosOperados = new Map();
  for (const t of transacciones) {
    if (!esCompra(t) && !esVenta(t)) continue;
    const clave = t.ticker || t.activo || "SIN_IDENTIFICAR";
    let grupo = activosOperados.get(clave);
    if (!grupo) {
      grupo = { clave, ticker: t.ticker || null, activo: t.activo || "", compras: 0, ventas: 0 };
      activosOperados.set(clave, grupo);
    }
    if (esCompra(t)) grupo.compras += 1;
    else grupo.ventas += 1;
  }
  const listaActivos = Array.from(activosOperados.values()).sort((a, b) =>
    (a.ticker || a.activo).localeCompare(b.ticker || b.activo)
  );

  let primera = null;
  let ultima = null;
  for (const t of transacciones) {
    if (!t.fecha) continue;
    if (!primera || t.fecha < primera) primera = t.fecha;
    if (!ultima || t.fecha > ultima) ultima = t.fecha;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Compras y ventas
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Acá se cargan los movimientos (compras, ventas, dividendos) de tus activos. Una vez importados, aparecen
          en la página de cada activo y alimentan el historial de la cartera.
        </p>
      </div>

      {transacciones.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Compras</div>
            <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {compras}
            </div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Ventas</div>
            <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {ventas}
            </div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Otros (dividendos, ajustes)</div>
            <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {otros}
            </div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Promedio de compras por día</div>
            <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {promedioComprasPorDia.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
            </div>
            {diasConCompra.size > 0 && (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{diasConCompra.size} días hábiles con compras</div>
            )}
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Activos con operaciones</div>
            <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {activos}
            </div>
          </div>
        </div>
      )}

      <SeccionCarga
        titulo="Todas las operaciones"
        abierta={false}
        estadoActual={`${ordenadas.length} operaciones`}
        descripcion="La lista completa de movimientos importados y cargados a mano, con filtros por búsqueda, tipo, divisa y rango de fechas."
      >
        <ListaMovimientos transacciones={ordenadas} />
      </SeccionCarga>

      <SeccionCarga
        titulo="Importar movimientos"
        abierta={false}
        estadoActual={
          transacciones.length
            ? `${transacciones.length} operaciones importadas` +
              (primera && ultima ? ` · ${formatoFecha.format(fechaLocal(primera))} → ${formatoFecha.format(fechaLocal(ultima))}` : "")
            : null
        }
        descripcion="En IEB descargá el export de “Toda la actividad” (y de paso el “Histórico de tenencia”, si lo tenés): el segundo completa cantidad y precio a operaciones que el primero solo trae sin detalle. Se puede importar varias veces, los archivos se van integrando sin duplicar."
      >
        <FormularioImportar
          accion={importarMovimientos}
          tipo="movimientos"
          id="archivo-movimientos"
          tituloDropzone="Elegí los exports de IEB con tus movimientos"
          ayudaDropzone=".xlsx — podés seleccionar más de uno; se juntan y se deduplican solos"
          textoBoton="Importar movimientos"
        />
      </SeccionCarga>

      <SeccionCarga
        titulo="Agregar operación a mano"
        abierta={false}
        descripcion="Para alguna compra o venta que IEB no tenga en tus exports, o que quieras corregir. Se guarda igual que el resto de los movimientos y aparece en la página del activo."
      >
        <FormularioOperacionManual />
      </SeccionCarga>

      <SeccionCarga
        titulo="Activos operados"
        abierta={false}
        estadoActual={`${listaActivos.length} activos`}
        descripcion="Cada activo con compras o ventas registradas, con acceso directo a su página de detalle (historial completo, totales y resultado por venta)."
      >
        {listaActivos.length ? (
          <ListaActivos activos={listaActivos} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay compras ni ventas registradas.</p>
        )}
      </SeccionCarga>
    </main>
  );
}