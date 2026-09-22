"use client";

import { useEffect, useState } from "react";

/**
 * Botón de instalación PWA. En Samsung Internet / Chrome Android usa el
 * evento `beforeinstallprompt` cuando el navegador lo ofrece; si no está
 * disponible muestra las instrucciones manuales (Menú > Añadir a inicio).
 */
export default function BotonInstalarPWA() {
  const [promptDiferido, setPromptDiferido] = useState(null);
  const [instalada, setInstalada] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  useEffect(() => {
    const estaInstalada = () =>
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://");
    if (estaInstalada()) setInstalada(true);

    function alAntesDeInstalar(e) {
      e.preventDefault();
      setPromptDiferido(e);
    }
    function alInstalar() {
      setInstalada(true);
      setPromptDiferido(null);
      setMostrarAyuda(false);
    }
    window.addEventListener("beforeinstallprompt", alAntesDeInstalar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alAntesDeInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (instalada) return null;

  async function instalar() {
    if (promptDiferido) {
      promptDiferido.prompt();
      try {
        await promptDiferido.userChoice;
      } catch {}
      setPromptDiferido(null);
    } else {
      setMostrarAyuda((v) => !v);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={instalar}
        title="Instalar Siracartera como aplicación"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors sm:px-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--marca)"; e.currentTarget.style.borderColor = "var(--marca)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span className="hidden sm:inline">Instalar</span>
      </button>
      {mostrarAyuda && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
        >
          <p className="mb-1 font-bold">Instalar Siracartera</p>
          <p className="mb-1">Samsung Internet: tocá <b>⋮ Menú → Añadir página a → Pantalla de inicio</b> (o <b>Instalar aplicación</b> si aparece).</p>
          <p className="mb-1">Chrome Android: <b>⋮ → Instalar aplicación</b>.</p>
          <p>iPhone (Safari): <b>Compartir → Añadir a pantalla de inicio</b>.</p>
          <button
            type="button"
            onClick={() => setMostrarAyuda(false)}
            className="mt-2 cursor-pointer font-bold"
            style={{ color: "var(--marca)" }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
