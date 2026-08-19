"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { TrendChart, type TrendBucket } from "@/components/dashboard/TrendChart";
import {
  CategoriasCard,
  TopProductos,
  type CategoriaVendida,
  type ProductoVendido,
} from "@/components/dashboard/TopProductos";
import { formatPEN } from "@/lib/utils";
import {
  etiquetaPeriodo,
  hoyLima,
  rangoDe,
  type Granularidad,
  type Periodo,
  type Rango,
} from "@/lib/periodo";

interface DashboardData {
  periodo: { period: Periodo; from: string; to: string; label: string; granularity: Granularidad };
  anterior: { from: string; to: string; label: string };
  totalVentas: number;
  countVentas: number;
  ticketPromedio: number;
  previo: { totalVentas: number; countVentas: number; ticketPromedio: number };
  delta: { ventas: number; transacciones: number; ticket: number };
  byType: { boletas: number; facturas: number; notasVenta: number };
  byMethod: { efectivo: number; tarjeta: number; yape: number; mixto: number; mixtoOperaciones: number };
  byLocation: {
    tienda: { total: number; count: number };
    almacen: { total: number; count: number };
    web: { total: number; count: number };
  };
  adelantosPendientes: { count: number; montoRecibido: number; montoTotal: number };
  trend: { granularity: Granularidad; buckets: TrendBucket[]; promedio: number };
  topProductos: ProductoVendido[];
  byCategory: CategoriaVendida[];
  lowStock: {
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    stockTienda: number;
    stockAlmacen: number;
    category: string;
  }[];
}

const SUFIJO: Record<Periodo, string> = {
  day: "vs. día anterior",
  week: "vs. semana anterior",
  month: "vs. mes anterior",
  range: "vs. rango anterior",
};

