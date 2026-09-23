import { obtenerDatosCartera } from "@/lib/datosCartera";
import { lotesPorSleeve, efectivoPorSleeve, precioEnFecha } from "@/lib/sleeves";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") || "2026-09-20";
  const hasta = searchParams.get("hasta") || "2026-09-23";
  const sleeve = searchParams.get("sleeve") || "trading";
  const datos = await obtenerDatosCartera();
  const { serieValor, serieEfectivo, fechaCorteSleeves, aperturaLotes, portafolioHistorial, cierres } = (() => {
    // Reconstruct same as datosCartera does for series
    // Easier: just recompute here with same logic as Medidor
    return {
      serieValor: datos.serieTrading,
      serieEfectivo: datos.serieEfectivoTrading,
      fechaCorteSleeves: datos.fechaCorteSleeves,
      aperturaLotes: null,
      portafolioHistorial: null,
      cierres: null,
    };
  })();
  // Use Medidor's valorSleeveEn logic replicated
  const puntos = (datos.snapshots || []).filter(p => p.fecha && p.valorTotalARS != null);
  const idxDesde = (()=>{let idx=-1;for(let i=0;i<puntos.length;i++) if(puntos[i].fecha <= desde) idx=i; return idx===-1?0:idx;})();
  const idxHasta = (()=>{let idx=-1;for(let i=0;i<puntos.length;i++) if(puntos[i].fecha <= hasta) idx=i; return idx===-1?0:idx;})();
  const fotoDesde = puntos[idxDesde]?.fecha;
  const fotoHasta = puntos[Math.max(idxHasta, idxDesde)]?.fecha;
  const valorEn = (fecha) => {
    if (!fecha) return 0;
    if (fechaCorteSleeves && fecha < fechaCorteSleeves) {
      const idx = (()=>{let j=-1;for(let k=0;k<puntos.length;k++) if(puntos[k].fecha <= fecha) j=k; return j===-1?0:j;})();
      const p = puntos[idx];
      if (!p) return 0;
      if (sleeve === "rentaFija") return (p.rentaFijaARS ?? 0);
      if (sleeve === "largo") return 0;
      return (p.valorTotalARS - (p.rentaFijaARS ?? 0) - (p.efectivoParaRF ?? 0));
    }
    let pos=0; for(const q of (datos.serieTrading||[])) if(q.fecha <= fecha) pos=q.valor??0;
    let cash=0; for(const q of (datos.serieEfectivoTrading||[])) if(q.fecha <= fecha) cash=q.valor??0;
    // For generic sleeve, pick correct series
    if (sleeve === "largo") {
      pos=0; for(const q of (datos.serieLargo||[])) if(q.fecha <= fecha) pos=q.valor??0;
      cash=0; for(const q of (datos.serieEfectivoLargo||[])) if(q.fecha <= fecha) cash=q.valor??0;
    } else if (sleeve === "rentaFija") {
      pos=0; for(const q of (datos.serieRentaFija||[])) if(q.fecha <= fecha) pos=q.valor??0;
      cash=0; for(const q of (datos.serieEfectivoRentaFija||[])) if(q.fecha <= fecha) cash=q.valor??0;
    } else {
      pos=0; for(const q of (datos.serieTrading||[])) if(q.fecha <= fecha) pos=q.valor??0;
      cash=0; for(const q of (datos.serieEfectivoTrading||[])) if(q.fecha <= fecha) cash=q.valor??0;
    }
    return pos+cash;
  };
  const base = valorEn(fotoDesde);
  const valueH = valorEn(fotoHasta);
  return Response.json({
    desde, hasta, sleeve, fotoDesde, fotoHasta, base, valueH, delta: valueH-base,
    serieTrading: datos.serieTrading,
    serieEfectivoTrading: datos.serieEfectivoTrading,
    efectivoSleeves: datos.efectivoSleeves,
    tenenciasTradingPos: datos.tenencias?.filter(t=>t.sleeve==="trading" && !t.esCash)?.map(t=>({ticker:t.ticker, cant:t.cantidad, precio:t.precioActual, valor:t.valorActualARS})),
  });
}
