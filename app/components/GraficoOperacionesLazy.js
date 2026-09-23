"use client";

import dynamic from "next/dynamic";

// Recharts (el gráfico de operaciones) se carga on-demand para no pesar en el
// primer pintado de la página de activo: se pide al entrar en la vista y se
// muestra un esqueleto mientras llega.
const GraficoOperaciones = dynamic(() => import("./GraficoOperaciones"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
      Cargando gráfico…
    </div>
  ),
});

export default function GraficoOperacionesLazy(props) {
  return <GraficoOperaciones {...props} />;
}