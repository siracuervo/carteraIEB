"use client";

import { useEffect } from "react";

/** Registra el service worker (solo instalabilidad; no cachea páginas). */
export default function RegistroSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
