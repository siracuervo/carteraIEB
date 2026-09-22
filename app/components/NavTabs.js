"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

// "Histórico" está oculta de momento (a pedido, no borrada) — para volver a
// mostrarla, descomentar esta línea.
const TABS = [
  { href: "/trades", label: "Trades" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/proyeccion", label: "Proyección" },
  // { href: "/evolucion", label: "Histórico" },
];

export default function NavTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const [navegando, startNavegar] = useTransition();
  const [destino, setDestino] = useState(null);

  function ir(href) {
    if (href === pathname) return;
    setDestino(href);
    startNavegar(() => router.push(href));
  }

  return (
    <nav className="flex min-w-0 max-w-full gap-2 overflow-x-auto whitespace-nowrap sm:gap-5">
      {TABS.map((tab) => {
        const activa = pathname === tab.href;
        const cargando = navegando && destino === tab.href;
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => ir(tab.href)}
            disabled={cargando}
            className="nav-tab flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 py-1 text-sm font-medium disabled:opacity-70"
            style={{
              color: cargando ? "#fff" : activa ? "var(--marca)" : "var(--text-muted)",
              borderColor: activa ? "var(--marca)" : "transparent",
            }}
          >
            {cargando && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border"
                style={{ borderColor: "var(--border)", borderTopColor: "var(--marca)" }}
              />
            )}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
