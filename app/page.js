import { leerPortafolioHistorial } from "@/lib/storage";
import { obtenerDatosCartera } from "@/lib/datosCartera";
import { fechaLocal } from "@/lib/fechas";
import { importarPortafolio } from "@/app/actions";
import ResumenCartera from "./components/ResumenCartera";
import DestacadosCartera from "./components/DestacadosCartera";
import EvolucionPatrimonio from "./components/EvolucionPatrimonio";
import GraficoEvolucionPatrimonio from "./components/GraficoEvolucionPatrimonio";
import BarraSectores from "./components/BarraSectores";
import TablaTenencias from "./components/TablaTenencias";
import FormularioImportar from "./components/FormularioImportar";
import SeccionCarga from "./components/SeccionCarga";
import ValorSensible from "./components/ValorSensible";

export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default async function CarteraPage() {
  const [datos, portafolioHistorial] = await Promise.all([obtenerDatosCartera(), leerPortafolioHistorial()]);
  const ultimoPortafolio = portafolioHistorial[portafolioHistorial.length - 1] || null;
  const tenencias = datos.vacio ? [] : datos.tenencias;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <SeccionCarga
        titulo="Portafolio actual"
        abierta={!ultimoPortafolio}
        estadoActual={
          ultimoPortafolio ? (
            <>
              Último: {formatoFecha.format(fechaLocal(ultimoPortafolio.fecha))} —{" "}
              <ValorSensible>
                {formatoARS.format(datos.vacio ? ultimoPortafolio.patrimonioTotal : datos.resumen.valorTotalARS)}
              </ValorSensible>
              {datos.preciosEnVivo && <span style={{ color: "var(--text-muted)" }}> (en vivo)</span>}
            </>
          ) : (
            "Sin datos todavía"
          )
        }
        descripcion="En IEB descargá el reporte Portafolio (tenencia actual): trae cantidad, precio, costo promedio y resultado ya calculados por IEB, así que es la fuente más confiable de esta pantalla. Reimportalo cuando quieras actualizarla."
      >
        <FormularioImportar
          accion={importarPortafolio}
          tipo="portafolio"
          id="archivo-portafolio"
          tituloDropzone="Elegí el reporte de Portafolio"
          ayudaDropzone=".xlsx — podés seleccionar más de uno si tenés varias fechas guardadas"
          textoBoton="Importar Portafolio"
        />
      </SeccionCarga>

      {tenencias.length ? (
        <>
          <ResumenCartera resumen={datos.resumen} tipoCambioCCL={datos.tipoCambioCCL} />

          <DestacadosCartera tenencias={tenencias} nuevasEnCartera={datos.nuevasEnCartera} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <EvolucionPatrimonio evolucion={datos.evolucionPatrimonio} evolucionSemana={datos.evolucionSemana} />
            <div className="lg:col-span-2">
              <GraficoEvolucionPatrimonio serie={datos.serieEvolucion} />
            </div>
          </div>

          <BarraSectores datos={datos.porSector} />

          {datos.fuentePosiciones === "transacciones" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Todavía no importaste un Portafolio, así que el costo promedio de abajo se reconstruyó desde tus
              movimientos y <strong>no incluye comisiones ni gastos</strong>. En cuanto importes el Portafolio, pasa
              a usar el costo real que reporta IEB.
            </p>
          )}

          {datos.fuentePosiciones === "portafolio" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Cantidad y costo promedio vienen del Portfolio importado ({formatoFecha.format(fechaLocal(ultimoPortafolio.fecha))}).
              {datos.preciosEnVivo
                ? " El precio actual y el valor de cartera se actualizaron con cotización en vivo."
                : " No se pudo traer cotización en vivo — el precio queda como en el Portfolio importado."}
            </p>
          )}

          <TablaTenencias tenencias={tenencias} />
        </>
      ) : (
        <p className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no hay tenencias para mostrar — subí tu Portafolio arriba para empezar.
        </p>
      )}
    </main>
  );
}
