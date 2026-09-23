"use client";

import { useEffect } from "react";

/** Registra el service worker (instalabilidad + apertura rápida: el SW cachea
 *  estáticos, precalienta las rutas y sirve HTML guardado si la red tarda). */
export default function RegistroSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
