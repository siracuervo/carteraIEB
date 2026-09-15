"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CLAVE_LOCALSTORAGE = "iebCarteraOculto";

const PrivacidadContext = createContext({ oculto: false, alternar: () => {} });

export function ProveedorPrivacidad({ children }) {
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    // localStorage no existe en el server; esta es la única forma de leer la
    // preferencia guardada una vez montado en el cliente.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOculto(localStorage.getItem(CLAVE_LOCALSTORAGE) === "1");
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
      return nuevo;
    });
  }

  return <PrivacidadContext.Provider value={{ oculto, alternar }}>{children}</PrivacidadContext.Provider>;
}

export function usePrivacidad() {
  return useContext(PrivacidadContext);
}
