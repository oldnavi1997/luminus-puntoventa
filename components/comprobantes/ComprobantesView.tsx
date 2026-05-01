"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Download, XCircle } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";

interface Doc {
  id: string;
  fullNumber: string;
  serie: string;
  correlativo: number;
  type: "BOLETA" | "FACTURA" | "NOTA_VENTA";
  status: string;
  total: number;
  buyerName?: string | null;
  buyerDocNumber?: string | null;
  paymentMethod: string;
  createdAt: string;
  pdfUrl?: string | null;
}

interface Stats {
  emitidosHoy: number;
  totalAceptado: number;
  pendientes: number;
  rechazados: number;
  notasHoy: number;
}

type TypeFilter   = "all" | "BOLETA" | "FACTURA";
type StatusFilter = "all" | "ACCEPTED" | "PENDING" | "REJECTED" | "VOIDED";

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED:     "Aceptado",
  PENDING:      "Pendiente",
  REJECTED:     "Rechazado",
  DRAFT:        "Borrador",
  VOIDED:       "Anulado",
  VOID_PENDING: "Anulando...",
};

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA:  "Tarjeta",
  YAPE:     "Yape",
};

export function ComprobantesView({ isAdmin }: { isAdmin: boolean }) {
  const [docs,    setDocs]    = useState<Doc[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [type,    setType]    = useState<TypeFilter>("all");
  const [status,  setStatus]  = useState<StatusFilter>("all");
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));

  const [voidDoc,     setVoidDoc]     = useState<Doc | null>(null);
  const [voidMotivo,  setVoidMotivo]  = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError,   setVoidError]   = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type   !== "all") params.set("type",   type);
    if (status !== "all") params.set("status", status);
    if (date)              params.set("date",   date);

    const res  = await fetch(`/api/comprobantes?${params}`);
    const json = await res.json();
    setDocs(json.docs  ?? []);
    setStats(json.stats ?? null);
    setLoading(false);
  }, [type, status, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleVoid() {
    if (!voidDoc || voidMotivo.trim().length < 5) return;
    setVoidLoading(true);
    setVoidError("");
    try {
      const res  = await fetch(`/api/ventas/${voidDoc.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: voidMotivo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al anular");
      setVoidDoc(null);
      setVoidMotivo("");
      fetchData();
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : "Error al anular");
    } finally {
      setVoidLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Comprobantes"
        subtitle="Boletas, facturas y estado SUNAT"
        right={
          <button className="flex items-center gap-2 bg-surface-light border border-border text-ink rounded-lg px-3 py-1.5 text-[13px] font-medium hover:bg-border transition-colors">
            <Download size={14} /> Exportar XML
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Emitidos SUNAT",   value: String(stats.emitidosHoy),  sub: "Boletas + Facturas",         color: "" },
              { label: "Notas de Venta",   value: String(stats.notasHoy),     sub: "Pendientes de conversión",   color: "text-ink-2" },
              { label: "Pendientes",       value: String(stats.pendientes),   sub: "Esperando CDR",              color: "text-warning" },
              { label: "Rechazados",       value: String(stats.rechazados),   sub: "Requieren atención",         color: "text-danger" },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
                <div className={`text-[22px] font-bold font-mono tracking-tight ${s.color || "text-ink"}`}>{s.value}</div>
                <div className="text-[11.5px] text-ink-3 mt-1">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
            {/* Type filter */}
            <div className="flex bg-surface-light rounded-lg p-0.5 gap-0.5 border border-border">
              {(["all", "BOLETA", "FACTURA"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${type === t ? "bg-surface shadow-sm text-ink" : "text-ink-3"}`}
                >
                  {t === "all" ? "Todos" : t === "BOLETA" ? "Boletas" : "Facturas"}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex bg-surface-light rounded-lg p-0.5 gap-0.5 border border-border">
              {(["all", "ACCEPTED", "PENDING", "REJECTED", "VOIDED"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${status === s ? "bg-surface shadow-sm text-ink" : "text-ink-3"}`}
                >
                  {s === "all" ? "Todos" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* Date */}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-auto bg-surface-light border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-accent"
            />
          </div>

          {loading ? (
            <div className="p-8 text-center text-ink-3">Cargando comprobantes...</div>
          ) : docs.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={32} className="mx-auto text-ink-4 mb-3 opacity-50" />
              <p className="text-[13px] text-ink-3">Sin comprobantes en este período</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-light">
                  {["", "Serie-Número", "Cliente", "Doc.", "Hora", "Total", "Estado", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border ${i >= 4 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className={`hover:bg-surface-light transition-colors ${d.status === "VOIDED" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 border-b border-border w-14">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold tracking-wide ${
                        d.type === "FACTURA"    ? "bg-accent-soft text-accent"   :
                        d.type === "NOTA_VENTA" ? "bg-surface-dark text-ink-3"  :
                                                  "bg-success-soft text-success"
                      }`}>
                        {d.type === "FACTURA" ? "FACT" : d.type === "NOTA_VENTA" ? "NV" : "BOL"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <span className="text-[13px] font-semibold text-ink font-mono">{d.fullNumber}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-[13px] text-ink max-w-[180px]">
                      <span className="truncate block">{d.buyerName ?? "Consumidor final"}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-[12px] text-ink-3 font-mono">
                      {d.buyerDocNumber && d.buyerDocNumber !== "00000000" ? d.buyerDocNumber : "—"}
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right text-[12px] text-ink-3 font-mono">
                      {new Date(d.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <span className="text-[13px] font-semibold font-mono text-ink">{formatPEN(d.total)}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                        d.status === "ACCEPTED"     ? "bg-success-soft text-success" :
                        d.status === "PENDING"      ? "bg-warning-soft text-warning" :
                        d.status === "REJECTED"     ? "bg-danger-soft text-danger"   :
                        d.status === "VOID_PENDING" ? "bg-warning-soft text-warning" :
                        d.status === "VOIDED"       ? "bg-surface-dark text-ink-3"   :
                        "bg-surface-light text-ink-3"
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                        {STATUS_LABEL[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <div className="flex items-center justify-end gap-2">
                        {d.pdfUrl && (
                          <a
                            href={d.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border px-3 py-1 rounded-lg transition-colors border border-border"
                          >
                            PDF
                          </a>
                        )}
                        {isAdmin && d.status === "ACCEPTED" && d.type !== "NOTA_VENTA" && (
                          <button
                            onClick={() => { setVoidDoc(d); setVoidMotivo(""); setVoidError(""); }}
                            className="text-[12px] text-danger bg-danger-soft hover:bg-danger/20 px-3 py-1 rounded-lg transition-colors border border-danger/20"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal anulación */}
      {voidDoc && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <XCircle size={20} className="text-danger shrink-0" />
              <div>
                <h2 className="font-semibold text-ink text-[15px]">Anular comprobante</h2>
                <p className="text-[11px] font-mono text-ink-3">{voidDoc.fullNumber} · {formatPEN(voidDoc.total)}</p>
              </div>
            </div>

            <p className="text-[12.5px] text-ink-3">
              Esta acción enviará un comunicado de baja a SUNAT y no se puede deshacer.
            </p>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1 block">
                Motivo de anulación *
              </label>
              <textarea
                value={voidMotivo}
                onChange={(e) => setVoidMotivo(e.target.value)}
                placeholder="Ej: Error en datos del cliente"
                rows={2}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-danger resize-none"
              />
              {voidMotivo.trim().length > 0 && voidMotivo.trim().length < 5 && (
                <p className="text-[11px] text-warning mt-1">Mínimo 5 caracteres</p>
              )}
            </div>

            {voidError && <p className="text-[12px] text-danger">{voidError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setVoidDoc(null)}
                className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink hover:bg-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleVoid}
                disabled={voidLoading || voidMotivo.trim().length < 5}
                className="flex-1 bg-danger hover:bg-danger-dark disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
              >
                {voidLoading ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
