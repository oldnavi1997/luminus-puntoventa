"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Timer, RefreshCw, User, CalendarDays, Plus, X } from "lucide-react";
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

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA:  "Tarjeta",
  YAPE:     "Yape",
};

export function PendientesView({ posSessionId }: PendientesViewProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";

  const [docs, setDocs] = useState<PendienteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState<PendienteDoc | null>(null);
  const [creando, setCreando] = useState(false);

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
      <ModuleHeader
        title="Pendientes de Recojo"
        subtitle="Ventas con adelanto · saldo por cobrar"
        right={isAdmin ? (
          <button
            onClick={() => setCreando(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white text-[12.5px] font-semibold rounded-lg transition-colors"
          >
            <Plus size={14} /> Nuevo pendiente
          </button>
        ) : undefined}
      />

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

      {creando && (
        <NuevoPendienteModal
          onClose={() => setCreando(false)}
          onSuccess={() => { setCreando(false); fetchDocs(); }}
        />
      )}
    </>
  );
}

// ─── Modal: crear pendiente manual ───────────────────────────────────────────

function NuevoPendienteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [buyerName,     setBuyerName]     = useState("");
  const [buyerPhone,    setBuyerPhone]    = useState("");
  const [total,         setTotal]         = useState("");
  const [adelanto,      setAdelanto]      = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"EFECTIVO" | "TARJETA" | "YAPE">("EFECTIVO");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");

  const saldo = (parseFloat(total) || 0) - (parseFloat(adelanto) || 0);

  async function handleSubmit() {
    setError("");
    const totalNum   = parseFloat(total);
    const adelantoNum = parseFloat(adelanto);

    if (!buyerName.trim()) { setError("El nombre del cliente es requerido"); return; }
    if (!totalNum || totalNum <= 0) { setError("El total debe ser mayor a 0"); return; }
    if (!adelantoNum || adelantoNum <= 0) { setError("El adelanto debe ser mayor a 0"); return; }
    if (adelantoNum >= totalNum) { setError("El adelanto debe ser menor al total"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/ventas/pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim() || undefined,
          total: totalNum,
          montoAdelanto: adelantoNum,
          paymentMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el pendiente");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-ink">Nuevo pendiente manual</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-[12.5px] text-danger">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11.5px] font-medium text-ink-3 mb-1.5">Nombre del cliente *</label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-ink-3 mb-1.5">Teléfono (opcional)</label>
            <input
              type="text"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="Ej: 987 654 321"
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-medium text-ink-3 mb-1.5">Total (S/.)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono placeholder:text-ink-4 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-ink-3 mb-1.5">Adelanto (S/.)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={adelanto}
                onChange={(e) => setAdelanto(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono placeholder:text-ink-4 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {saldo > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex justify-between text-[12.5px]">
              <span className="text-amber-700">Saldo pendiente</span>
              <span className="font-bold font-mono text-amber-700">{formatPEN(saldo)}</span>
            </div>
          )}

          <div>
            <label className="block text-[11.5px] font-medium text-ink-3 mb-1.5">Método de pago del adelanto</label>
            <div className="flex gap-2">
              {(["EFECTIVO", "TARJETA", "YAPE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                    paymentMethod === m
                      ? "bg-accent text-white border-accent"
                      : "bg-surface-light text-ink-3 border-border hover:bg-border"
                  }`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-ink-2 text-[13px] font-medium hover:bg-surface-light transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
          >
            {loading ? "Creando..." : "Crear pendiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
