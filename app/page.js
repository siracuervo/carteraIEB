import Link from "next/link";
import { obtenerDatosCartera } from "@/lib/datosCartera";
import ResumenCartera from "./components/ResumenCartera";
import DestacadosCartera from "./components/DestacadosCartera";
import SelectorVista from "./components/SelectorVista";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CarteraPage({ searchParams }) {
  const { dia, diaTenencia } = await searchParams;
  const datos = await obtenerDatosCartera(dia || null, diaTenencia || null);
  const tenencias = datos.vacio ? [] : datos.tenencias;

  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {tenencias.length ? (
        <>
          <ResumenCartera
            resumen={datos.resumen}
            tipoCambioCCL={datos.tipoCambioCCL}
            evolucion={datos.evolucionPatrimonio}
            evolucionSemana={datos.evolucionSemana}
            semanasEvolucion={datos.semanasEvolucion}
            serieEvolucion={datos.serieEvolucion}
            snapshots={datos.snapshots}
            transacciones={datos.transacciones}
            fondos={datos.movimientosFondos}
            traspasos={datos.traspasosEfectivo}
            serieLargo={datos.serieLargo}
            serieTrading={datos.serieTrading}
            serieEfectivoTrading={datos.serieEfectivoTrading}
            serieEfectivoLargo={datos.serieEfectivoLargo}
            serieRentaFija={datos.serieRentaFija}
            serieEfectivoRentaFija={datos.serieEfectivoRentaFija}
            serieCostoTrading={datos.serieCostoTrading}
            serieCostoLargo={datos.serieCostoLargo}
            serieCostoRentaFija={datos.serieCostoRentaFija}
            fechaCorteSleeves={datos.fechaCorteSleeves}
          />

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
            efectivoSleeves={datos.efectivoSleeves}
            traspasos={datos.traspasosEfectivo}
          />

          <DestacadosCartera tenencias={tenencias} nuevasEnCartera={datos.nuevasEnCartera} />
        </>
      ) : (
        <p className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no hay tenencias para mostrar — importá tu Portafolio desde{" "}
          <Link href="/movimientos" className="hover:underline" style={{ color: "var(--marca)" }}>
            Movimientos
          </Link>{" "}
          para empezar.
        </p>
      )}
    </main>
  );
}
