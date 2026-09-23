"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Logo "Siracartera" del header: lleva el mismo subrayado que la pestaña
 * activa de NavTabs (border-b-2 color marca) cuando se está en el home (/).
 * El borde transparente cuando no está activo evita saltos de layout.
 */
export default function EnlaceSiracartera({ className = "" }) {
  const pathname = usePathname();
  const activo = pathname === "/";
  return (
    <Link
      href="/"
      className={`btn-anim shrink-0 border-b-2 py-1 text-sm font-bold tracking-wide ${className}`}
      style={{
        color: "var(--marca)",
        borderColor: activo ? "var(--marca)" : "transparent",
      }}
    >
      Siracartera
    </Link>
  );
}
