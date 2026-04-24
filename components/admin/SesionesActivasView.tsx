"use client";

import { useState } from "react";
import { Clock, XCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { formatPEN } from "@/lib/utils";

interface SesionActiva {
  id: string;
  openedAt: string;
  openingBalance: number;
  totalEfectivo: number;
  totalVentas: number;
  countVentas: number;
  user: { name: string | null; email: string };
}

interface Props {
  sesiones: SesionActiva[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

export function SesionesActivasView({ sesiones: initial }: Props) {
  const [sesiones, setSesiones] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleCerrar(id: string) {
    setLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/sesiones/${id}/cerrar`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cerrar");
      setClosed(id);
      setSesiones((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar");
    } finally {
      setLoading(null);
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock size={18} className="text-text-muted" />
        <h2 className="text-lg font-bold text-text">Sesiones activas</h2>
        {sesiones.length > 0 && (
          <span className="bg-warning/20 text-warning text-xs font-semibold px-2 py-0.5 rounded-full">
            {sesiones.length}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
          {error}
        </div>
      )}

      {closed && (
        <div className="bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-success text-sm flex items-center gap-2">
          <CheckCircle size={15} /> Sesión cerrada correctamente
        </div>
      )}

      {sesiones.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          No hay sesiones activas en este momento
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-light text-text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Cajero</th>
                <th className="text-left px-4 py-3">Abierta desde</th>
                <th className="text-right px-4 py-3">Ventas</th>
                <th className="text-right px-4 py-3">Efectivo esperado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sesiones.map((s) => {
                const efectivoEsperado = s.openingBalance + s.totalEfectivo;
                return (
                  <tr key={s.id} className="bg-surface hover:bg-surface-light transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{s.user.name ?? s.user.email}</div>
                      {s.user.name && <div className="text-xs text-text-muted">{s.user.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatTime(s.openedAt)}</td>
                    <td className="px-4 py-3 text-right text-text">{s.countVentas}</td>
                    <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(efectivoEsperado)}</td>
                    <td className="px-4 py-3 text-right">
                      {confirming === s.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-warning flex items-center gap-1">
                            <AlertTriangle size={12} /> ¿Confirmar?
                          </span>
                          <button
                            onClick={() => handleCerrar(s.id)}
                            disabled={loading === s.id}
                            className="bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {loading === s.id ? "Cerrando..." : "Sí, cerrar"}
                          </button>
                          <button
                            onClick={() => setConfirming(null)}
                            className="text-text-muted hover:text-text text-xs px-2 py-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirming(s.id)}
                          className="flex items-center gap-1.5 text-danger/70 hover:text-danger border border-danger/20 hover:border-danger/40 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          <XCircle size={13} /> Cerrar sesión
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
