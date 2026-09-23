import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerDatosCartera } from "@/lib/datosCartera";
import { leerPortafolioHistorial, leerCierresDiarios } from "@/lib/storage";
import { aISO } from "@/lib/accesosRapidosFecha";
import { transaccionesDeActivo, factorPrecioPorClase, importeConDerechos } from "@/lib/calculos";
import { CLASES } from "@/lib/clasificacion";
import { fechaLocal } from "@/lib/fechas";
import Logo from "@/app/components/Logo";
import ValorSensible from "@/app/components/ValorSensible";
import GraficoOperacionesLazy from "@/app/components/GraficoOperacionesLazy";
import GananciaTenencia from "@/app/components/GananciaTenencia";
import FiltroFechasActivo from "@/app/components/FiltroFechasActivo";
import IconoCartera from "@/app/components/IconoCartera";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
// Los precios y costos no son importes: los bonos cotizan con varios decimales
// (ej. 122,6 · PPP 121,90305), así que no se redondean a peso entero como los valores.
const formatoPrecioARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 6 });
const formatoPrecioARSsinDecimales = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const formatoPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatoMoneda(valor, divisa) {
  if (valor == null) return "—";
  return divisa === "USD" ? formatoUSD.format(valor) : formatoARS.format(valor);
}

/** Igual que formatoMoneda pero sin redondear los decimales de precio/costo promedio (los CEDEARs se muestran sin decimales). */
function formatoPrecio(valor, divisa, claseActivo) {
  if (valor == null) return "—";
  if (divisa === "USD") return formatoUSD.format(valor);
  return claseActivo === CLASES.CEDEAR ? formatoPrecioARSsinDecimales.format(valor) : formatoPrecioARS.format(valor);
}

/**
 * Solo tiene sentido "estimar" un importe (Precio × Cantidad) para una compra o
 * venta real — para otras operaciones (dividendos, ajustes) no aplica, y para
 * "paridad" el precio no está en pesos, así que tampoco sirve como estimación.
 */
function esEstimable(m) {
  const op = (m.operacion || "").toUpperCase();
  if (op.includes("PARIDAD")) return false;
  return op.includes("COMPRA") || op.includes("VENTA");
}

function esCompra(m) {
  return (m.operacion || "").toUpperCase().includes("COMPRA");
}

function esVenta(m) {
  return (m.operacion || "").toUpperCase().includes("VENTA");
}

/** Importe en ARS de una operación, en valor absoluto, o null si no hay forma confiable. */
function importeAbsoluto(m, factorPrecio, esCompra) {
  if (m.importeARS != null) return Math.abs(m.importeARS);
  if (!esEstimable(m) || m.precio == null || m.cantidad == null) return null;
  return importeConDerechos(Math.abs(m.cantidad * m.precio * factorPrecio), esCompra);
}

function Tarjeta({ etiqueta, valor, color }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{etiqueta}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: color || "var(--text-primary)" }}>
        {valor}
      </div>
    </div>
  );
}

function IconoVentas() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 9l-5 5-4-4-4 4" />
    </svg>
  );
}

