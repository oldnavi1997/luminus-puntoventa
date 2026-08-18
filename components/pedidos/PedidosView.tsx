"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, Truck, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";

interface Pedido {
  id: string;
  orderNumber: string;
  shippingName: string;
  shippingPhone: string | null;
  shippingCity: string;
  shippingProvince: string;
  shippingCourier: string | null;
  documentNumber: string | null;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  stockIssue: string | null;
  comprobante: string | null;
  comprobanteStatus: string | null;
  itemsCount: number;
  createdAt: string;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING:    "Pendiente",
  PAID:       "Pagado",
  PROCESSING: "Procesando",
  SHIPPED:    "Enviado",
  DELIVERED:  "Entregado",
  CANCELLED:  "Cancelado",
  REFUNDED:   "Reembolsado",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING:    "bg-surface-dark text-ink-3",
  PAID:       "bg-success-soft text-success",
  PROCESSING: "bg-accent-soft text-accent",
  SHIPPED:    "bg-sky-100 text-sky-700",
  DELIVERED:  "bg-success-soft text-success",
  CANCELLED:  "bg-danger/15 text-danger",
  REFUNDED:   "bg-warning/15 text-warning",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING:    "Pago pendiente",
  APPROVED:   "Pagado",
  REJECTED:   "Rechazado",
  IN_PROCESS: "En proceso",
  CANCELLED:  "Cancelado",
};

const COURIER_LABEL: Record<string, string> = {
  shalom: "Shalom",
  olva:   "Olva Courier",
};

const FILTROS = ["", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

function fechaLima(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PedidosView() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState<string>("");
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [total, setTotal]     = useState(0);

  const fetchPedidos = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (status) params.set("status", status);
    fetch(`/api/pedidos?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setPedidos(data.orders ?? []);
        setPages(data.pages ?? 1);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  const facturado = pedidos
    .filter((p) => p.paymentStatus === "APPROVED")
    .reduce((s, p) => s + p.total, 0);
  const conIncidencia = pedidos.filter((p) => p.stockIssue).length;

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Ventas web" subtitle="Pedidos del ecommerce" />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Pedidos", value: String(total), sub: "en el filtro actual" },
            { label: "Facturado", value: formatPEN(facturado), sub: "pagos aprobados en esta página", color: "text-success" },
            { label: "Con incidencia", value: String(conIncidencia), sub: "requieren revisión de stock", color: conIncidencia > 0 ? "text-danger" : undefined },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
              <div className={`text-[22px] font-bold font-mono tracking-tight ${s.color ?? "text-ink"}`}>{s.value}</div>
              <div className="text-[11.5px] text-ink-3 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="flex gap-1 bg-surface-light border border-border rounded-lg p-0.5">
              {FILTROS.map((f) => (
                <button
                  key={f || "ALL"}
                  onClick={() => { setStatus(f); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    status === f ? "bg-surface shadow-sm text-ink" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {f ? ORDER_STATUS_LABEL[f] : "Todos"}
                </button>
              ))}
            </div>
            <span className="text-[12.5px] text-ink-3 ml-auto">{pedidos.length} de {total}</span>
          </div>

          {loading ? (
            <div className="py-14 text-center text-[13px] text-ink-3">Cargando pedidos...</div>
          ) : pedidos.length === 0 ? (
            <div className="py-14 text-center">
              <Globe size={30} className="mx-auto text-ink-4 mb-2 opacity-50" />
              <p className="text-[13px] text-ink-3">No hay pedidos web con este filtro.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-light">
                  {["Pedido", "Cliente", "Destino", "Comprobante", "Estado", "Total"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border ${
                        i === 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-light/60 transition-colors">
                    <td className="px-4 py-3 border-b border-border">
                      <div className="font-mono text-[13px] text-ink">{p.orderNumber}</div>
                      <div className="text-[11px] text-ink-4 mt-0.5">
                        {fechaLima(p.createdAt)} · {p.itemsCount} ítem{p.itemsCount !== 1 ? "s" : ""}
                      </div>
                      {p.stockIssue && (
                        <div className="flex items-start gap-1 mt-1 text-[11px] text-danger">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{p.stockIssue}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <div className="text-[13px] text-ink">{p.shippingName}</div>
                      <div className="text-[11px] font-mono text-ink-4 mt-0.5">
                        {[p.documentNumber, p.shippingPhone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <div className="text-[13px] text-ink">{p.shippingCity}</div>
                      <div className="flex items-center gap-1 text-[11px] text-ink-4 mt-0.5">
                        {p.shippingCourier && <Truck size={11} />}
                        {p.shippingCourier ? COURIER_LABEL[p.shippingCourier] ?? p.shippingCourier : p.shippingProvince}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      {p.comprobante ? (
                        <>
                          <div className="font-mono text-[12.5px] text-ink">{p.comprobante}</div>
                          {p.comprobanteStatus === "VOIDED" && (
                            <div className="text-[11px] text-danger mt-0.5">anulado</div>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-ink-4">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        ORDER_STATUS_COLOR[p.orderStatus] ?? "bg-surface-dark text-ink-3"
                      }`}>
                        {ORDER_STATUS_LABEL[p.orderStatus] ?? p.orderStatus}
                      </span>
                      {p.paymentStatus !== "APPROVED" && (
                        <div className="text-[11px] text-ink-4 mt-0.5">
                          {PAYMENT_STATUS_LABEL[p.paymentStatus] ?? p.paymentStatus}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right font-mono text-[13px] font-semibold text-ink">
                      {formatPEN(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md text-ink-3 hover:bg-surface-light disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[12.5px] text-ink-3 tabular-nums">{page} / {pages}</span>
              <button
                onClick={() => setPage((n) => Math.min(pages, n + 1))}
                disabled={page >= pages}
                className="p-1.5 rounded-md text-ink-3 hover:bg-surface-light disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <p className="text-[11.5px] text-ink-4 mt-3">
          Las ventas web se cancelan o reembolsan desde el panel del ecommerce; ahí se devuelve el
          stock a almacén y tienda y se anula el comprobante.
        </p>
      </div>
    </div>
  );
}
