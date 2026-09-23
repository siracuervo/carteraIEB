"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CLAVE_LOCALSTORAGE = "sira-tema"; // "sistema" | "claro" | "oscuro"

const TemaContext = createContext({ tema: "sistema", ciclar: () => {} });

/** Aplica el tema al <html> y al meta color-scheme (señal anti force-dark). */
function aplicar(tema) {
  try {
    const html = document.documentElement;
    if (tema === "sistema") {
      delete html.dataset.tema;
    } else {
      html.dataset.tema = tema;
    }
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute(
        "content",
        tema === "oscuro" ? "dark" : tema === "claro" ? "only light" : "light dark"
      );
    }
  } catch {
    // DOM no disponible; no pasa nada
  }
}

export function ProveedorTema({ children }) {
  const [tema, setTema] = useState("sistema");

  useEffect(() => {
    // localStorage no existe en el server; se lee una vez montado en el cliente.
    try {
      const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE);
      if (guardado === "claro" || guardado === "oscuro" || guardado === "sistema") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTema(guardado);
        aplicar(guardado);
        return;
      }
    } catch {
      // localStorage puede no estar disponible (modo privado); no pasa nada
    }
    aplicar("sistema");
  }, []);

  function ciclar() {
    setTema((actual) => {
      const nuevo = actual === "sistema" ? "oscuro" : actual === "oscuro" ? "claro" : "sistema";
      try {
        localStorage.setItem(CLAVE_LOCALSTORAGE, nuevo);
      } catch {
        // ver comentario arriba
      }
      aplicar(nuevo);
      return nuevo;
    });
  }

  return <TemaContext.Provider value={{ tema, ciclar }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  return useContext(TemaContext);
}
