"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, ShoppingBag, DollarSign, CreditCard, Smartphone } from "lucide-react";
import { formatPEN } from "@/lib/utils";

interface SessionData {
  id: string;
  openingBalance: number | { toString(): string };
  totalEfectivo: number | { toString(): string };
  totalTarjeta: number | { toString(): string };
  totalYape: number | { toString(): string };
  totalVentas: number | { toString(): string };
  countVentas: number;
  openedAt: Date;
  _count: { documents: number };
}

function toNum(v: number | { toString(): string }): number {
  return typeof v === "number" ? v : parseFloat(v.toString());
}

export function CierreResumen({ session, userId: _userId }: { session: SessionData; userId: string }) {
  const router = useRouter();
  const [closingBalance, setClosingBalance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openingBalance = toNum(session.openingBalance);
  const totalEfectivo = toNum(session.totalEfectivo);
  const totalTarjeta = toNum(session.totalTarjeta);
  const totalYape = toNum(session.totalYape);
  const totalVentas = toNum(session.totalVentas);

  const expectedEfectivo = openingBalance + totalEfectivo;

  async function handleCierre(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/sesion/cierre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        closingBalance: parseFloat(closingBalance) || 0,
      }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Error al cerrar caja");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 bg-warning/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <XCircle size={28} className="text-warning" />
        </div>
        <h2 className="text-xl font-bold text-text">Cierre de caja</h2>
        <p className="text-sm text-text-muted">
          Apertura: {new Date(session.openedAt).toLocaleTimeString("es-PE")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={ShoppingBag} label="Ventas" value={`${session.countVentas}`} color="accent" />
        <StatCard icon={DollarSign} label="Total ventas" value={formatPEN(totalVentas)} color="success" />
        <StatCard icon={DollarSign} label="Efectivo" value={formatPEN(totalEfectivo)} color="text" />
        <StatCard icon={CreditCard} label="Tarjeta" value={formatPEN(totalTarjeta)} color="text" />
        <StatCard icon={Smartphone} label="Yape" value={formatPEN(totalYape)} color="text" />
        <StatCard icon={DollarSign} label="Efectivo esperado" value={formatPEN(expectedEfectivo)} color="warning" />
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleCierre} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm text-text-muted">Efectivo contado en caja</label>
          <input
            type="number"
            value={closingBalance}
            onChange={(e) => setClosingBalance(e.target.value)}
            min="0"
            step="0.10"
            placeholder={formatPEN(expectedEfectivo)}
            className="w-full bg-primary border border-border rounded-xl px-4 py-3 text-center text-lg font-bold text-text focus:outline-none focus:border-accent transition-colors"
          />
          {closingBalance && (
            <p className={`text-xs text-center ${
              Math.abs(parseFloat(closingBalance) - expectedEfectivo) < 0.01
                ? "text-success"
                : "text-warning"
            }`}>
              Diferencia: {formatPEN(Math.abs(parseFloat(closingBalance) - expectedEfectivo))}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="flex-1 bg-primary border border-border hover:bg-surface-light rounded-xl py-3 text-sm text-text transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !closingBalance}
            className="flex-1 bg-warning/20 hover:bg-warning/30 disabled:opacity-40 border border-warning/30 rounded-xl py-3 text-sm font-semibold text-warning transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
            ) : (
              <>
                <XCircle size={15} />
                Cerrar caja
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    text: "text-text",
  };
  return (
    <div className="bg-primary border border-border rounded-xl p-3 flex items-center gap-2">
      <Icon size={14} className={colorMap[color] ?? "text-text"} />
      <div>
        <p className="text-[10px] text-text-muted">{label}</p>
        <p className="text-sm font-bold text-text">{value}</p>
      </div>
    </div>
  );
}
