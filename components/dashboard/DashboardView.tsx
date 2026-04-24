"use client";

import { useState, useEffect } from "react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";

interface DashboardData {
  totalVentas: number;
  countVentas: number;
  ticketPromedio: number;
  margenEstimado: number;
  deltaVentas: number;
  byType: { boletas: number; facturas: number; notasVenta: number };
  byMethod: { efectivo: number; tarjeta: number; yape: number; mixto: number };
  byLocation: {
    tienda:  { total: number; count: number };
    almacen: { total: number; count: number };
  };
  adelantosPendientes: { count: number; montoRecibido: number; montoTotal: number };
  hourly: { hour: string; total: number }[];
  lowStock: { id: string; name: string; sku: string | null; stock: number; stockTienda: number; stockAlmacen: number; category: string }[];
}

export function DashboardView() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("es-PE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  if (loading || !data) {
    return (
      <div className="flex flex-col h-full">
        <ModuleHeader title="Dashboard" subtitle={today} />
        <div className="flex-1 flex items-center justify-center text-ink-3">
          Cargando resumen…
        </div>
      </div>
    );
  }

  const maxHourly = Math.max(...data.hourly.map((h) => h.total), 1);

  const methodRows = [
    { label: "Efectivo", amount: data.byMethod.efectivo, color: "bg-success"   },
    { label: "Tarjeta",  amount: data.byMethod.tarjeta,  color: "bg-accent"    },
    { label: "Yape",     amount: data.byMethod.yape,     color: "bg-[#7c3aed]" },
    { label: "Mixto",    amount: data.byMethod.mixto,    color: "bg-warning"   },
  ];
  const totalMethods = methodRows.reduce((s, m) => s + m.amount, 0);

  const hasAlmacen = data.byLocation.almacen.count > 0;
  const saldoPendiente = data.adelantosPendientes.montoTotal - data.adelantosPendientes.montoRecibido;

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Resumen del día" subtitle={today} />

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── Row 1: KPIs ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {/* Ventas hoy */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Ventas hoy</div>
            <div className="text-[22px] font-bold font-mono tracking-tight text-ink">{formatPEN(data.totalVentas)}</div>
            <div className={`text-[11.5px] mt-1 ${data.deltaVentas > 0 ? "text-success" : data.deltaVentas < 0 ? "text-danger" : "text-ink-3"}`}>
              {data.deltaVentas !== 0
                ? `${data.deltaVentas > 0 ? "↗" : "↘"} ${Math.abs(data.deltaVentas).toFixed(1)}% vs. ayer`
                : "Sin datos de ayer"}
            </div>
          </div>

          {/* Transacciones */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Transacciones</div>
            <div className="text-[22px] font-bold font-mono tracking-tight text-ink">{data.countVentas}</div>
            <div className="text-[11.5px] mt-1 text-ink-3">Ticket prom. {formatPEN(data.ticketPromedio)}</div>
          </div>

          {/* Documentos */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Documentos</div>
            <div className="text-[22px] font-bold font-mono tracking-tight text-ink">
              {data.byType.boletas + data.byType.facturas + data.byType.notasVenta}
            </div>
            <div className="text-[11.5px] mt-1 text-ink-3 flex gap-2">
              {data.byType.boletas > 0    && <span className="text-accent">{data.byType.boletas}B</span>}
              {data.byType.facturas > 0   && <span className="text-warning">{data.byType.facturas}F</span>}
              {data.byType.notasVenta > 0 && <span className="text-ink-2">{data.byType.notasVenta}NV</span>}
              {data.byType.boletas === 0 && data.byType.facturas === 0 && data.byType.notasVenta === 0 && <span>Sin comprobantes</span>}
            </div>
          </div>

          {/* Adelantos pendientes */}
          <div className={`bg-surface border rounded-xl p-4 ${data.adelantosPendientes.count > 0 ? "border-warning/40" : "border-border"}`}>
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Adelantos pendientes</div>
            <div className={`text-[22px] font-bold font-mono tracking-tight ${data.adelantosPendientes.count > 0 ? "text-warning" : "text-ink"}`}>
              {data.adelantosPendientes.count > 0 ? `${data.adelantosPendientes.count} orden${data.adelantosPendientes.count > 1 ? "es" : ""}` : "Ninguno"}
            </div>
            {data.adelantosPendientes.count > 0 ? (
              <div className="text-[11.5px] mt-1 text-ink-3">
                Saldo por cobrar: {formatPEN(saldoPendiente)}
              </div>
            ) : (
              <div className="text-[11.5px] mt-1 text-ink-3">Todo cobrado</div>
            )}
          </div>
        </div>

        {/* ── Row 2: Charts ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Hourly chart */}
          <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
            <h3 className="text-[14px] font-semibold text-ink">Ventas por hora</h3>
            <p className="text-[12px] text-ink-3 mb-4">Hoy · monto por franja horaria</p>
            <div className="flex items-end gap-1 h-40">
              {data.hourly.map((h, i) => {
                const pct = (h.total / maxHourly) * 100;
                const isLast = i === data.hourly.length - 1;
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-stretch justify-end" title={`${h.hour}h — ${formatPEN(h.total)}`}>
                    <div
                      className={`rounded-t w-full min-h-0.5 transition-all ${isLast ? "bg-ink" : "bg-accent opacity-70 hover:opacity-100"}`}
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1.5">
              {data.hourly.map((h) => (
                <span key={h.hour} className="flex-1 text-center text-[9px] text-ink-4 font-mono">{h.hour}</span>
              ))}
            </div>
          </div>

          {/* Payment methods */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-[14px] font-semibold text-ink">Métodos de pago</h3>
            <p className="text-[12px] text-ink-3 mb-4">Distribución del turno</p>
            <div className="space-y-3">
              {methodRows.map((m) => {
                const pct = totalMethods > 0 ? (m.amount / totalMethods) * 100 : 0;
                return (
                  <div key={m.label}>
                    <div className="flex justify-between text-[12.5px] mb-1">
                      <span className="text-ink">{m.label}</span>
                      <span className="font-semibold font-mono text-ink">{formatPEN(m.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                      <div className={`h-full ${m.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Row 3: Ubicaciones ───────────────────────────────────────── */}
        <div className={`grid gap-4 ${hasAlmacen ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* Tienda */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Tienda física</h3>
                <p className="text-[12px] text-ink-3">{data.byLocation.tienda.count} venta{data.byLocation.tienda.count !== 1 ? "s" : ""} hoy</p>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-bold font-mono text-ink">{formatPEN(data.byLocation.tienda.total)}</div>
                <div className="text-[11px] text-ink-3">recaudado</div>
              </div>
            </div>
            {data.byLocation.tienda.count > 0 && (
              <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{
                    width: `${data.byLocation.tienda.total + data.byLocation.almacen.total > 0
                      ? (data.byLocation.tienda.total / (data.byLocation.tienda.total + data.byLocation.almacen.total)) * 100
                      : 0}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Almacén — solo si hay ventas */}
          {hasAlmacen && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Almacén</h3>
                  <p className="text-[12px] text-ink-3">{data.byLocation.almacen.count} venta{data.byLocation.almacen.count !== 1 ? "s" : ""} hoy</p>
                </div>
                <div className="text-right">
                  <div className="text-[20px] font-bold font-mono text-ink">{formatPEN(data.byLocation.almacen.total)}</div>
                  <div className="text-[11px] text-ink-3">recaudado</div>
                </div>
              </div>
              <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-warning rounded-full"
                  style={{
                    width: `${data.byLocation.tienda.total + data.byLocation.almacen.total > 0
                      ? (data.byLocation.almacen.total / (data.byLocation.tienda.total + data.byLocation.almacen.total)) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Row 4: Low stock ─────────────────────────────────────────── */}
        {data.lowStock.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-ink">Alertas de stock</h3>
              <p className="text-[12px] text-ink-3 mt-0.5">Productos que requieren reposición pronto</p>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-light">
                  <th className="text-left px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Producto</th>
                  <th className="text-left px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">SKU</th>
                  <th className="text-left px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Categoría</th>
                  <th className="text-right px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Tienda</th>
                  <th className="text-right px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Almacén</th>
                  <th className="text-right px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-light">
                    <td className="px-5 py-3 border-b border-border text-[13px] font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-3 border-b border-border text-[12px] font-mono text-ink-3">{p.sku ?? "—"}</td>
                    <td className="px-5 py-3 border-b border-border text-[12.5px] text-ink-3">{p.category}</td>
                    <td className="px-5 py-3 border-b border-border text-right">
                      <span className={`text-[13px] font-bold font-mono ${p.stockTienda <= 2 ? "text-danger" : "text-warning"}`}>{p.stockTienda}</span>
                    </td>
                    <td className="px-5 py-3 border-b border-border text-right">
                      <span className={`text-[13px] font-bold font-mono ${p.stockAlmacen <= 2 ? "text-danger" : "text-warning"}`}>{p.stockAlmacen}</span>
                    </td>
                    <td className="px-5 py-3 border-b border-border text-right">
                      <span className="text-[13px] font-bold font-mono text-ink">{p.stock}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
