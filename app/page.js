import { leerPortafolioHistorial } from "@/lib/storage";
import { obtenerDatosCartera } from "@/lib/datosCartera";
import { fechaLocal } from "@/lib/fechas";
import { importarPortafolio } from "@/app/actions";
import ResumenCartera from "./components/ResumenCartera";
import DestacadosCartera from "./components/DestacadosCartera";
import EvolucionPatrimonio from "./components/EvolucionPatrimonio";
import PanelEvolucionPatrimonio from "./components/PanelEvolucionPatrimonio";
import SelectorVista from "./components/SelectorVista";
import FormularioImportar from "./components/FormularioImportar";
import SeccionCarga from "./components/SeccionCarga";
import ValorSensible from "./components/ValorSensible";

export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default async function CarteraPage({ searchParams }) {
  const { dia, diaTenencia } = await searchParams;
  const [datos, portafolioHistorial] = await Promise.all([obtenerDatosCartera(dia || null, diaTenencia || null), leerPortafolioHistorial()]);
  const ultimoPortafolio = portafolioHistorial[portafolioHistorial.length - 1] || null;
  const tenencias = datos.vacio ? [] : datos.tenencias;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {tenencias.length ? (
        <>
          <ResumenCartera resumen={datos.resumen} tipoCambioCCL={datos.tipoCambioCCL} />

          {datos.fuentePosiciones === "transacciones" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Todavía no importaste un Portafolio, así que el costo promedio de abajo se reconstruyó desde tus
              movimientos y <strong>no incluye comisiones ni gastos</strong>. En cuanto importes el Portafolio, pasa
              a usar el costo real que reporta IEB.
            </p>
          )}

          <SelectorVista
            tenencias={tenencias}
            resultadosDia={datos.resultadosDia}
            diasOperados={datos.diasOperados}
            dia={datos.dia}
            tenenciasCierre={datos.tenenciasCierre}
            diasTenencia={datos.diasTenencia}
            diaTenencia={datos.diaTenencia}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <EvolucionPatrimonio evolucion={datos.evolucionPatrimonio} evolucionSemana={datos.evolucionSemana} semanasEvolucion={datos.semanasEvolucion} />
            <div className="lg:col-span-2">
              <PanelEvolucionPatrimonio serie={datos.serieEvolucion} snapshots={datos.snapshots} />
            </div>
          </div>

          <DestacadosCartera tenencias={tenencias} nuevasEnCartera={datos.nuevasEnCartera} />
        </>
      ) : (
        <p className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no hay tenencias para mostrar — subí tu Portafolio abajo para empezar.
        </p>
      )}

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
    </main>
  );
}
