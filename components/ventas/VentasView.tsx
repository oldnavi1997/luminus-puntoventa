"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Receipt, X, Trash2, Pencil, Phone, User } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";
import type { PrescriptionData } from "@/types";

interface SaleItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sku: string | null;
}

interface Sale {
  id: string;
  fullNumber: string;
  type: "BOLETA" | "FACTURA" | "NOTA_VENTA";
  status: string;
  paymentMethod: string;
  subtotal: number;
  igv: number;
  total: number;
  discount: number;
  buyerName: string | null;
  buyerPhone?: string | null;
  montoAdelanto?: number | null;
  prescription?: PrescriptionData | null;
  createdAt: string;
  cashier: { name: string | null };
  saldoCobradoPor?: { name: string | null } | null;
  items: SaleItem[];
}

interface Stats {
  totalVentas: number;
  countVentas: number;
  ticketPromedio: number;
}

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA:  "Tarjeta",
  YAPE:     "Yape",
};

const STATUS_COLOR: Record<string, string> = {
  ACCEPTED:     "bg-success-soft text-success",
  PENDING:      "bg-warning-soft text-warning",
  REJECTED:     "bg-danger-soft text-danger",
  VOIDED:       "bg-surface-dark text-ink-3",
  VOID_PENDING: "bg-warning-soft text-warning",
  PARTIAL:      "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED:     "Aceptado",
  PENDING:      "Pendiente",
  REJECTED:     "Rechazado",
  VOIDED:       "Anulado",
  VOID_PENDING: "Anulando",
  PARTIAL:      "Adelanto",
};

