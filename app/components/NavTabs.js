"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "Ventas realizadas" e "Histórico" están ocultas de momento (a pedido, no
// borradas) — para volver a mostrarlas, descomentar estas dos líneas.
const TABS = [
  { href: "/", label: "Cartera" },
  // { href: "/cerradas", label: "Ventas realizadas" },
  // { href: "/evolucion", label: "Histórico" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-5">
      {TABS.map((tab) => {
        const activa = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="border-b-2 py-1 text-sm font-medium"
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
