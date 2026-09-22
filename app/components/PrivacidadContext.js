"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CLAVE_LOCALSTORAGE = "iebCarteraOculto";
const CLAVE_LOCALSTORAGE_TOTAL = "iebCarteraOcultoTotal";

const PrivacidadContext = createContext({ oculto: false, alternar: () => {}, ocultoTotal: false, alternarTotal: () => {} });

function aplicarClases(todo, total) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("priv-todo", todo);
  document.documentElement.classList.toggle("priv-total", total);
}

export function ProveedorPrivacidad({ children }) {
  const [oculto, setOculto] = useState(false);
  const [ocultoTotal, setOcultoTotal] = useState(false);

  useEffect(() => {
    // localStorage no existe en el server; esta es la única forma de leer la
    // preferencia guardada una vez montado en el cliente.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      const todo = localStorage.getItem(CLAVE_LOCALSTORAGE) === "1";
      const total = localStorage.getItem(CLAVE_LOCALSTORAGE_TOTAL) === "1";
      setOculto(todo);
      setOcultoTotal(total);
      aplicarClases(todo, total);
    } catch {
      // localStorage puede no estar disponible (ej. modo privado del navegador); no pasa nada
    }
  }, []);

  function alternar() {
    setOculto((actual) => {
      const nuevo = !actual;
      try {
        localStorage.setItem(CLAVE_LOCALSTORAGE, nuevo ? "1" : "0");
      } catch {
        // ver comentario arriba
      }
      aplicarClases(nuevo, ocultoTotal);
      return nuevo;
    });
  }

  function alternarTotal() {
    setOcultoTotal((actual) => {
      const nuevo = !actual;
      try {
        localStorage.setItem(CLAVE_LOCALSTORAGE_TOTAL, nuevo ? "1" : "0");
      } catch {
        // ver comentario arriba
      }
      aplicarClases(oculto, nuevo);
      return nuevo;
    });
  }

  return <PrivacidadContext.Provider value={{ oculto, alternar, ocultoTotal, alternarTotal }}>{children}</PrivacidadContext.Provider>;
}

export function usePrivacidad() {
  return useContext(PrivacidadContext);
}
