import { NextResponse } from "next/server";
import { crearSesion, leerSesionDeCookie, basicValido } from "./lib/sesion.js";

/**
 * Auth básica para uso personal (sin cambios visibles): el diálogo del
 * navegador sigue igual, pero al validar se emite una cookie firmada de 90
 * días. La cookie sobrevive reinicios del navegador (el caché de Basic, no
 * siempre), así que el login se pide muchísimo menos: solo cuando no hay ni
 * cookie vigente ni credenciales en el navegador.
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

/**
 * Rutas que se autentican solas con `Authorization: Bearer <CRON_SECRET>`
 * (cron de Vercel, migración): el proxy NO les pide Basic, porque en un header
 * entra una sola credencial y los llamadores automáticos no tienen la de Basic.
 * La ruta igual rechaza sin el Bearer correcto.
 */
function esRutaConBearerPropio(pathname) {
  return pathname === "/api/cron/cierres" || pathname === "/api/migrar-r2";
}

const DIAS_COOKIE = 90;

export async function proxy(request) {
  if (esAssetPublico(request.nextUrl.pathname)) return NextResponse.next();
  if (esRutaConBearerPropio(request.nextUrl.pathname)) return NextResponse.next();

  const usuario = process.env.AUTH_USER;
  const clave = process.env.AUTH_PASS;
  if (!usuario || !clave) return NextResponse.next();

  // 1) Cookie vigente → pasa sin pedir nada.
  const sesion = await leerSesionDeCookie(request.headers.get("cookie"));
  if (sesion) return NextResponse.next();

  // 2) Basic válido → pasa y emite/renueva la cookie de 90 días.
  if (basicValido(request.headers.get("authorization"))) {
    const res = NextResponse.next();
    const valor = await crearSesion(usuario);
    if (valor) {
      res.cookies.set("siracartera_sesion", valor, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: DIAS_COOKIE * 86400,
      });
    }
    return res;
  }

  // 3) Ni cookie ni Basic: se pide login como siempre.
  return new Response("Acceso restringido.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Siracartera"' },
  });
}
