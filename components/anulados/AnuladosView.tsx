"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";
import { hoyLima } from "@/lib/periodo";

interface Anulada {
  id: string;
  fullNumber: string;
  type: "BOLETA" | "FACTURA";
  total: number;
  buyerName: string | null;
  buyerDocNumber: string | null;
  emitidoEn: string;
  anuladoEn: string | null;
  motivo: string | null;
  codigoSunat: string | null;
  cajero: string | null;
  notaDeOrigen: string | null;
  documentoBaja: string | null;
  ticket: string | null;
}

const horaLima = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AnuladosView() {
  const [docs, setDocs] = useState<Anulada[]>([]);
  const [totales, setTotales] = useState({ cantidad: 0, importe: 0 });
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(hoyLima());
  const [hasta, setHasta] = useState(hoyLima());

  // Mismo patrón de carga que el resto de pantallas del POS. `react-hooks/
  // set-state-in-effect` lo marca aquí y en otras quince: la regla es de React
  // 19 y arreglarla de verdad es cambiar cómo hace fetching la app entera, no
  // esta pantalla sola. Va en esa pasada, no en ésta.
  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/ventas/anuladas?desde=${desde}&hasta=${hasta}`);
    const json = await res.json();
    setDocs(json.docs ?? []);
    setTotales(json.totales ?? { cantidad: 0, importe: 0 });
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Anulados" subtitle="Ventas dadas de baja ante SUNAT" />

      <div className="flex-1 overflow-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] uppercase tracking-wide text-ink-3">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-surface-light border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] uppercase tracking-wide text-ink-3">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-surface-light border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="ml-auto flex gap-4">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">Anuladas</p>
              <p className="text-[18px] font-semibold text-ink">{totales.cantidad}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-ink-3">Importe</p>
              <p className="text-[18px] font-semibold text-ink font-mono">
                {formatPEN(totales.importe)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-ink-3">Cargando…</div>
          ) : docs.length === 0 ? (
            <div className="p-12 text-center">
              <Ban size={32} className="mx-auto text-ink-4 mb-3 opacity-50" />
              <p className="text-[13px] text-ink-3">Ninguna venta anulada en este período</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 text-left font-medium">Comprobante</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-medium">Motivo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Importe</th>
                  <th className="px-4 py-2.5 text-right font-medium">Anulado</th>
                  <th className="px-4 py-2.5 text-right font-medium">SUNAT</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-light/50 transition-colors">
                    <td className="px-4 py-3 border-b border-border">
                      <p className="text-[13px] font-mono text-ink">{d.fullNumber}</p>
                      {/* La nota arrastrada es la otra mitad de la misma venta. */}
                      {d.notaDeOrigen && (
                        <p className="text-[11px] text-ink-4 font-mono">
                          salió de {d.notaDeOrigen}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <p className="text-[13px] text-ink">{d.buyerName ?? "—"}</p>
                      <p className="text-[11px] text-ink-4 font-mono">{d.buyerDocNumber ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 border-b border-border">
                      <p className="text-[12.5px] text-ink-3">{d.motivo ?? "—"}</p>
                      {d.cajero && <p className="text-[11px] text-ink-4">por {d.cajero}</p>}
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <span className="text-[13px] font-semibold font-mono text-ink">
                        {formatPEN(d.total)}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <p className="text-[12px] text-ink-3 font-mono">
                        {d.anuladoEn ? horaLima(d.anuladoEn) : "—"}
                      </p>
                      <p className="text-[11px] text-ink-4 font-mono">
                        emitido {horaLima(d.emitidoEn)}
                      </p>
                    </td>
                    <td className="px-4 py-3 border-b border-border text-right">
                      <p className="text-[12px] text-ink-3 font-mono">{d.documentoBaja ?? "—"}</p>
                      {d.ticket && (
                        <p className="text-[11px] text-ink-4 font-mono">ticket {d.ticket}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