/** Encabezado con ícono para agrupar visualmente un bloque de tarjetas. */
function BloqueTarjetas({ icono, titulo, color, children }) {
  return (
    <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2" style={{ color: color || "var(--text-primary)" }}>
        {icono}
        <h2 className="text-sm font-medium">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Suma varias filas de "ventas realizadas" del mismo activo en un solo resumen. */
function agregarVentas(clave, ventas) {
  if (!ventas.length) return null;
  const cantidadOperada = ventas.reduce((acc, v) => acc + v.cantidadOperada, 0);
  const cantidadSinCosto = ventas.reduce((acc, v) => acc + v.cantidadSinCosto, 0);
  const costoTotal = ventas.reduce((acc, v) => acc + v.costoTotal, 0);
  const importeVenta = ventas.reduce((acc, v) => acc + (v.importeVenta ?? 0), 0);
  const gananciaRealizada = ventas.reduce((acc, v) => acc + (v.gananciaRealizada ?? 0), 0);
  const pnlDesconocido = ventas.some((v) => v.pnlDesconocido);
  const estimadoTipoCambio = ventas.some((v) => v.estimadoTipoCambio);
  const fecha = ventas.reduce((max, v) => (v.fecha && (!max || v.fecha > max) ? v.fecha : max), null);
  const { activo, ticker, claseActivo, sector, divisa } = ventas[0];
  return {
    clave,
    activo,
    ticker,
    claseActivo,
    sector,
    divisa,
    cantidadOperada,
    cantidadSinCosto,
    costoTotal,
    importeVenta,
    gananciaRealizada,
    pnlDesconocido,
    estimadoTipoCambio,
    retornoPct: costoTotal > 0 ? gananciaRealizada / costoTotal : null,
    fecha,
  };
}

export default async function ActivoPage({ params, searchParams }) {
  const { clave: claveParam } = await params;
  const clave = decodeURIComponent(claveParam);
  const { desde, hasta } = (await searchParams) || {};
  const hayFiltroFecha = Boolean(desde || hasta);
  function dentroDelRango(fecha) {
    if (!fecha) return false;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  }

  const [datos, portafolioHistorial, cierresDiarios] = await Promise.all([obtenerDatosCartera(), leerPortafolioHistorial(), leerCierresDiarios()]);
  if (datos.vacio) notFound();
  const transacciones = datos.transacciones || [];

  const tenencia = datos.tenencias.find((t) => t.clave === clave && !t.esCash);
  const ventasDelActivo = datos.ventasRealizadas.filter((v) => v.clave === clave);
  const esPosicionCerrada = !tenencia;
  const cerradaCompleta = esPosicionCerrada ? agregarVentas(clave, ventasDelActivo) : null;
  if (!tenencia && !cerradaCompleta) notFound();

  const activo = tenencia || cerradaCompleta;
  const factorPrecio = factorPrecioPorClase(activo.claseActivo);

  const ventasFiltradas = hayFiltroFecha ? ventasDelActivo.filter((v) => dentroDelRango(v.fecha)) : ventasDelActivo;
  const cerrada = esPosicionCerrada && ventasFiltradas.length ? agregarVentas(clave, ventasFiltradas) : null;
  const ventasDeAbierta = !esPosicionCerrada && ventasFiltradas.length ? agregarVentas(clave, ventasFiltradas) : null;

  const movimientosBase = transaccionesDeActivo(transacciones, clave);
  // Compras (+) y ventas (−) del ticker con fecha, para saber si la tenencia
  // existía en una fecha dada y en qué intervalos se la tuvo.
  const tradesTicker = movimientosBase
    .filter((m) => (esCompra(m) || esVenta(m)) && m.fecha && m.cantidad != null)
    .map((m) => ({ fecha: m.fecha, cantidad: (esVenta(m) ? -1 : 1) * Math.abs(m.cantidad) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const movimientos = hayFiltroFecha ? movimientosBase.filter((m) => dentroDelRango(m.fecha)) : movimientosBase;
  const fechaInicioActivo = movimientosBase[0]?.fecha;

  // Serie del ticker a partir de los Portfolios importados (foto más cercana por
  // fecha) + cierres diarios captados en vivo para los días sin Portfolio (ej.
  // el 16/09 tiene cierre pero no snapshot). Se guarda valor, precio y cantidad:
  // el rendimiento se mide por PRECIO unitario para no contar las compras como
  // ganancia. Se prefiere el valor ya calculado por IEB (`posicionTotal`).
  const puntosTicker = tenencia ? (() => {
    const porFecha = new Map();
    for (const h of portafolioHistorial) {
      const t = (h.tenencias || []).find((x) => x.ticker && x.ticker === tenencia.ticker);
      const valor = t?.posicionTotal
        ?? (t?.cantidad != null && t?.precio != null ? t.cantidad * t.precio * factorPrecio : null);
      if (h.fecha && valor != null) porFecha.set(h.fecha, { valor, precio: t?.precio ?? null, cantidad: t?.cantidad ?? null });
    }
    const cantidadA = (fecha) => tradesTicker.reduce((acc, m) => acc + (m.fecha <= fecha ? m.cantidad : 0), 0);
    for (const [fecha, precios] of Object.entries(cierresDiarios || {})) {
      if (porFecha.has(fecha)) continue;
      const precio = precios?.[tenencia.ticker];
      if (precio == null) continue;
      let cant = cantidadA(fecha);
      if (!(cant > 0)) cant = tenencia.cantidad; // sin compras registradas: se asume sin cambios
      if (cant == null || !(cant > 0)) continue;
      porFecha.set(fecha, { valor: cant * precio * factorPrecio, precio, cantidad: cant });
    }
    return Array.from(porFecha.entries())
      .map(([fecha, punto]) => ({ fecha, ...punto }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  })() : [];
  const hayImportesEstimados = movimientos.some((m) => m.importeARS == null && esEstimable(m) && m.precio != null && m.cantidad != null);

  const compras = movimientos.filter(esCompra);
  const ventas = movimientos.filter(esVenta);
  const cantidadComprada = compras.reduce((acc, m) => acc + Math.abs(m.cantidad ?? 0), 0);
  const cantidadVendida = ventas.reduce((acc, m) => acc + Math.abs(m.cantidad ?? 0), 0);
  const totalInvertido = compras.reduce((acc, m) => acc + (importeAbsoluto(m, factorPrecio, true) ?? 0), 0);
  const totalRecibido = ventas.reduce((acc, m) => acc + (importeAbsoluto(m, factorPrecio, false) ?? 0), 0);

  const ventasPorId = new Map(ventasDelActivo.map((v) => [v.id, v]));
  const resultadoPorMovimiento = new Map();
  movimientosBase
    .filter((m) => ["VENTA", "VENTA TRADING", "VENTA PARIDAD"].includes((m.operacion || "").toUpperCase().replace(/\s+/g, " ").trim()))
    .forEach((m, indice) => {
      const id = `${clave}__${m.nroOperacion ?? `${m.fecha}-${indice}`}`;
      resultadoPorMovimiento.set(m, ventasPorId.get(id));
    });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link href={esPosicionCerrada ? "/cerradas" : "/"} className="text-sm" style={{ color: "var(--text-muted)" }}>
        ← Volver a {esPosicionCerrada ? "ventas realizadas" : "el portafolio"}
      </Link>

      <div className="flex items-center gap-3">
        <Logo ticker={activo.ticker} nombre={activo.activo} size={48} />
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{activo.activo}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {activo.claseActivo}
            {activo.sector ? ` · ${activo.sector}` : ""}
            {esPosicionCerrada ? " · posición cerrada" : ""}
          </p>
        </div>
      </div>

      {tenencia ? (
        <>
          <BloqueTarjetas icono={<IconoCartera />} titulo="Tenencia actual de este activo" color="var(--marca)">
            <GananciaTenencia
              key={clave}
              ticker={tenencia.ticker || tenencia.activo}
              cantidad={tenencia.cantidad}
              precioActual={tenencia.precioActual}
              valorActual={tenencia.valorActualARS}
              costoPromedio={tenencia.costoPromedio}
              gananciaNoRealizada={tenencia.gananciaNoRealizada}
              retornoPct={tenencia.retornoPct}
              divisa={tenencia.divisa}
              claseActivo={tenencia.claseActivo}
              puntos={puntosTicker}
              fechaActual={aISO(new Date())}
              movimientos={tradesTicker}
            />
          </BloqueTarjetas>

          {ventasDeAbierta && (
            <BloqueTarjetas icono={<IconoVentas />} titulo="Ventas realizadas de este activo">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tarjeta etiqueta="Cantidad vendida" valor={<ValorSensible>{ventasDeAbierta.cantidadOperada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>} />
                <Tarjeta etiqueta="Costo vendido" valor={<ValorSensible>{formatoMoneda(ventasDeAbierta.costoTotal, ventasDeAbierta.divisa)}</ValorSensible>} />
                <Tarjeta etiqueta="Importe recibido" valor={<ValorSensible>{formatoMoneda(ventasDeAbierta.importeVenta, ventasDeAbierta.divisa)}</ValorSensible>} />
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>P&L realizado</div>
                  <div className="mt-1 flex items-baseline gap-2 tabular-nums" style={{ color: ventasDeAbierta.gananciaRealizada >= 0 ? "var(--good)" : "var(--bad)" }}>
                    <span className="text-lg font-semibold"><ValorSensible>{formatoMoneda(ventasDeAbierta.gananciaRealizada, ventasDeAbierta.divisa)}</ValorSensible></span>
                    {ventasDeAbierta.retornoPct != null && <span className="text-sm font-medium">{formatoPct.format(ventasDeAbierta.retornoPct)}</span>}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Histórico del activo</div>
                </div>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Resultado ya realizado por las ventas parciales de este activo (no incluye comisiones ni gastos) —
                seguís teniendo posición abierta, mirá las tarjetas de arriba para el estado actual.
              </p>
              {ventasDeAbierta.cantidadSinCosto > 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  El costo vendido y el P&amp;L de arriba solo cubren{" "}
                  <ValorSensible>{(ventasDeAbierta.cantidadOperada - ventasDeAbierta.cantidadSinCosto).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>{" "}
                  de las <ValorSensible>{ventasDeAbierta.cantidadOperada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> unidades vendidas — las otras{" "}
                  <ValorSensible>{ventasDeAbierta.cantidadSinCosto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> se vendieron sin que tengamos registrada su compra
                  (pueden ser anteriores a tu historial importado, o un traspaso de otro broker) — el importe recibido
                  por ellas sí está en “Importe recibido”, por eso esa resta no coincide con el P&amp;L.
                </p>
              )}
              {ventasDeAbierta.pnlDesconocido && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Alguna de estas ventas fue una operación “paridad” sin importe real informado por IEB, así que su
                  resultado no está incluido en el P&amp;L de arriba (aunque la cantidad sí se descontó correctamente).
                </p>
              )}
              {ventasDeAbierta.estimadoTipoCambio && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Alguna de estas ventas fue una operación “paridad” en dólares (típico en bonos) sin importe real
                  informado por IEB — el resultado de arriba incluye una estimación usando el dólar MEP/CCL histórico
                  del día de esa operación.
                </p>
              )}
            </BloqueTarjetas>
          )}
        </>
      ) : (
        <BloqueTarjetas icono={<IconoVentas />} titulo="Ventas realizadas">
          {cerrada ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tarjeta etiqueta="Cantidad operada" valor={<ValorSensible>{cerrada.cantidadOperada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>} />
                <Tarjeta etiqueta="Costo" valor={<ValorSensible>{formatoMoneda(cerrada.costoTotal, cerrada.divisa)}</ValorSensible>} />
                <Tarjeta etiqueta="Venta" valor={<ValorSensible>{formatoMoneda(cerrada.importeVenta, cerrada.divisa)}</ValorSensible>} />
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>P&L realizado</div>
                  <div className="mt-1 flex items-baseline gap-2 tabular-nums" style={{ color: cerrada.gananciaRealizada >= 0 ? "var(--good)" : "var(--bad)" }}>
                    <span className="text-lg font-semibold"><ValorSensible>{formatoMoneda(cerrada.gananciaRealizada, cerrada.divisa)}</ValorSensible></span>
                    {cerrada.retornoPct != null && <span className="text-sm font-medium">{formatoPct.format(cerrada.retornoPct)}</span>}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Histórico del activo</div>
                </div>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Costo y P&amp;L calculados por costo promedio ponderado sobre las operaciones importadas — no incluyen
                comisiones ni gastos, porque el historial de movimientos no los trae por separado.
              </p>
              {cerrada.cantidadSinCosto > 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Además, el costo y el P&amp;L de arriba solo cubren{" "}
                  <ValorSensible>{(cerrada.cantidadOperada - cerrada.cantidadSinCosto).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>{" "}
                  de las <ValorSensible>{cerrada.cantidadOperada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> unidades operadas — las otras{" "}
                  <ValorSensible>{cerrada.cantidadSinCosto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> se vendieron sin que tengamos registrada su compra
                  (pueden ser anteriores a tu historial importado, o un traspaso de otro broker) — el importe recibido por
                  ellas sí está en “Venta”, por eso esa resta no coincide con el P&amp;L.
                </p>
              )}
              {cerrada.pnlDesconocido && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Alguna de estas ventas fue una operación “paridad” sin importe real informado por IEB, así que su
                  resultado no está incluido en el P&amp;L de arriba (aunque la cantidad sí se descontó correctamente).
                </p>
              )}
              {cerrada.estimadoTipoCambio && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Alguna de estas ventas fue una operación “paridad” en dólares (típico en bonos) sin importe real
                  informado por IEB — el resultado de arriba incluye una estimación usando el dólar MEP/CCL histórico del
                  día de esa operación.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No hay ventas de este activo en el rango de fechas elegido.
            </p>
          )}
        </BloqueTarjetas>
      )}

      <FiltroFechasActivo desde={desde} hasta={hasta} fechaInicio={fechaInicioActivo} />

      <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
        <div className="p-4 pb-0">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Compras y ventas</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {movimientos.length
              ? `${movimientos.length} operaciones encontradas${hayFiltroFecha ? " en el rango elegido" : " en los movimientos importados"}.`
              : hayFiltroFecha && movimientosBase.length
                ? "No hay operaciones de este activo en el rango de fechas elegido."
                : "No hay movimientos importados para este activo todavía — subilos en la pestaña Compras y ventas para ver el detalle acá."}
          </p>
        </div>
        {movimientos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 p-4 pb-3 sm:grid-cols-4">
            <Tarjeta
              etiqueta="Cantidad comprada"
              valor={<ValorSensible>{cantidadComprada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>}
            />
            <Tarjeta etiqueta="Total invertido" valor={<ValorSensible>{formatoARS.format(totalInvertido)}</ValorSensible>} />
            <Tarjeta
              etiqueta="Cantidad vendida"
              valor={<ValorSensible>{cantidadVendida.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible>}
            />
            <Tarjeta etiqueta="Total recibido" valor={<ValorSensible>{formatoARS.format(totalRecibido)}</ValorSensible>} />
          </div>
        )}
        {movimientos.length > 0 && (
          <p className="px-4 pb-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {compras.length} {compras.length === 1 ? "compra" : "compras"} · {ventas.length} {ventas.length === 1 ? "venta" : "ventas"} entre las operaciones importadas.
            Los montos se calculan por costo promedio ponderado y no incluyen comisiones ni gastos.
          </p>
        )}
        {movimientos.length > 0 && (
          <div className="p-4 pt-0">
            <GraficoOperacionesLazy movimientos={movimientos} factorPrecio={factorPrecio} divisa={activo.divisa} />
          </div>
        )}
        {movimientos.length > 0 && (
          <div className="overflow-x-auto p-4 pt-0">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                  {["Fecha", "Operación", "Cantidad", "Precio", "Importe ARS", "Resultado"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium" style={{ color: "var(--text-secondary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={m.nroOperacion || i} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {m.fecha ? formatoFecha.format(fechaLocal(m.fecha)) : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{m.operacion}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {m.cantidad != null ? <ValorSensible>{m.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</ValorSensible> : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {m.precio != null ? formatoPrecio(m.precio, m.divisa || activo.divisa, activo.claseActivo) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {(() => {
                        if (m.importeARS != null) return <ValorSensible>{formatoARS.format(m.importeARS)}</ValorSensible>;
                        if (!esEstimable(m) || m.precio == null || m.cantidad == null) return "—";
                        const estimado = -(m.cantidad * m.precio * factorPrecio);
                        return (
                          <>
                            <ValorSensible>{formatoARS.format(estimado)}</ValorSensible>
                            <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>estimado</div>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {(() => {
                        if (!esVenta(m)) return "—";
                        const venta = resultadoPorMovimiento.get(m);
                        if (!venta || venta.gananciaRealizada == null) return "—";
                        const colorVenta = venta.gananciaRealizada >= 0 ? "var(--good)" : "var(--bad)";
                        return (
                          <>
                            <span style={{ color: colorVenta }}>
                              <ValorSensible>{formatoARS.format(venta.gananciaRealizada)}</ValorSensible>
                            </span>
                            {venta.retornoPct != null && (
                              <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                                {formatoPct.format(venta.retornoPct)}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hayImportesEstimados && (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                El importe marcado “estimado” es Precio × Cantidad — esa operación es de antes de que empiece tu “toda
                la actividad” importada, así que IEB no nos dio el importe real.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
