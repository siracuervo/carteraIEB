"use client";

/**
 * Envolvé cualquier monto/cantidad sensible con esto. Lleva siempre ambas
 * versiones en el DOM (real + máscara) y el ojito solo alterna clases en
 * <html> (ver .vs en globals.css): ningún valor se re-renderiza al alternar.
 * Con ambito="total" además responde al ojito del total (valor de portafolio y estrategias).
 *
 * El símbolo de moneda ($, US$, etc.) y el signo leading (+/−/≈) quedan
 * SIEMPRE visibles: solo se enmascara la parte numérica.
 */
const PREFIJO_MONEDA = /^([\s≈~+\-−]*(?:[A-Za-z]*\$[A-Za-z]*)\s*)(\d[\s\S]*)$/;

export default function ValorSensible({ children, ambito = "todo" }) {
  if (typeof children === "string") {
    const m = children.match(PREFIJO_MONEDA);
    if (m) {
      const [, prefijo, resto] = m;
      return (
        <span>
          {prefijo}
          <span className="vs" data-ambito={ambito}>
            <span className="vs-real">{resto}</span>
            <span className="vs-mask" aria-hidden="true">
              ••••••
            </span>
          </span>
        </span>
      );
    }
  }

  return (
    <span className="vs" data-ambito={ambito}>
      <span className="vs-real">{children}</span>
      <span className="vs-mask" aria-hidden="true">
        ••••••
      </span>
    </span>
  );
}
