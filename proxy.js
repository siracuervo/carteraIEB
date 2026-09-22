import { NextResponse } from "next/server";

/**
 * Auth básica para uso personal: protege toda la app (páginas, API y server
 * actions) con usuario/clave de las env vars AUTH_USER y AUTH_PASS. Si no están
 * configuradas (desarrollo local), deja pasar todo.
 *
 * Los assets "públicos" de la PWA (manifest, service worker e iconos) quedan
 * fuera de la auth: el navegador y los servidores que generan el APK (Chrome /
 * Samsung Internet) los leen SIN credenciales. Si devolvieran 401, el icono de
 * "Instalar" nunca aparece y la instalación falla en silencio.
 */
function esAssetPublico(pathname) {
  return (
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  );
}

export function proxy(request) {
  // El cron de Vercel guarda los cierres diarios sin sesión: se autentica con
  // su propio secret (header `Authorization: Bearer <CRON_SECRET>`).
  if (request.nextUrl.pathname === "/api/cron/cierres" && process.env.CRON_SECRET) {
    if (request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }
  }

  if (esAssetPublico(request.nextUrl.pathname)) return NextResponse.next();

  const usuario = process.env.AUTH_USER;
  const clave = process.env.AUTH_PASS;
  if (!usuario || !clave) return NextResponse.next();

  const auth = request.headers.get("authorization") || "";
  const [esquema, credenciales] = auth.split(" ");
  let valido = false;
  if (esquema === "Basic" && credenciales) {
    try {
      const decodificado = atob(credenciales);
      const separador = decodificado.indexOf(":");
      valido =
        separador > 0 &&
        decodificado.slice(0, separador) === usuario &&
        decodificado.slice(separador + 1) === clave;
    } catch {
      valido = false;
    }
  }

  if (valido) return NextResponse.next();
  return new Response("Acceso restringido.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Siracartera"' },
  });
}
