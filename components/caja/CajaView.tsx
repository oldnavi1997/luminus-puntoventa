"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";

interface SessionData {
  id: string;
  openedAt: string;
  openingBalance: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalYape: number;
  totalVentas: number;
  countVentas: number;
  cashierName: string;
}

interface CajaViewProps {
  session: SessionData | null;
}

const DENOMS = [
  { key: "200",  label: "S/ 200.00" },
  { key: "100",  label: "S/ 100.00" },
  { key: "50",   label: "S/ 50.00"  },
  { key: "20",   label: "S/ 20.00"  },
  { key: "10",   label: "S/ 10.00"  },
  { key: "5",    label: "S/ 5.00"   },
  { key: "2",    label: "S/ 2.00"   },
  { key: "1",    label: "S/ 1.00"   },
  { key: "0.50", label: "S/ 0.50"   },
  { key: "0.20", label: "S/ 0.20"   },
  { key: "0.10", label: "S/ 0.10"   },
];

export function CajaView({ session }: CajaViewProps) {
  const router = useRouter();
  const [denoms, setDenoms] = useState<Record<string, number>>(
    Object.fromEntries(DENOMS.map((d) => [d.key, 0]))
  );
  const [closing, setClosing]     = useState(false);
  const [closeError, setCloseError] = useState("");

  const setDenom = (key: string, val: string) =>
    setDenoms((prev) => ({ ...prev, [key]: parseInt(val) || 0 }));

  const cashTotal = DENOMS.reduce((s, d) => s + parseFloat(d.key) * (denoms[d.key] ?? 0), 0);

  if (!session) {
    return (
      <div className="flex flex-col h-full">
        <ModuleHeader title="Caja · Arqueo" subtitle="Sin sesión activa" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <p className="text-[15px] font-semibold text-ink">No tienes una sesión activa</p>
          <p className="text-[13px] text-ink-3">Ve a <strong>Sesión</strong> para iniciar tu turno antes de realizar el arqueo.</p>
        </div>
      </div>
    );
  }

  const opening   = session.openingBalance;
  const cashSales = session.totalEfectivo;
  const expected  = opening + cashSales;
  const diff      = cashTotal - expected;

  async function handleCerrar() {
    if (!session) return;
    setClosing(true);
    setCloseError("");
    try {
      const res = await fetch("/api/sesion/cierre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, closingBalance: cashTotal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cerrar");
      router.push("/sesion");
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Error al cerrar");
    } finally {
      setClosing(false);
    }
  }

  const openedTime = new Date(session.openedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  const totalVentas = session.totalVentas;
  const methodRows = [
    { label: "Efectivo", amount: session.totalEfectivo, color: "bg-success" },
    { label: "Tarjeta",  amount: session.totalTarjeta,  color: "bg-accent" },
    { label: "Yape",     amount: session.totalYape,     color: "bg-[#7c3aed]" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Caja · Arqueo"
        subtitle={`Apertura ${openedTime} · ${session.cashierName}`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Apertura",          value: formatPEN(opening),   sub: "Fondo inicial"        },
            { label: "Ventas en efectivo", value: formatPEN(cashSales), sub: `${session.countVentas} transacciones` },
            { label: "Esperado",           value: formatPEN(expected),  sub: "Apertura + efectivo"  },
            {
              label:    "Diferencia",
              value:    `${diff >= 0 ? "+" : ""}${formatPEN(diff)}`,
              sub:      Math.abs(diff) < 0.5 ? "Cuadra ✓" : diff > 0 ? "Sobrante" : "Faltante",
              color:    Math.abs(diff) < 0.5 ? "text-success" : diff > 0 ? "text-warning" : "text-danger",
            },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
              <div className={`text-[22px] font-bold font-mono tracking-tight ${(s as { color?: string }).color ?? "text-ink"}`}>{s.value}</div>
              <div className="text-[11.5px] text-ink-3 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Arqueo físico */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-[14px] font-semibold text-ink">Arqueo físico</h3>
            <p className="text-[12px] text-ink-3 mb-4">Cuenta los billetes y monedas</p>

            {/* Header */}
            <div className="flex text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium pb-2 border-b border-border">
              <span className="flex-1">Denominación</span>
              <span className="w-20 text-center">Cantidad</span>
              <span className="w-24 text-right">Subtotal</span>
            </div>

            <div className="divide-y divide-border">
              {DENOMS.map((d) => (
                <div key={d.key} className="flex items-center py-2">
                  <span className="flex-1 text-[13px] font-mono text-ink">{d.label}</span>
                  <input
                    type="number"
                    min="0"
                    value={denoms[d.key] ?? 0}
                    onChange={(e) => setDenom(d.key, e.target.value)}
                    className="w-20 text-center bg-surface-light border border-border rounded-lg px-2 py-1 text-[12.5px] text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <span className="w-24 text-right text-[12.5px] font-semibold font-mono text-ink">
                    {formatPEN(parseFloat(d.key) * (denoms[d.key] ?? 0))}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center pt-3 mt-1 border-t-2 border-border-strong">
              <span className="flex-1 text-[14px] font-semibold text-ink">Total contado</span>
              <span className="text-[18px] font-bold font-mono text-ink">{formatPEN(cashTotal)}</span>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Ventas por método */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-ink">Ventas por método</h3>
              <p className="text-[12px] text-ink-3 mb-4">Total del turno: {formatPEN(totalVentas)}</p>
              <div className="space-y-3">
                {methodRows.map((m) => {
                  const pct = totalVentas > 0 ? (m.amount / totalVentas) * 100 : 0;
                  return (
                    <div key={m.label}>
                      <div className="flex justify-between text-[12.5px] mb-1.5">
                        <span className="text-ink">{m.label}</span>
                        <span className="font-semibold font-mono text-ink">{formatPEN(m.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                        <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumen de cierre */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-ink mb-4">Resumen de cierre</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-ink-3">Total ventas</span>
                  <span className="font-mono font-semibold text-ink">{formatPEN(totalVentas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Transacciones</span>
                  <span className="font-mono font-semibold text-ink">{session.countVentas}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="text-ink-3">Efectivo contado</span>
                  <span className="font-mono font-semibold text-ink">{formatPEN(cashTotal)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${Math.abs(diff) < 0.5 ? "text-success" : diff > 0 ? "text-warning" : "text-danger"}`}>
                  <span>Diferencia</span>
                  <span className="font-mono">{diff >= 0 ? "+" : ""}{formatPEN(diff)}</span>
                </div>
              </div>
              {closeError && (
                <p className="text-[12px] text-danger mt-3">{closeError}</p>
              )}
              <button
                onClick={handleCerrar}
                disabled={closing}
                className="w-full mt-4 bg-danger-soft hover:bg-danger/20 disabled:opacity-40 text-danger rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
              >
                {closing ? "Cerrando..." : "Cerrar caja y registrar arqueo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
