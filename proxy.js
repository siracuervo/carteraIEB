import { NextResponse } from "next/server";

/**
 * Auth básica para uso personal: protege toda la app (páginas, API y server
 * actions) con usuario/clave de las env vars AUTH_USER y AUTH_PASS. Si no están
 * configuradas (desarrollo local), deja pasar todo.
 */
export function proxy(request) {
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
    headers: { "WWW-Authenticate": 'Basic realm="Cartera IEB"' },
  });
}