export function VentasView() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";

  const [docs, setDocs]       = useState<Sale[]>([]);
  const [stats, setStats]     = useState<Stats>({ totalVentas: 0, countVentas: 0, ticketPromedio: 0 });
  const [loading, setLoading] = useState(true);
  const [date, setDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteDoc, setDeleteDoc]   = useState<Sale | null>(null);
  const [editingDoc, setEditingDoc] = useState<Sale | null>(null);

  function fetchDocs(d: string) {
    setLoading(true);
    fetch(`/api/ventas?date=${d}`)
      .then((r) => r.json())
      .then((data) => { setDocs(data.docs ?? []); setStats(data.stats); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { fetchDocs(date); }, [date]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function updateDoc(id: string, data: Partial<Sale>) {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, ...data } : d));
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasAdelantos = docs.some((d) => d.montoAdelanto != null);

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Historial de Ventas" subtitle="Ventas registradas en el punto de venta" />

      <div className="flex-1 overflow-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Ventas del día", value: String(stats.countVentas), sub: "transacciones" },
            { label: "Total facturado",  value: formatPEN(stats.totalVentas),  sub: "monto bruto", color: "text-success" },
            { label: "Ticket promedio",  value: formatPEN(stats.ticketPromedio), sub: "por venta", color: "text-accent" },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
              <div className={`text-[22px] font-bold font-mono tracking-tight ${s.color ?? "text-ink"}`}>{s.value}</div>
              <div className="text-[11.5px] text-ink-3 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
            />
            {date !== today && (
              <button
                onClick={() => setDate(today)}
                className="text-[12px] text-ink-3 hover:text-ink px-3 py-2 bg-surface-light border border-border rounded-lg transition-colors"
              >
                Hoy
              </button>
            )}
            <span className="text-[12.5px] text-ink-3 ml-auto">{docs.length} ventas</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ink-3">Cargando ventas...</div>
          ) : docs.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt size={32} className="mx-auto text-ink-4 mb-3 opacity-50" />
              <p className="text-[13px] text-ink-3">Sin ventas para esta fecha</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-light">
                  <th className="w-8 px-3 py-2.5 border-b border-border" />
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Hora</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Documento</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Cliente</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Cajero</th>
                  {hasAdelantos && (
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Cobró saldo</th>
                  )}
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Pago</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Estado</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Total</th>
                  <th className="px-4 py-2.5 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const open = expanded.has(doc.id);
                  const time = new Date(doc.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                  const hasExtra = doc.buyerPhone || doc.prescription;
                  return (
                    <>
                      <tr
                        key={doc.id}
                        className="hover:bg-surface-light transition-colors cursor-pointer"
                        onClick={() => toggleExpand(doc.id)}
                      >
                        <td className="px-3 py-3 border-b border-border text-ink-3">
                          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </td>
                        <td className="px-4 py-3 border-b border-border text-[12.5px] font-mono text-ink-3">{time}</td>
                        <td className="px-4 py-3 border-b border-border">
                          <span className="text-[13px] font-medium text-ink font-mono">{doc.fullNumber}</span>
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            doc.type === "BOLETA" ? "bg-accent/10 text-accent"
                            : doc.type === "FACTURA" ? "bg-success-soft text-success"
                            : "bg-surface-dark text-ink-3"
                          }`}>{doc.type === "NOTA_VENTA" ? "NV" : doc.type}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-border">
                          <p className="text-[12.5px] text-ink-3">{doc.buyerName ?? "—"}</p>
                          {doc.buyerPhone && (
                            <p className="text-[11px] text-ink-4 font-mono">{doc.buyerPhone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 border-b border-border text-[12.5px] text-ink-3">
                          {doc.cashier.name ?? "—"}
                        </td>
                        {hasAdelantos && (
                          <td className="px-4 py-3 border-b border-border text-[12.5px]">
                            {doc.montoAdelanto != null ? (
                              doc.saldoCobradoPor
                                ? <span className="text-ink-3">{doc.saldoCobradoPor.name ?? "—"}</span>
                                : <span className="text-amber-600 font-medium">Pendiente</span>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 border-b border-border text-[12.5px] text-ink-3">
                          {METHOD_LABEL[doc.paymentMethod] ?? doc.paymentMethod}
                        </td>
                        <td className="px-4 py-3 border-b border-border">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[doc.status] ?? "bg-surface-dark text-ink-3"}`}>
                            {STATUS_LABEL[doc.status] ?? doc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-border text-right">
                          <span className="text-[13px] font-semibold font-mono text-ink">{formatPEN(doc.total)}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-border" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => setEditingDoc(doc)}
                              className={`p-1 rounded-lg transition-colors ${hasExtra ? "text-accent hover:bg-accent/10" : "text-ink-4 hover:text-ink-2 hover:bg-surface-light"}`}
                              title="Editar datos del cliente"
                            >
                              <Pencil size={13} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => setDeleteDoc(doc)}
                                className="p-1 rounded-lg text-ink-4 hover:text-danger hover:bg-danger-soft transition-colors"
                                title="Eliminar venta"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {open && (
                        <tr key={`${doc.id}-items`} className="bg-surface-light">
                          <td colSpan={hasAdelantos ? 9 : 8} className="px-6 py-3 border-b border-border">
                            <table className="w-full">
                              <thead>
                                <tr>
                                  <th className="text-left text-[10px] uppercase tracking-[0.06em] text-ink-4 font-medium pb-1.5">SKU</th>
                                  <th className="text-left text-[10px] uppercase tracking-[0.06em] text-ink-4 font-medium pb-1.5">Producto</th>
                                  <th className="text-right text-[10px] uppercase tracking-[0.06em] text-ink-4 font-medium pb-1.5">Cant.</th>
                                  <th className="text-right text-[10px] uppercase tracking-[0.06em] text-ink-4 font-medium pb-1.5">P. Unit.</th>
                                  <th className="text-right text-[10px] uppercase tracking-[0.06em] text-ink-4 font-medium pb-1.5">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {doc.items.map((item, i) => (
                                  <tr key={i}>
                                    <td className="text-[11.5px] font-mono text-ink-3 pr-4 py-1">{item.sku ?? "—"}</td>
                                    <td className="text-[12px] text-ink py-1">{item.description}</td>
                                    <td className="text-[12px] font-mono text-ink-3 text-right py-1">{item.quantity}</td>
                                    <td className="text-[12px] font-mono text-ink-3 text-right py-1">{formatPEN(item.unitPrice)}</td>
                                    <td className="text-[12px] font-mono font-medium text-ink text-right py-1">{formatPEN(item.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              {doc.discount > 0 && (
                                <tfoot>
                                  <tr>
                                    <td colSpan={4} className="text-right text-[11px] text-ink-3 pt-1.5">Descuento</td>
                                    <td className="text-right text-[12px] font-mono text-danger pt-1.5">-{formatPEN(doc.discount)}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>

                            {/* Datos adicionales del cliente */}
                            {(doc.buyerPhone || doc.prescription) && (
                              <div className="mt-3 pt-3 border-t border-border space-y-2">
                                {(doc.buyerName || doc.buyerPhone) && (
                                  <div className="flex gap-4">
                                    {doc.buyerName && (
                                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                                        <User size={11} className="text-ink-4" />
                                        <span>{doc.buyerName}</span>
                                      </div>
                                    )}
                                    {doc.buyerPhone && (
                                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                                        <Phone size={11} className="text-ink-4" />
                                        <span className="font-mono">{doc.buyerPhone}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {doc.prescription && (
                                  <PrescriptionDisplay rx={doc.prescription} />
                                )}
                              </div>
                            )}

                            {doc.cashier.name && (
                              <p className="text-[11px] text-ink-4 mt-2">Atendido por: {doc.cashier.name}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingDoc && (
        <EditDatosModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onUpdate={(data) => {
            updateDoc(editingDoc.id, data);
            setEditingDoc(null);
          }}
        />
      )}

      {deleteDoc && (
        <DeleteModal
          doc={deleteDoc}
          onClose={() => setDeleteDoc(null)}
          onSuccess={() => {
            setDeleteDoc(null);
            fetchDocs(date);
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers para rangos de graduación ───────────────────────────────────────

function genSphereOpts(): string[] {
  const opts: string[] = [];
  for (let v = -600; v <= 500; v += 25) {
    const s = (v / 100).toFixed(2);
    opts.push(v > 0 ? `+${s}` : s);
  }
  return opts;
}

function genCylinderOpts(): string[] {
  const opts = ["0.00"];
  for (let v = -25; v >= -600; v -= 25) {
    opts.push((v / 100).toFixed(2));
  }
  return opts;
}

const SPHERE_OPTS   = genSphereOpts();
const CYLINDER_OPTS = genCylinderOpts();
const AXIS_OPTS     = Array.from({ length: 180 }, (_, i) => String(i + 1));

const EMPTY_EYE = { sphere: "0.00", cylinder: "0.00", axis: "1" };

// ─── PrescriptionDisplay ──────────────────────────────────────────────────────

function PrescriptionDisplay({ rx }: { rx: PrescriptionData }) {
  const rows = [
    { label: "OD", ...rx.od },
    { label: "OI", ...rx.oi },
  ];
  return (
    <div className="text-[11.5px]">
      <p className="text-[10px] uppercase tracking-wide text-ink-4 font-medium mb-1.5">Graduación</p>
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] text-ink-4 pr-4 pb-0.5 font-medium w-8" />
            <th className="text-center text-[10px] text-ink-4 pr-3 pb-0.5 font-medium">Esfera</th>
            <th className="text-center text-[10px] text-ink-4 pr-3 pb-0.5 font-medium">Cilindro</th>
            <th className="text-center text-[10px] text-ink-4 pr-4 pb-0.5 font-medium">Eje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="text-[10px] font-bold text-ink-3 pr-4 py-0.5">{r.label}</td>
              <td className="font-mono text-ink pr-3 py-0.5 text-center">{r.sphere}</td>
              <td className="font-mono text-ink pr-3 py-0.5 text-center">{r.cylinder}</td>
              <td className="font-mono text-ink pr-4 py-0.5 text-center">{r.axis}°</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(rx.add || rx.pd) && (
        <div className="flex gap-4 mt-1">
          {rx.add && <span className="text-ink-3">Add: <span className="font-mono text-ink">{rx.add}</span></span>}
          {rx.pd  && <span className="text-ink-3">DP: <span className="font-mono text-ink">{rx.pd}</span></span>}
        </div>
      )}
    </div>
  );
}

// ─── EditDatosModal ───────────────────────────────────────────────────────────

function EditDatosModal({
  doc,
  onClose,
  onUpdate,
}: {
  doc: Sale;
  onClose: () => void;
  onUpdate: (data: Partial<Sale>) => void;
}) {
  const [name, setName]   = useState(doc.buyerName ?? "");
  const [phone, setPhone] = useState(doc.buyerPhone ?? "");
  const [hasRx, setHasRx] = useState(!!doc.prescription);

  const [od, setOd] = useState<PrescriptionData["od"]>(doc.prescription?.od ?? { ...EMPTY_EYE });
  const [oi, setOi] = useState<PrescriptionData["oi"]>(doc.prescription?.oi ?? { ...EMPTY_EYE });
  const [add, setAdd] = useState(doc.prescription?.add ?? "");
  const [pd, setPd]   = useState(doc.prescription?.pd  ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      const prescription: PrescriptionData | undefined = hasRx
        ? { od, oi, ...(add ? { add } : {}), ...(pd ? { pd } : {}) }
        : undefined;

      const res = await fetch(`/api/ventas/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName:  name.trim() || undefined,
          buyerPhone: phone.trim() || undefined,
          prescription,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      onUpdate({
        buyerName:   json.buyerName,
        buyerPhone:  json.buyerPhone,
        prescription: json.prescription,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center px-5 py-4 border-b border-border sticky top-0 bg-surface">
          <div>
            <h2 className="font-semibold text-ink text-[15px]">Datos del cliente</h2>
            <p className="text-[11px] text-ink-3 font-mono mt-0.5">{doc.fullNumber}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Datos básicos */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-4 font-medium">Datos del cliente</p>
            <div>
              <label className="block text-[12px] text-ink-3 mb-1">Nombres</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[12px] text-ink-3 mb-1">Celular</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: 987654321"
                type="tel"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent font-mono"
              />
            </div>
          </div>

          {/* Toggle graduación */}
          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setHasRx(!hasRx)}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${hasRx ? "bg-accent" : "bg-border"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasRx ? "translate-x-5" : ""}`} />
              </div>
              <p className="text-[13px] font-medium text-ink">Agregar medidas de graduación</p>
            </label>
          </div>

          {/* Formulario de graduación */}
          {hasRx && (
            <div className="space-y-4">
              {[
                { label: "Ojo Derecho (OD)", val: od, set: setOd },
                { label: "Ojo Izquierdo (OI)", val: oi, set: setOi },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <p className="text-[11px] uppercase tracking-[0.06em] text-ink-4 font-medium mb-2">{label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10.5px] text-ink-4 mb-1">Esfera</p>
                      <select
                        value={val.sphere}
                        onChange={(e) => set({ ...val, sphere: e.target.value })}
                        className="w-full bg-surface-light border border-border rounded-lg px-2 py-2 text-[12px] font-mono text-ink focus:outline-none focus:border-accent"
                      >
                        {SPHERE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10.5px] text-ink-4 mb-1">Cilindro</p>
                      <select
                        value={val.cylinder}
                        onChange={(e) => set({ ...val, cylinder: e.target.value })}
                        className="w-full bg-surface-light border border-border rounded-lg px-2 py-2 text-[12px] font-mono text-ink focus:outline-none focus:border-accent"
                      >
                        {CYLINDER_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10.5px] text-ink-4 mb-1">Eje</p>
                      <select
                        value={val.axis}
                        onChange={(e) => set({ ...val, axis: e.target.value })}
                        className="w-full bg-surface-light border border-border rounded-lg px-2 py-2 text-[12px] font-mono text-ink focus:outline-none focus:border-accent"
                      >
                        {AXIS_OPTS.map((o) => <option key={o} value={o}>{o}°</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-ink-4 mb-1">Add (adición)</label>
                  <input
                    value={add}
                    onChange={(e) => setAdd(e.target.value)}
                    placeholder="Ej: +2.00"
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-ink focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-4 mb-1">DP (distancia pupilar)</label>
                  <input
                    value={pd}
                    onChange={(e) => setPd(e.target.value)}
                    placeholder="Ej: 62"
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink transition-colors hover:bg-border"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({ doc, onClose, onSuccess }: { doc: Sale; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ventas/${doc.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-[15px]">Eliminar venta</h2>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[13px] text-ink-3">
            ¿Seguro que deseas eliminar <span className="font-semibold text-ink font-mono">{doc.fullNumber}</span>?
            Esta acción no se puede deshacer.
          </p>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink transition-colors hover:bg-border"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 bg-danger hover:bg-danger/90 disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
            >
              {loading ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

