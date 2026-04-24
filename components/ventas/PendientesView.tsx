"use client";

import { useState, useEffect, useCallback } from "react";
import { Timer, RefreshCw, User, CalendarDays } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { CobrarSaldoModal } from "./CobrarSaldoModal";
import { formatPEN } from "@/lib/utils";

interface PendienteDoc {
  id: string;
  fullNumber: string;
  type: string;
  total: number;
  montoAdelanto: number;
  saldoPendiente: number;
  buyerName: string | null;
  buyerDocNumber: string | null;
  createdAt: string;
  cashier: { name: string | null };
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number; sku: string | null }[];
}

interface PendientesViewProps {
  posSessionId: string;
}

export function PendientesView({ posSessionId }: PendientesViewProps) {
  const [docs, setDocs] = useState<PendienteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState<PendienteDoc | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ventas/pendientes");
      const json = await res.json();
      setDocs(json.docs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const totalSaldo = docs.reduce((s, d) => s + d.saldoPendiente, 0);

  return (
    <>
      <ModuleHeader title="Pendientes de Recojo" subtitle="Ventas con adelanto · saldo por cobrar" />

      <div className="flex-1 p-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1">Pendientes</p>
            <p className="text-[24px] font-bold text-ink leading-none">{docs.length}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1">Saldo total</p>
            <p className="text-[24px] font-bold text-warning leading-none font-mono">{formatPEN(totalSaldo)}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center justify-end">
            <button
              onClick={fetchDocs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface-light hover:bg-border disabled:opacity-50 rounded-lg text-[12.5px] text-ink-2 transition-colors border border-border"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border flex flex-col items-center justify-center py-16 text-ink-3">
            <Timer size={40} className="mb-3 opacity-20" />
            <p className="text-[14px] font-medium">Sin pendientes</p>
            <p className="text-[12px] text-ink-4 mt-1">Todas las ventas están cobradas</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-light">
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Documento</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Fecha</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Total</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Adelanto</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-3 font-medium">Saldo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-surface-light transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-mono font-semibold text-ink">{doc.fullNumber}</p>
                      <p className="text-[11px] text-ink-4 mt-0.5">{doc.cashier.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User size={12} className="text-ink-4 shrink-0" />
                        <div>
                          <p className="text-[12.5px] text-ink">{doc.buyerName ?? "Sin nombre"}</p>
                          {doc.buyerDocNumber && (
                            <p className="text-[11px] text-ink-4 font-mono">{doc.buyerDocNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-ink-4 shrink-0" />
                        <p className="text-[12.5px] text-ink-2">
                          {new Date(doc.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[13px] font-mono text-ink">{formatPEN(doc.total)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[13px] font-mono text-accent">{formatPEN(doc.montoAdelanto)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-2.5 py-1 rounded-full text-[12px] font-bold font-mono bg-amber-100 text-amber-700">
                        {formatPEN(doc.saldoPendiente)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {posSessionId ? (
                        <button
                          onClick={() => setCobrando(doc)}
                          className="px-3 py-1.5 bg-accent hover:bg-accent-dark text-white text-[12px] font-semibold rounded-lg transition-colors"
                        >
                          Cobrar saldo
                        </button>
                      ) : (
                        <span className="text-[11px] text-ink-4">Sin sesión</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cobrando && (
        <CobrarSaldoModal
          doc={cobrando}
          posSessionId={posSessionId}
          onSuccess={fetchDocs}
          onClose={() => setCobrando(null)}
        />
      )}
    </>
  );
}
