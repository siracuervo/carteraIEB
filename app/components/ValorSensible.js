"use client";

/**
 * Envolvé cualquier monto/cantidad sensible con esto. Lleva siempre ambas
 * versiones en el DOM (real + máscara) y el ojito solo alterna clases en
 * <html> (ver .vs en globals.css): ningún valor se re-renderiza al alternar.
 * Con ambito="total" además responde al ojito del total (valor de portafolio y estrategias).
 */
export default function ValorSensible({ children, ambito = "todo" }) {
  return (
    <span className="vs" data-ambito={ambito}>
      <span className="vs-real">{children}</span>
      <span className="vs-mask" aria-hidden="true">
        ••••••
      </span>
    </span>
  );
}
