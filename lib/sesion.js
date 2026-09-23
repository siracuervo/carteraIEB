// Sesión recordada (cookie firmada, 90 días) sobre el Basic Auth existente.
// Sin dependencias y compatible con Edge Runtime (solo Web Crypto, nada de
// node:crypto). Secreto: SESSION_SECRET o AUTH_PASS como fallback.

const NOMBRE_COOKIE = "siracartera_sesion";

function secreto() {
  return process.env.SESSION_SECRET || process.env.AUTH_PASS || "";
}

async function firmar(usuario, expira) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${usuario}.${expira}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación sin atajos por longitud/contenido (anti timing). */
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Crea el valor de cookie para `usuario` (expira en 90 días). "" si no hay secreto. */
export async function crearSesion(usuario) {
  if (!secreto()) return "";
  const expira = Date.now() + 90 * 86400 * 1000;
  return `v1.${usuario}.${expira}.${await firmar(usuario, expira)}`;
}

/** Valida el valor de cookie. Devuelve el usuario o null. */
export async function verificarSesion(valor) {
  try {
    if (!valor || !secreto()) return null;
    const [v, usuario, expiraStr, firma] = String(valor).split(".");
    if (v !== "v1" || !usuario || !expiraStr || !firma) return null;
    const expira = Number(expiraStr);
    if (!Number.isFinite(expira) || expira < Date.now()) return null;
    if (!igual(firma, await firmar(usuario, expira))) return null;
    return usuario;
  } catch {
    return null;
  }
}

export async function leerSesionDeCookie(headerCookie) {
  if (!headerCookie) return null;
  const par = String(headerCookie)
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${NOMBRE_COOKIE}=`));
  if (!par) return null;
  return verificarSesion(decodeURIComponent(par.slice(NOMBRE_COOKIE.length + 1)));
}

/** Valida Basic Auth clásico (el diálogo del navegador, sin cambios). */
export function basicValido(headerAuth) {
  const usuario = process.env.AUTH_USER;
  const clave = process.env.AUTH_PASS;
  if (!usuario || !clave) return false;
  const [esquema, credenciales] = String(headerAuth || "").split(" ");
  if (esquema !== "Basic" || !credenciales) return false;
  try {
    const decodificado = atob(credenciales);
    const i = decodificado.indexOf(":");
    return i > 0 && decodificado.slice(0, i) === usuario && decodificado.slice(i + 1) === clave;
  } catch {
    return false;
  }
}
