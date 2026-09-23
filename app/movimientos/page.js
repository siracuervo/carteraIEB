import { leerTransacciones, leerPortafolioHistorial, leerMovimientosFondos, leerClasificaciones, leerCierresManuales, leerImportaciones, claveTransaccion } from "@/lib/storage";
import { fechaLocal } from "@/lib/fechas";
import { resolverTickersConPortafolio } from "@/lib/calculos";
import { importarOperacionesDelDia, guardarCierreManual, importarRespaldo, repararPuntoAuto } from "@/app/actions";
import FormularioImportar from "@/app/components/FormularioImportar";
import FormularioCierreManual from "@/app/components/FormularioCierreManual";
import FormularioRepararPunto from "@/app/components/FormularioRepararPunto";
import FormularioOperacionManual from "@/app/components/FormularioOperacionManual";
import FormularioFondos from "@/app/components/FormularioFondos";
import ListaFondos from "@/app/components/ListaFondos";
import SelectorCargaMovimientos from "@/app/components/SelectorCargaMovimientos";
import ListaActivos from "@/app/components/ListaActivos";
import ListaMovimientos from "@/app/components/ListaMovimientos";
import ListaCierresManuales from "@/app/components/ListaCierresManuales";
import ListaImportaciones from "@/app/components/ListaImportaciones";
import SeccionCarga from "@/app/components/SeccionCarga";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const [transaccionesRaw, portafolioHistorial, movimientosFondos, cierresManuales, importaciones] = await Promise.all([leerTransacciones(), leerPortafolioHistorial(), leerMovimientosFondos(), leerCierresManuales(), leerImportaciones()]);

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
    if (porFecha !== 0) return porFecha;
    // Dentro del día, lo más reciente primero; sin hora al final (espejo del
    // criterio ascendente, donde van al cierre del día). Ticker desempatas.
    const horaA = a.hora || null;
    const horaB = b.hora || null;
    if (horaA && horaB && horaA !== horaB) return horaB.localeCompare(horaA);
    if (!!horaA !== !!horaB) return horaA ? -1 : 1;
    const nroA = Number(a.nroOperacion);
    const nroB = Number(b.nroOperacion);
    const ordA = Number.isFinite(nroA) ? nroA : 0;
    const ordB = Number.isFinite(nroB) ? nroB : 0;
    if (ordB !== ordA) return ordB - ordA;
    return (a.ticker || a.activo || "").localeCompare(b.ticker || b.activo || "");
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

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Compras y ventas
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Acá se cargan los movimientos (compras, ventas, dividendos) de tus activos. Una vez importados, aparecen
          en la página de cada activo y alimentan el historial del portafolio.
        </p>
      </div>

      <SeccionCarga
        titulo="Cargar movimientos"
        abierta={false}
        estadoActual="Manual"
      >
        <SelectorCargaMovimientos
          cantidadFondos={movimientosFondos.length}
          operacion={<FormularioOperacionManual />}
          fondos={
            <div className="space-y-4">
              <FormularioFondos />
              <ListaFondos fondos={movimientosFondos} />
            </div>
          }
        />
      </SeccionCarga>

      <SeccionCarga
        titulo="Todas las operaciones"
        abierta={true}
        estadoActual={`${ordenadas.length} operaciones`}
      >
        <ListaMovimientos transacciones={ordenadas} />
      </SeccionCarga>

      <SeccionCarga
        titulo="Cierres manuales"
        abierta={false}
        descripcion="Para tickers sin API (ej. TMF27): cargá el precio de cierre de un día y queda guardado para valuar ese día hacia atrás. Los Portfolios que importes ya guardan sus precios solos."
      >
        <FormularioCierreManual accion={guardarCierreManual} />
        <ListaCierresManuales cierres={cierresManuales} />
      </SeccionCarga>

      <SeccionCarga
        titulo="Reparar punto del gráfico"
        abierta={false}
        descripcion="Si un día del gráfico muestra un valor pisado por un auto-guardado (ej. la mañana siguiente superpuesta), eliminá su punto auto-guardado y se reconstruye desde los cierres y Portfolios."
      >
        <FormularioRepararPunto accion={repararPuntoAuto} />
      </SeccionCarga>

      <SeccionCarga
        titulo="Respaldo de datos"
        abierta={false}
        descripcion="Descargá todos los datos de la app (operaciones, Portfolios, cierres, fondos, notas) en un único archivo, y restauralo donde quieras — en Vercel, subirlo acá carga todos los JSON necesarios al Blob sin importarlos uno por uno. Restaurar pisa los datos actuales."
      >
        <div className="space-y-4">
          <div>
            <a
              href="/api/respaldo"
              download
              className="inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--marca)" }}
            >
              Descargar respaldo completo
            </a>
          </div>
          <FormularioImportar
            accion={importarRespaldo}
            tipo="respaldo"
            id="archivo-respaldo"
            tituloDropzone="Restaurar respaldo"
            ayudaDropzone=".json — el archivo descargado de acá; pisa los datos actuales"
            textoBoton="Restaurar respaldo"
            accept=".json"
            multiple={false}
          />
        </div>
      </SeccionCarga>

      <SeccionCarga
        titulo="Importar operaciones del día"
        abierta={false}
        descripcion="El export diario de IEB “Operaciones del día” trae las compras y ventas del día con cantidad, precio e importe ya calculados. Se agrega a esta misma lista de movimientos sin duplicar."
      >
        <FormularioImportar
          accion={importarOperacionesDelDia}
          tipo="operaciones-del-dia"
          id="archivo-operaciones-del-dia"
          tituloDropzone="Elegí el export de Operaciones del día"
          ayudaDropzone=".xlsx — podés seleccionar más de uno; se agregan como compras y ventas sin duplicar"
          textoBoton="Importar como compras y ventas"
        />
        <ListaImportaciones importaciones={importaciones} />
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
    </main>
  );
}