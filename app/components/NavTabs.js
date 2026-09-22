"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className="flex min-w-0 max-w-full gap-2 overflow-x-auto whitespace-nowrap sm:gap-5">
      {TABS.map((tab) => {
        const activa = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="shrink-0 border-b-2 py-1 text-sm font-medium"
            style={{
              color: activa ? "var(--marca)" : "var(--text-muted)",
              borderColor: activa ? "var(--marca)" : "transparent",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