export function DashboardView() {
  const [periodo, setPeriodo] = useState<Periodo>("day");
  const [rango, setRango] = useState<Rango>(() => rangoDe("day", hoyLima()));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cambiar de periodo rápido dispara varias peticiones: la que llega tarde
    // no debe pisar a la última pedida.
    const ctrl = new AbortController();
    const params = new URLSearchParams({ period: periodo, from: rango.from, to: rango.to });

    setLoading(true);
    fetch(`/api/dashboard?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "No se pudo cargar el resumen");
        return body as DashboardData;
      })
      .then((d) => {
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "No se pudo cargar el resumen");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [periodo, rango.from, rango.to]);

  const cambiarPeriodo = useCallback((p: Periodo, r: Rango) => {
    setPeriodo(p);
    setRango(r);
  }, []);

  // La etiqueta se calcula en local para que la cabecera no parpadee al cargar.
  const etiqueta = etiquetaPeriodo(periodo, rango);

  const cabecera = (
    <>
      <ModuleHeader title="Dashboard" subtitle={etiqueta} />
      <PeriodFilter periodo={periodo} rango={rango} onChange={cambiarPeriodo} />
    </>
  );

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        {cabecera}
        <div className="flex-1 flex items-center justify-center text-ink-3 text-[13px]">
          {error ?? "Cargando resumen…"}
        </div>
      </div>
    );
  }

  const sufijo = SUFIJO[periodo];
  const saldoPendiente = data.adelantosPendientes.montoTotal - data.adelantosPendientes.montoRecibido;
  const totalDocs = data.byType.boletas + data.byType.facturas + data.byType.notasVenta;

  const metodos = [
    { label: "Efectivo", amount: data.byMethod.efectivo, color: "bg-success" },
    { label: "Tarjeta", amount: data.byMethod.tarjeta, color: "bg-accent" },
    { label: "Yape", amount: data.byMethod.yape, color: "bg-[#7c3aed]" },
    ...(data.byMethod.mixto > 0
      ? [{ label: "Mixto sin detalle", amount: data.byMethod.mixto, color: "bg-warning" }]
      : []),
  ];
  const totalMetodos = metodos.reduce((s, m) => s + m.amount, 0);

  // Tienda siempre visible; almacén y web sólo si tuvieron movimiento.
  const ubicaciones = [
    { label: "Tienda física", color: "bg-accent", ...data.byLocation.tienda },
    ...(data.byLocation.web.count > 0
      ? [{ label: "Ventas web", color: "bg-success", ...data.byLocation.web }]
      : []),
    ...(data.byLocation.almacen.count > 0
      ? [{ label: "Almacén", color: "bg-warning", ...data.byLocation.almacen }]
      : []),
  ];
  const totalUbicaciones = ubicaciones.reduce((s, u) => s + u.total, 0);

  return (
    <div className="flex flex-col h-full">
      {cabecera}

      <div
        className={`flex-1 overflow-auto p-6 space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}
      >
        {error && (
          <div className="bg-danger-soft border border-danger/30 text-danger rounded-xl px-4 py-3 text-[13px]">
            {error}
          </div>
        )}

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            label="Ventas del periodo"
            value={formatPEN(data.totalVentas)}
            delta={data.previo.totalVentas > 0 ? data.delta.ventas : null}
            deltaSuffix={sufijo}
          />
          <KpiCard
            label="Transacciones"
            value={String(data.countVentas)}
            sub={`Ticket promedio ${formatPEN(data.ticketPromedio)}`}
          />
          <KpiCard
            label="Documentos"
            value={String(totalDocs)}
            sub={
              totalDocs === 0 ? (
                "Sin comprobantes"
              ) : (
                <span className="flex gap-2">
                  {data.byType.boletas > 0 && <span className="text-accent">{data.byType.boletas}B</span>}
                  {data.byType.facturas > 0 && <span className="text-warning">{data.byType.facturas}F</span>}
                  {data.byType.notasVenta > 0 && <span className="text-ink-2">{data.byType.notasVenta}NV</span>}
                </span>
              )
            }
          />
          <KpiCard
            label="Adelantos pendientes"
            value={
              data.adelantosPendientes.count > 0
                ? `${data.adelantosPendientes.count} orden${data.adelantosPendientes.count > 1 ? "es" : ""}`
                : "Ninguno"
            }
            alerta={data.adelantosPendientes.count > 0}
            sub={
              data.adelantosPendientes.count > 0
                ? `Saldo por cobrar: ${formatPEN(saldoPendiente)}`
                : "Todo cobrado"
            }
          />
        </div>

        {/* ── Tendencia + métodos de pago ──────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <TrendChart
            granularity={data.trend.granularity}
            buckets={data.trend.buckets}
            promedio={data.trend.promedio}
            periodoLabel={etiqueta}
          />

          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-[14px] font-semibold text-ink">Métodos de pago</h3>
            <p className="text-[12px] text-ink-3 mb-4">Monto cobrado por medio</p>
            <div className="space-y-3">
              {metodos.map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span className="text-ink">{m.label}</span>
                    <span className="font-semibold font-mono text-ink">{formatPEN(m.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                    <div
                      className={`h-full ${m.color} rounded-full transition-all`}
                      style={{ width: totalMetodos > 0 ? `${(m.amount / totalMetodos) * 100}%` : 0 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {data.byMethod.mixtoOperaciones > 0 && (
              <p className="text-[11px] text-ink-4 mt-4 leading-relaxed">
                {data.byMethod.mixtoOperaciones} operación
                {data.byMethod.mixtoOperaciones > 1 ? "es" : ""} mixta
                {data.byMethod.mixtoOperaciones > 1 ? "s" : ""} repartida
                {data.byMethod.mixtoOperaciones > 1 ? "s" : ""} entre los medios de arriba, según el
                monto cobrado en cada uno.
              </p>
            )}
          </div>
        </div>

        {/* ── Comparativa contra el periodo anterior ───────────────────── */}
        <div className="bg-surface border border-border rounded-xl px-5 py-3.5 flex items-center gap-7 flex-wrap">
          <div className="text-[12.5px] text-ink-3">
            Frente a <strong className="text-ink font-semibold">{data.anterior.label}</strong>
          </div>
          <div className="w-px h-6 bg-border" />
          {[
            { label: "Ventas", previo: formatPEN(data.previo.totalVentas), delta: data.delta.ventas, base: data.previo.totalVentas },
            { label: "Transacciones", previo: String(data.previo.countVentas), delta: data.delta.transacciones, base: data.previo.countVentas },
            { label: "Ticket promedio", previo: formatPEN(data.previo.ticketPromedio), delta: data.delta.ticket, base: data.previo.ticketPromedio },
          ].map((c) => (
            <div key={c.label} className="flex items-baseline gap-2">
              <span className="text-[11.5px] text-ink-3">{c.label}</span>
              <span className="text-[13.5px] font-semibold font-mono text-ink">{c.previo}</span>
              <span
                className={`text-[12px] font-semibold ${
                  c.base <= 0 || Math.abs(c.delta) < 0.05
                    ? "text-ink-4"
                    : c.delta > 0
                      ? "text-success"
                      : "text-danger"
                }`}
              >
                {c.base <= 0
                  ? "—"
                  : `${c.delta > 0 ? "↗" : c.delta < 0 ? "↘" : ""} ${Math.abs(c.delta).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>

        {/* ── Ubicaciones ──────────────────────────────────────────────── */}
        <div
          className={`grid gap-4 ${
            ubicaciones.length === 1 ? "grid-cols-1" : ubicaciones.length === 2 ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          {ubicaciones.map((u) => (
            <div key={u.label} className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">{u.label}</h3>
                  <p className="text-[12px] text-ink-3">
                    {u.count} venta{u.count !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[20px] font-bold font-mono text-ink">{formatPEN(u.total)}</div>
                  <div className="text-[11px] text-ink-3">recaudado</div>
                </div>
              </div>
              {u.count > 0 && (
                <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                  <div
                    className={`h-full ${u.color} rounded-full`}
                    style={{ width: totalUbicaciones > 0 ? `${(u.total / totalUbicaciones) * 100}%` : 0 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Productos y categorías ───────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <TopProductos productos={data.topProductos} periodoLabel={etiqueta} />
          <CategoriasCard categorias={data.byCategory} />
        </div>

        {/* ── Alertas de stock ─────────────────────────────────────────── */}
        {data.lowStock.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-ink">Alertas de stock</h3>
              <p className="text-[12px] text-ink-3 mt-0.5">
                Estado actual del inventario — no depende del periodo elegido
              </p>
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
