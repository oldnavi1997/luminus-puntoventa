"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, PlayCircle, ArrowDownCircle, CheckCircle } from "lucide-react";
import { formatPEN } from "@/lib/utils";

interface AperturaFormProps {
  userId: string;
  cashierName?: string | null;
  suggestedBalance?: number;
  isAdmin?: boolean;
}

export function AperturaForm({ cashierName, suggestedBalance, isAdmin = false }: AperturaFormProps) {
  const router = useRouter();
  const [balance, setBalance] = useState(suggestedBalance ? suggestedBalance.toFixed(2) : "0");
  const [loading, setLoading] = useState(false);
  const [loadingRetiro, setLoadingRetiro] = useState(false);
  const [error, setError] = useState("");
  const [retiroGuardado, setRetiroGuardado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingBalance: parseFloat(balance) || 0 }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Error al abrir caja");
      return;
    }

    router.push("/pos");
    router.refresh();
  }

  async function handleGuardarRetiro() {
    setLoadingRetiro(true);
    setError("");
    try {
      const res = await fetch("/api/caja/retiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montoQueQueda: parseFloat(balance) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      setRetiroGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoadingRetiro(false);
    }
  }

  const montoActual = parseFloat(balance) || 0;
  const montoRetirado = suggestedBalance ? Math.max(0, suggestedBalance - montoActual) : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <PlayCircle size={28} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-text">Apertura de caja</h2>
        {cashierName && (
          <p className="text-sm text-text-muted mt-1">Bienvenido, {cashierName}</p>
        )}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
          {error}
        </div>
      )}

      {retiroGuardado && (
        <div className="bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-success text-sm flex items-center gap-2">
          <CheckCircle size={15} />
          Saldo guardado correctamente. El próximo cajero verá {formatPEN(montoActual)} al abrir.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-text-muted">Monto inicial en caja (efectivo)</label>
          <div className="relative">
            <DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="number"
              value={balance}
              onChange={(e) => isAdmin && setBalance(e.target.value)}
              readOnly={!isAdmin}
              min="0"
              step="0.10"
              placeholder="0.00"
              className={`w-full border rounded-xl pl-9 pr-4 py-3 text-lg font-bold text-text text-center transition-colors focus:outline-none ${
                isAdmin
                  ? "bg-primary border-border focus:border-accent"
                  : "bg-surface-light border-border cursor-default select-none"
              }`}
            />
          </div>

          {/* Resumen de retiro — solo admin cuando cambió el monto */}
          {isAdmin && suggestedBalance != null && suggestedBalance > 0 && montoRetirado > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-[12px] space-y-0.5">
              <div className="flex justify-between text-ink-3">
                <span>Efectivo anterior</span>
                <span className="font-mono">{formatPEN(suggestedBalance)}</span>
              </div>
              <div className="flex justify-between text-warning font-medium">
                <span>Retiro</span>
                <span className="font-mono">- {formatPEN(montoRetirado)}</span>
              </div>
              <div className="flex justify-between text-ink font-bold border-t border-warning/20 pt-1">
                <span>Queda en caja</span>
                <span className="font-mono">{formatPEN(montoActual)}</span>
              </div>
            </div>
          )}

          <p className="text-[11px] text-text-muted text-center">
            {isAdmin
              ? "Solo el administrador puede modificar el monto inicial"
              : suggestedBalance && suggestedBalance > 0
              ? "Monto fijado por el administrador · solo lectura"
              : "Monto inicial de caja"}
          </p>
        </div>

        {/* Botón de retiro solo para admin */}
        {isAdmin && montoRetirado > 0 && !retiroGuardado && (
          <button
            type="button"
            onClick={handleGuardarRetiro}
            disabled={loadingRetiro}
            className="w-full bg-warning/10 hover:bg-warning/20 disabled:opacity-40 border border-warning/30 rounded-xl py-3 text-sm font-semibold text-warning transition-colors flex items-center justify-center gap-2"
          >
            {loadingRetiro ? (
              <div className="w-4 h-4 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
            ) : (
              <><ArrowDownCircle size={15} /> Guardar retiro · dejar {formatPEN(montoActual)}</>
            )}
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-dark disabled:opacity-50 text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <PlayCircle size={18} />
              Abrir caja
            </>
          )}
        </button>
      </form>
    </div>
  );
}
