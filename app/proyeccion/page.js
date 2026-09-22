import { obtenerDatosCartera } from "@/lib/datosCartera";
import { leerProyeccion } from "@/lib/storage";
import ProyeccionClient from "./ProyeccionClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProyeccionPage() {
  const [datos, proyeccion] = await Promise.all([obtenerDatosCartera(), leerProyeccion()]);
  if (datos.vacio) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Proyección</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Necesitás tener un portafolio cargado para proyectar.</p>
      </main>
    );
  }
  const tenencias = datos.tenencias || [];
  // Totales actuales por sleeve (posiciones + PESOS + caución ya en tenencias)
  const totales = { trading: 0, largo: 0, rentaFija: 0 };
  for (const t of tenencias) {
    if (t.sleeve === "trading") totales.trading += t.valorActualARS ?? 0;
    else if (t.sleeve === "largo") totales.largo += t.valorActualARS ?? 0;
    else if (t.sleeve === "rentaFija") totales.rentaFija += t.valorActualARS ?? 0;
  }
  // Si no hay sleeve (histórico), todo es trading
  const totalGeneral = tenencias.reduce((a, t) => a + (t.valorActualARS ?? 0), 0);
  if (totales.trading + totales.largo + totales.rentaFija === 0 && totalGeneral > 0) {
    totales.trading = totalGeneral;
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Proyección hasta julio 2027</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Jugá con rendimientos mensuales por estrategia y simulá ingresos y traspasos de ganancias. Parte de tu portafolio actual ({new Date().toLocaleDateString("es-AR")}) y proyecta mes a mes hasta julio 2027.
        </p>
      </div>
      <ProyeccionClient totalesIniciales={totales} proyeccionInicial={proyeccion} />
    </main>
  );
}
