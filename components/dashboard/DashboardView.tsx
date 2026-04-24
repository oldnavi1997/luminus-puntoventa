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
  byType: { boletas: number; facturas: number };
  byMethod: { efectivo: number; tarjeta: number; yape: number };
  hourly: { hour: string; total: number }[];
  lowStock: { id: string; name: string; sku: string | null; stock: number; category: string }[];
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
  const totalMethods = data.byMethod.efectivo + data.byMethod.tarjeta + data.byMethod.yape;

  const methodRows = [
    { label: "Efectivo",  amount: data.byMethod.efectivo, color: "bg-success" },
    { label: "Tarjeta",   amount: data.byMethod.tarjeta,  color: "bg-accent"  },
    { label: "Yape",      amount: data.byMethod.yape,     color: "bg-[#7c3aed]" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Resumen del día" subtitle={today} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Ventas hoy",
              value: formatPEN(data.totalVentas),
              sub:   data.deltaVentas !== 0
                ? `${data.deltaVentas > 0 ? "↗" : "↘"} ${Math.abs(data.deltaVentas).toFixed(1)}% vs. ayer`
                : "Sin datos de ayer",
              subColor: data.deltaVentas > 0 ? "text-success" : "text-danger",
            },
            {
              label: "Transacciones",
              value: String(data.countVentas),
              sub:   `Ticket prom. ${formatPEN(data.ticketPromedio)}`,
              subColor: "",
            },
            {
              label: "Boletas / Facturas",
              value: `${data.byType.boletas} / ${data.byType.facturas}`,
              sub:   "Comprobantes emitidos",
              subColor: "",
            },
            {
              label: "Margen estimado",
              value: formatPEN(data.margenEstimado),
              sub:   "~28% promedio",
              subColor: "text-success",
            },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
              <div className="text-[22px] font-bold font-mono tracking-tight text-ink">{s.value}</div>
              <div className={`text-[11.5px] mt-1 ${s.subColor || "text-ink-3"}`}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
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

          {/* Methods */}
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

        {/* Low stock */}
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
                  <th className="text-right px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Stock</th>
                  <th className="px-5 py-2.5 border-b border-border"></th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-light">
                    <td className="px-5 py-3 border-b border-border text-[13px] font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-3 border-b border-border text-[12px] font-mono text-ink-3">{p.sku ?? "—"}</td>
                    <td className="px-5 py-3 border-b border-border text-[12.5px] text-ink-3">{p.category}</td>
                    <td className="px-5 py-3 border-b border-border text-right">
                      <span className="text-[13px] font-bold font-mono text-warning">{p.stock}</span>
                    </td>
                    <td className="px-5 py-3 border-b border-border text-right">
                      <button className="text-[12px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border px-3 py-1 rounded-lg transition-colors border border-border">
                        Reponer
                      </button>
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
