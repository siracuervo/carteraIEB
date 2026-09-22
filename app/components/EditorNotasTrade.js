"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarNotaTrade } from "@/app/actions";

const estadoInicial = { error: null, exito: null };

export default function EditorNotasTrade({ tradeId, initialRazon, initialErrores }) {
  const tieneNotas = Boolean((initialRazon && initialRazon.trim()) || (initialErrores && initialErrores.trim()));
  const [editando, setEditando] = useState(!tieneNotas);
  const [razon, setRazon] = useState(initialRazon || "");
  const [errores, setErrores] = useState(initialErrores || "");
  const [estado, accion, pending] = useActionState(guardarNotaTrade, estadoInicial);
  const router = useRouter();

  // Tras guardar, recargar props del servidor y volver a vista lectura
  useEffect(() => {
    if (estado?.exito) {
      setEditando(false);
      router.refresh();
    }
  }, [estado?.exito, router]);

  // Si cambian las notas de afuera (refresh), sincronizar el form
  useEffect(() => {
    if (!editando) {
      setRazon(initialRazon || "");
      setErrores(initialErrores || "");
    }
  }, [initialRazon, initialErrores, editando]);

  const dirty = razon !== (initialRazon || "") || errores !== (initialErrores || "");

  return (
    <div className="mt-2 rounded-md border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Notas del trade
        </span>
        {tieneNotas && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="ml-auto rounded-md border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Editar
          </button>
        )}
      </div>
      {tieneNotas && !editando ? (
        <div className="space-y-2 border-t px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
          {initialRazon?.trim() && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--marca)" }}>
                Razón
              </div>
              <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                {initialRazon}
              </p>
            </div>
          )}
          {initialErrores?.trim() && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--marca)" }}>
                Errores
              </div>
              <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                {initialErrores}
              </p>
            </div>
          )}
        </div>
      ) : (
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
              rows={3}
              className="w-full rounded-md border px-2 py-1.5 text-sm leading-relaxed"
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
              rows={3}
              className="w-full rounded-md border px-2 py-1.5 text-sm leading-relaxed"
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
              className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ background: dirty ? "var(--marca)" : "var(--border)", color: dirty ? "#fff" : "var(--text-muted)" }}
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
            {tieneNotas && (
              <button
                type="button"
                onClick={() => {
                  setRazon(initialRazon || "");
                  setErrores(initialErrores || "");
                  setEditando(false);
                }}
                className="rounded-md border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
