"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarNotaTrade } from "@/app/actions";

const estadoInicial = { error: null, exito: null };

export default function EditorNotasTrade({ tradeId, initialRazon, initialErrores }) {
  const [razon, setRazon] = useState(initialRazon || "");
  const [errores, setErrores] = useState(initialErrores || "");
  const [estado, accion, pending] = useActionState(guardarNotaTrade, estadoInicial);
  const router = useRouter();

  // Tras guardar, recargar props del servidor para que "Guardado"/preview queden consistentes
  useEffect(() => {
    if (estado?.exito) router.refresh();
  }, [estado?.exito, router]);

  const hasNotas = Boolean((initialRazon && initialRazon.trim()) || (initialErrores && initialErrores.trim()));
  const dirty = razon !== (initialRazon || "") || errores !== (initialErrores || "");

  return (
    <div className="mt-2 rounded-md border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="px-2.5 py-1.5">
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Notas del trade
        </span>
      </div>
      <form action={accion} className="space-y-2 border-t px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
          <input type="hidden" name="id" value={tradeId} />
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Razón del trade
            </label>
            <textarea
              name="razon"
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              placeholder="¿Por qué entraste? setup, tesis, plan de salida..."
              rows={2}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Errores / aprendizaje
            </label>
            <textarea
              name="errores"
              value={errores}
              onChange={(e) => setErrores(e.target.value)}
              placeholder="¿Qué harías distinto? gestión de riesgo, timing, sizing..."
              rows={2}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </div>
          {estado?.error && (
            <p className="text-xs" style={{ color: "var(--bad)" }}>{estado.error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !dirty}
              className="rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ background: dirty ? "var(--marca)" : "var(--border)", color: dirty ? "#fff" : "var(--text-muted)" }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setRazon(initialRazon || "");
                  setErrores(initialErrores || "");
                }}
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Deshacer
              </button>
            )}
            {!dirty && hasNotas && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Guardado</span>
            )}
          </div>
        </form>
    </div>
  );
}
