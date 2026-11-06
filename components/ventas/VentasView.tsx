"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Receipt as ReceiptIcon, X, Trash2, Pencil, Phone, User, Printer, Search, Undo2, IdCard , FileDown, Tag, FileSpreadsheet } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { EnvioModal } from "@/components/envio/EnvioModal";
import { ExportarShalomModal } from "@/components/envio/ExportarShalomModal";
import type { PrescriptionData } from "@/types";
import { TIPOS_DOCUMENTO, tieneDocumento, validarDocumento } from "@/lib/documento";
import { MIN_BUSQUEDA } from "@/lib/busqueda-ventas";

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
  buyerDocType?: string | null;
  buyerDocNumber?: string | null;
  buyerResolvedAt?: string | null;
  channel?: string;
  /** Lo que el cliente escribio al comprar en la web; null si la venta es de mostrador. */
  webOriginal?: { docNumber: string | null; name: string } | null;
  /** Etiqueta de envío: la guardada o, en una venta web sin etiqueta, el courier del pedido. */
  envio?: { courier: string; guardado: boolean } | null;
  montoAdelanto?: number | null;
  notes?: string | null;
  location: string;
  prescription?: PrescriptionData | null;
  createdAt: string;
  cashier: { name: string | null };
  saldoCobradoPor?: { name: string | null } | null;
  saldoCobradoEn?:  string | null;
  saldoPaymentMethod?: string | null;
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
  MIXTO:    "Mixto",
};


const LOCATION_LABEL: Record<string, string> = { TIENDA: "Tienda", ALMACEN: "Almacén", WEB: "Web" };

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

function formatSaldoFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function VentasView() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user.role === "ADMIN";

  const [docs, setDocs]       = useState<Sale[]>([]);
  const [stats, setStats]     = useState<Stats>({ totalVentas: 0, countVentas: 0, ticketPromedio: 0 });
  const [loading, setLoading] = useState(true);
  const [date, setDate]       = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const [allHistory, setAllHistory] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [locationFilter, setLocationFilter] = useState<"ALL" | "TIENDA" | "ALMACEN" | "WEB">("ALL");
  const [deleteDoc, setDeleteDoc]   = useState<Sale | null>(null);
  const [editingDoc, setEditingDoc] = useState<Sale | null>(null);
  const [printDoc,  setPrintDoc]    = useState<Sale | null>(null);
  const [envioDoc,  setEnvioDoc]    = useState<Sale | null>(null);
  const [exportandoShalom, setExportandoShalom] = useState(false);
  const [resolviendo, setResolviendo] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [total, setTotal] = useState(0);

  // Mismo patron inline que ProductGrid, InventoryView y MovimientosView:
  // el repo no tiene un hook compartido de debounce.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  function fetchDocs(d: string, all = false, q = "") {
    setLoading(true);
    const params = new URLSearchParams();
    // Buscar ignora fecha y modo: el servidor recorre todo el historial.
    if (q.trim().length >= MIN_BUSQUEDA) params.set("q", q.trim());
    else if (all) params.set("all", "true");
    else params.set("date", d);

    fetch(`/api/ventas?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const docs: Sale[] = data.docs ?? [];
        setDocs(docs);
        setStats(data.stats);
        setTotal(data.total ?? docs.length);
        setLoading(false);
        resolverPendientes(docs);
      })
      .catch(() => setLoading(false));
  }

  /**
   * Las ventas web traen el DNI que el cliente puso al comprar, pero el nombre
   * del destinatario del envio. Se consultan en lote al cargar; la lista ya esta
   * pintada, asi que los nombres se actualizan solos cuando responde.
   */
  async function resolverPendientes(docs: Sale[]) {
    const ids = docs.filter((d) => d.channel === "WEB" && !d.buyerResolvedAt).map((d) => d.id);
    if (ids.length === 0) return;

    setResolviendo(ids.length);
    try {
      const res = await fetch("/api/ventas/resolver-dni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(0, 60) }),
      });
      if (!res.ok) return;
      const { resueltos } = await res.json();
      for (const r of resueltos ?? []) {
        const { id, ...datos } = r;
        updateDoc(id, datos);
      }
    } catch {
      // Un fallo del proveedor no debe romper el Historial: se reintenta al recargar.
    } finally {
      setResolviendo(0);
    }
  }

  useEffect(() => { fetchDocs(date, allHistory, debouncedQuery); }, [date, allHistory, debouncedQuery]);

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

  const buscando = debouncedQuery.trim().length >= MIN_BUSQUEDA;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const filteredDocs = locationFilter === "ALL" ? docs : docs.filter((d) => d.location === locationFilter);
  const hasAdelantos = filteredDocs.some((d) => d.montoAdelanto != null);
  // El toggle sólo aparece si hay algo más que ventas de mostrador.
  const hasMultipleLocations = docs.some((d) => d.location !== "TIENDA");

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Historial de Ventas" subtitle="Ventas registradas en el punto de venta" />

      <div className="flex-1 overflow-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: allHistory ? "Total ventas" : "Ventas del día", value: String(stats.countVentas), sub: "transacciones" },
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
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
            <div className="relative flex-1 min-w-56 max-w-80">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                className="w-full bg-surface-light border border-border rounded-lg pl-8 pr-8 py-2 text-[13px] text-ink placeholder-ink-4 focus:outline-none focus:border-accent"
                placeholder="Buscar por cliente, DNI, celular, montura o SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  title="Limpiar busqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {buscando && (
              <span className="text-[11.5px] text-ink-4">en todo el historial</span>
            )}
            {!buscando && !allHistory && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
              />
            )}
            {!buscando && !allHistory && date !== today && (
              <button
                onClick={() => setDate(today)}
                className="text-[12px] text-ink-3 hover:text-ink px-3 py-2 bg-surface-light border border-border rounded-lg transition-colors"
              >
                Hoy
              </button>
            )}
            {!buscando && isAdmin && (
              <button
                onClick={() => { setAllHistory((v) => !v); setExpanded(new Set()); }}
                className={`text-[12px] font-medium px-3 py-2 rounded-lg border transition-colors ${
                  allHistory
                    ? "bg-accent text-white border-accent"
                    : "bg-surface-light text-ink-3 border-border hover:text-ink"
                }`}
              >
                {allHistory ? "Todo el historial" : "Ver todo"}
              </button>
            )}
            {hasMultipleLocations && (
              <div className="flex gap-1 bg-surface-light border border-border rounded-lg p-0.5">
                {(["ALL", "TIENDA", "ALMACEN", "WEB"] as const).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocationFilter(loc)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                      locationFilter === loc
                        ? "bg-surface shadow-sm text-ink"
                        : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    {loc === "ALL" ? "Todos" : loc === "TIENDA" ? "Tienda" : loc === "ALMACEN" ? "Almacén" : "Web"}
                  </button>
                ))}
              </div>
            )}
            {resolviendo > 0 && (
              <span className="text-[11.5px] text-ink-4 animate-pulse">
                resolviendo {resolviendo} documento{resolviendo !== 1 ? "s" : ""}...
              </span>
            )}
            <span className="text-[12.5px] text-ink-3 ml-auto">
              {buscando && total > docs.length
                ? `${filteredDocs.length} de ${total} — afina la busqueda`
                : `${filteredDocs.length} ventas`}
            </span>
            {isAdmin && (
            <button
              onClick={() => setExportandoShalom(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg border bg-surface-light text-ink-3 border-border hover:text-ink transition-colors"
              title="Descargar la plantilla de carga masiva de Shalom con los envíos del día"
            >
              <FileSpreadsheet size={13} />
              Exportar a Shalom
            </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-ink-3">Cargando ventas...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-12 text-center">
              <ReceiptIcon size={32} className="mx-auto text-ink-4 mb-3 opacity-50" />
              <p className="text-[13px] text-ink-3">
                {buscando ? `Sin resultados para «${debouncedQuery.trim()}»` : "Sin ventas para esta fecha"}
              </p>
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
                  {hasMultipleLocations && (
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Ubicación</th>
                  )}
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Medida</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Total</th>
                  <th className="px-4 py-2.5 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const open = expanded.has(doc.id);
                  const createdDate = new Date(doc.createdAt);
                  const time = allHistory
                    ? createdDate.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" })
                    : createdDate.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                  const timeSecondary = allHistory
                    ? createdDate.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
                    : null;
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
                        <td className="px-4 py-3 border-b border-border text-[12.5px] font-mono text-ink-3">
                          <span>{time}</span>
                          {timeSecondary && <p className="text-[11px] text-ink-4">{timeSecondary}</p>}
                        </td>
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
                          {tieneDocumento(doc.buyerDocNumber) && (
                            <p className="text-[11px] text-ink-4 font-mono">
                              {doc.buyerDocType ?? "DNI"} {doc.buyerDocNumber}
                            </p>
                          )}
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
                              doc.saldoCobradoPor ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-ink-3 leading-none">{doc.saldoCobradoPor.name ?? "—"}</span>
                                  {doc.saldoCobradoEn && (
                                    <span className="text-[10.5px] text-ink-4 font-mono leading-none">
                                      {formatSaldoFecha(doc.saldoCobradoEn)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-amber-600 font-medium">Pendiente</span>
                              )
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
                        {hasMultipleLocations && (
                          <td className="px-4 py-3 border-b border-border">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              doc.location === "ALMACEN"
                                ? "bg-violet-100 text-violet-700"
                                : doc.location === "WEB"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-surface-dark text-ink-3"
                            }`}>
                              {LOCATION_LABEL[doc.location] ?? doc.location}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 border-b border-border">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            doc.prescription ? "bg-accent/10 text-accent" : "bg-surface-dark text-ink-4"
                          }`}>
                            {doc.prescription ? "SI" : "NO"}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-border text-right">
                          <span className="text-[13px] font-semibold font-mono text-ink">{formatPEN(doc.total)}</span>
                          {doc.montoAdelanto != null && (
                            <div className="text-[11px] font-mono mt-0.5 space-y-0.5">
                              <div className="text-ink-3">
                                Ade: {formatPEN(doc.montoAdelanto)}
                                <span className="ml-1 text-[10px] text-ink-4">({METHOD_LABEL[doc.paymentMethod] ?? doc.paymentMethod})</span>
                              </div>
                              <div className={doc.status === "PARTIAL" ? "text-amber-600" : "text-success"}>
                                Sal: {formatPEN(Math.round((doc.total - doc.montoAdelanto) * 100) / 100)}
                                {doc.saldoPaymentMethod && (
                                  <span className="ml-1 text-[10px] opacity-70">({METHOD_LABEL[doc.saldoPaymentMethod] ?? doc.saldoPaymentMethod})</span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 border-b border-border" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => setPrintDoc(doc)}
                              className="p-1 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-surface-light transition-colors"
                              title="Imprimir ticket"
                            >
                              <Printer size={13} />
                            </button>
                            <a
                              href={`/api/ventas/${doc.id}/pdf?descargar=1`}
                              className="p-1 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-surface-light transition-colors"
                              title="Descargar PDF"
                            >
                              <FileDown size={13} />
                            </a>
                            {isAdmin && (
                            <button
                              onClick={() => setEnvioDoc(doc)}
                              className={`p-1 rounded-lg transition-colors ${doc.envio?.guardado ? "text-accent hover:bg-accent/10" : "text-ink-4 hover:text-ink-2 hover:bg-surface-light"}`}
                              title={doc.envio?.guardado ? `Etiqueta de envío (${doc.envio.courier})` : "Etiqueta de envío"}
                            >
                              <Tag size={13} />
                            </button>
                            )}
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
                          <td colSpan={(hasAdelantos ? 10 : 9) + (hasMultipleLocations ? 1 : 0)} className="px-6 py-3 border-b border-border">
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
                            {(doc.buyerPhone || doc.prescription || tieneDocumento(doc.buyerDocNumber)) && (
                              <div className="mt-3 pt-3 border-t border-border space-y-2">
                                {(doc.buyerName || doc.buyerPhone || tieneDocumento(doc.buyerDocNumber)) && (
                                  <div className="flex gap-4">
                                    {doc.buyerName && (
                                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                                        <User size={11} className="text-ink-4" />
                                        <span>{doc.buyerName}</span>
                                      </div>
                                    )}
                                    {tieneDocumento(doc.buyerDocNumber) && (
                                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                                        <IdCard size={11} className="text-ink-4" />
                                        <span className="font-mono">{doc.buyerDocType ?? "DNI"} {doc.buyerDocNumber}</span>
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
            fetchDocs(date, allHistory, debouncedQuery);
            router.refresh();
          }}
        />
      )}

      {printDoc && (
        <ReceiptModal documentId={printDoc.id} onClose={() => setPrintDoc(null)} />
      )}

      {envioDoc && (
        <EnvioModal
          documentId={envioDoc.id}
          fullNumber={envioDoc.fullNumber}
          onClose={() => setEnvioDoc(null)}
          onGuardado={(e) =>
            setDocs((prev) =>
              prev.map((d) => (d.id === envioDoc.id ? { ...d, envio: { courier: e.courier, guardado: true } } : d))
            )
          }
        />
      )}

      {exportandoShalom && (
        <ExportarShalomModal
          fechaInicial={buscando || allHistory ? today : date}
          onClose={() => setExportandoShalom(false)}
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
  const [docType, setDocType] = useState(doc.buyerDocType ?? "DNI");
  const [docNumber, setDocNumber] = useState(
    tieneDocumento(doc.buyerDocNumber) ? doc.buyerDocNumber : ""
  );
  const [lookup, setLookup] = useState<"idle" | "loading" | "found" | "not_found">("idle");

  // Una boleta o factura ya se emitio a SUNAT con ese documento.
  const puedeEditarDoc = doc.type === "NOTA_VENTA";
  const original = doc.webOriginal;

  async function buscarDocumento() {
    const n = docNumber.trim();
    if (!n) return;
    setLookup("loading");
    try {
      const res = await fetch(`/api/clientes?docNumber=${encodeURIComponent(n)}`);
      const json = await res.json();
      if (json.customer) {
        setName(json.customer.name);
        setDocType(json.customer.docType);
        setDocNumber(json.customer.docNumber);
        setLookup("found");
      } else {
        setLookup("not_found");
      }
    } catch {
      setLookup("not_found");
    }
  }

  /** Devuelve el formulario a lo que el cliente escribio al comprar en la web. */
  function revertirAWeb() {
    if (!original) return;
    setName(original.name);
    setDocNumber(original.docNumber ?? "");
    setDocType("DNI");
    setLookup("idle");
  }
  const [notes, setNotes] = useState(doc.notes ?? "");
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
      const prescription: PrescriptionData | null = hasRx
        ? { od, oi, ...(add ? { add } : {}), ...(pd ? { pd } : {}) }
        : null;

      const docLimpio = docNumber.trim();
      if (puedeEditarDoc && docLimpio) {
        const motivo = validarDocumento(docType, docLimpio);
        if (motivo) throw new Error(motivo);
      }

      const res = await fetch(`/api/ventas/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName:  name.trim() || undefined,
          buyerPhone: phone.trim() || undefined,
          notes:      notes.trim() || undefined,
          ...(puedeEditarDoc && docLimpio
            ? { buyerDocType: docType, buyerDocNumber: docLimpio }
            : {}),
          prescription,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      onUpdate({
        buyerName:       json.buyerName,
        buyerPhone:      json.buyerPhone,
        buyerDocType:    json.buyerDocType,
        buyerDocNumber:  json.buyerDocNumber,
        buyerResolvedAt: json.buyerResolvedAt,
        notes:           json.notes,
        prescription:    json.prescription,
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
              <label className="block text-[12px] text-ink-3 mb-1">Documento</label>
              <div className="flex gap-2">
                <select
                  value={docType}
                  onChange={(e) => { setDocType(e.target.value); setLookup("idle"); }}
                  disabled={!puedeEditarDoc}
                  className="bg-surface-light border border-border rounded-lg px-2 py-2 text-[13px] text-ink focus:outline-none focus:border-accent disabled:opacity-50"
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={docNumber}
                  onChange={(e) => { setDocNumber(e.target.value); setLookup("idle"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarDocumento(); } }}
                  disabled={!puedeEditarDoc}
                  placeholder={docType === "RUC" ? "11 digitos" : docType === "DNI" ? "8 digitos" : "Numero"}
                  className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent font-mono disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={buscarDocumento}
                  disabled={!puedeEditarDoc || lookup === "loading" || !docNumber.trim()}
                  title="Buscar titular"
                  className="px-3 rounded-lg border border-border text-ink-3 hover:text-ink hover:border-accent transition-colors disabled:opacity-40"
                >
                  <Search size={14} />
                </button>
              </div>
              {!puedeEditarDoc && (
                <p className="text-[11px] text-ink-4 mt-1.5">
                  El comprobante ya se emitio a SUNAT con este documento, por eso no se puede cambiar.
                </p>
              )}
              {puedeEditarDoc && lookup === "found" && (
                <p className="text-[11px] text-success mt-1.5">Encontrado - nombre autocompletado</p>
              )}
              {puedeEditarDoc && lookup === "not_found" && (
                <p className="text-[11px] text-warning mt-1.5">No encontrado - escribe el nombre a mano</p>
              )}
              {puedeEditarDoc && original && (
                <button
                  type="button"
                  onClick={revertirAWeb}
                  className="flex items-center gap-1.5 text-[11.5px] text-ink-3 hover:text-ink transition-colors mt-2"
                >
                  <Undo2 size={12} />
                  Revertir a los datos de la web
                </button>
              )}
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
            <div>
              <label className="block text-[12px] text-ink-3 mb-1">Nota adicional</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: lentes para lejos, entrega el viernes..."
                rows={3}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent resize-none"
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

