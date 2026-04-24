"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, ArrowDownCircle, XCircle, AlertTriangle, CheckCircle, DollarSign, History, ArrowUpCircle } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";

interface SesionItem {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  closingBalance?: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalYape: number;
  totalVentas: number;
  countVentas: number;
  user: { name: string | null; email: string };
}

interface RetiroItem {
  id: string;
  montoRetirado: number;
  fondoQueQueda: number;
  createdAt: string;
  registradoPor: { name: string | null; email: string };
}

interface CajaAdminViewProps {
  sesiones: SesionItem[];
  sesionesCerradas: SesionItem[];
  nextOverride: number | null;
  efectivoVentas: number;
  countVentasEfectivo: number;
  fondoActual: number;
  ultimoRetiroAt: string | null;
  retiros: RetiroItem[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

export function CajaAdminView({ sesiones: initial, sesionesCerradas: initialCerradas, nextOverride: initialOverride, efectivoVentas, countVentasEfectivo, fondoActual, ultimoRetiroAt, retiros: initialRetiros }: CajaAdminViewProps) {
  const router = useRouter();
  const [sesiones, setSesiones] = useState(initial);
  const [nextOverride, setNextOverride] = useState(initialOverride);
  const [tab, setTab] = useState<"activas" | "historial">("activas");

  const todayLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [historialDate, setHistorialDate] = useState(todayLima);
  const [historialSesiones, setHistorialSesiones] = useState(initialCerradas);
  const [historialRetiros, setHistorialRetiros] = useState(initialRetiros);
  const [historialLoading, setHistorialLoading] = useState(false);

  async function fetchHistorial(date: string) {
    setHistorialLoading(true);
    try {
      const [resSesiones, resRetiros] = await Promise.all([
        fetch(`/api/admin/sesiones?date=${date}`),
        fetch(`/api/admin/retiros?date=${date}`),
      ]);
      const jsonSesiones = await resSesiones.json();
      const jsonRetiros = await resRetiros.json();
      if (resSesiones.ok) setHistorialSesiones(jsonSesiones.sesiones ?? []);
      if (resRetiros.ok) setHistorialRetiros(jsonRetiros.retiros ?? []);
    } finally {
      setHistorialLoading(false);
    }
  }

  function handleHistorialDateChange(date: string) {
    setHistorialDate(date);
    fetchHistorial(date);
  }

  // Retiro state
  const [retiro, setRetiro] = useState("");
  const [loadingRetiro, setLoadingRetiro] = useState(false);
  const [retiroOk, setRetiroOk] = useState(false);
  const [retiroError, setRetiroError] = useState("");

  // Cerrar sesión state
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loadingCierre, setLoadingCierre] = useState<string | null>(null);
  const [cierreError, setCierreError] = useState("");

  const efectivoDisponible = fondoActual + efectivoVentas;
  const fondoSiguiente     = parseFloat(retiro) || 0;
  const montoARetirar      = Math.max(0, efectivoDisponible - fondoSiguiente);

  async function handleRetiro() {
    if (fondoSiguiente < 0) return;
    setLoadingRetiro(true);
    setRetiroError("");
    setRetiroOk(false);
    try {
      const res = await fetch("/api/caja/retiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montoQueQueda: fondoSiguiente }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al registrar");
      setNextOverride(fondoSiguiente);
      setRetiro("");
      setRetiroOk(true);
      setSesiones([]);
      router.refresh();
    } catch (e) {
      setRetiroError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRetiro(false);
    }
  }

  async function handleCerrar(id: string) {
    setLoadingCierre(id);
    setCierreError("");
    try {
      const res = await fetch(`/api/admin/sesiones/${id}/cerrar`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cerrar");
      router.refresh();
    } catch (e) {
      setCierreError(e instanceof Error ? e.message : "Error al cerrar");
    } finally {
      setLoadingCierre(null);
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Caja · Administración" subtitle="Vista global del efectivo en turno" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
            <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted font-medium">Efectivo en caja</div>
            <div className="mt-3 text-[32px] font-bold font-mono text-text">{formatPEN(efectivoDisponible)}</div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[11.5px] text-text-muted">
                <span>Fondo</span>
                <span className="font-mono">{formatPEN(fondoActual)}</span>
              </div>
              <div className="flex justify-between text-[11.5px] text-text-muted">
                <span>{countVentasEfectivo} venta{countVentasEfectivo !== 1 ? "s" : ""} en efectivo</span>
                <span className="font-mono">+ {formatPEN(efectivoVentas)}</span>
              </div>
              <div className="text-[10.5px] text-text-muted/70 pt-1 border-t border-border">
                {ultimoRetiroAt
                  ? `Desde último retiro: ${formatTime(ultimoRetiroAt)}`
                  : "Nunca se ha registrado un retiro"}
              </div>
            </div>
          </div>

          <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <ArrowDownCircle size={16} className="text-warning" />
              <h3 className="text-[14px] font-semibold text-text">Registrar retiro</h3>
            </div>

            {nextOverride !== null && !retiroOk && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-[12px] text-warning mb-3">
                Retiro pendiente registrado: el próximo cajero abrirá con {formatPEN(nextOverride)}
              </div>
            )}

            {retiroOk && (
              <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-2 text-[12px] text-success flex items-center gap-2 mb-3">
                <CheckCircle size={13} /> Retiro registrado. El próximo cajero abrirá con {formatPEN(nextOverride ?? 0)}.
              </div>
            )}

            {retiroError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-[12px] text-danger mb-3">
                {retiroError}
              </div>
            )}

            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-text-muted">Fondo para siguiente turno</label>
                <p className="text-[10.5px] text-text-muted/70">Monto que queda en caja para dar cambios</p>
                <div className="relative">
                  <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="number"
                    value={retiro}
                    onChange={(e) => { setRetiro(e.target.value); setRetiroOk(false); }}
                    min="0"
                    step="0.10"
                    placeholder="0.00"
                    className="w-full bg-primary border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <button
                onClick={handleRetiro}
                disabled={loadingRetiro || retiro === ""}
                className="bg-warning/10 hover:bg-warning/20 disabled:opacity-40 border border-warning/30 text-warning font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {loadingRetiro ? (
                  <div className="w-4 h-4 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
                ) : (
                  <><ArrowDownCircle size={14} /> Registrar retiro</>
                )}
              </button>
            </div>

            {retiro !== "" && fondoSiguiente >= 0 && !retiroOk && (
              <div className="mt-3 bg-surface-light border border-border rounded-lg px-3 py-2 text-[12px] space-y-0.5">
                <div className="flex justify-between text-text-muted">
                  <span>Efectivo disponible</span>
                  <span className="font-mono">{formatPEN(efectivoDisponible)}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Fondo siguiente turno</span>
                  <span className="font-mono">− {formatPEN(fondoSiguiente)}</span>
                </div>
                <div className="flex justify-between text-text font-bold border-t border-border pt-1">
                  <span>A retirar</span>
                  <span className="font-mono">{formatPEN(montoARetirar)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setTab("activas")}
            className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "activas"
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            <Wallet size={14} />
            Sesiones activas
            {sesiones.length > 0 && (
              <span className="bg-accent/10 text-accent text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {sesiones.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("historial")}
            className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "historial"
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            <History size={14} />
            Historial de hoy
            {historialSesiones.length > 0 && (
              <span className="bg-surface-light text-text-muted text-xs font-semibold px-1.5 py-0.5 rounded-full border border-border">
                {historialSesiones.length}
              </span>
            )}
          </button>
        </div>

        {/* Sesiones activas */}
        {tab === "activas" && (
          <div className="space-y-3">
            {cierreError && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
                {cierreError}
              </div>
            )}

            {sesiones.length === 0 ? (
              <div className="text-center py-10 text-text-muted text-sm border border-border rounded-xl">
                No hay sesiones activas en este momento
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-light text-text-muted text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Cajero</th>
                      <th className="text-left px-4 py-3">Desde</th>
                      <th className="text-right px-4 py-3">Efectivo</th>
                      <th className="text-right px-4 py-3">Tarjeta</th>
                      <th className="text-right px-4 py-3">Yape</th>
                      <th className="text-right px-4 py-3">Esperado</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sesiones.map((s) => {
                      const esperado = s.openingBalance + s.totalEfectivo;
                      return (
                        <tr key={s.id} className="bg-surface hover:bg-surface-light transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-text">{s.user.name ?? s.user.email}</div>
                            {s.user.name && <div className="text-xs text-text-muted">{s.user.email}</div>}
                          </td>
                          <td className="px-4 py-3 text-text-muted text-xs">{formatTime(s.openedAt)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalEfectivo)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalTarjeta)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalYape)}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-text">{formatPEN(esperado)}</td>
                          <td className="px-4 py-3 text-right">
                            {confirming === s.id ? (
                              <div className="flex items-center gap-2 justify-end">
                                <span className="text-xs text-warning flex items-center gap-1">
                                  <AlertTriangle size={11} /> ¿Confirmar?
                                </span>
                                <button
                                  onClick={() => handleCerrar(s.id)}
                                  disabled={loadingCierre === s.id}
                                  className="bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50"
                                >
                                  {loadingCierre === s.id ? "..." : "Sí"}
                                </button>
                                <button onClick={() => setConfirming(null)} className="text-text-muted text-xs px-1">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirming(s.id)}
                                className="flex items-center gap-1 text-danger/60 hover:text-danger border border-danger/20 hover:border-danger/40 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                              >
                                <XCircle size={12} /> Cerrar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Historial de sesiones cerradas */}
        {tab === "historial" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={historialDate}
                max={todayLima}
                onChange={(e) => handleHistorialDateChange(e.target.value)}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-accent"
              />
              {historialDate !== todayLima && (
                <button
                  onClick={() => handleHistorialDateChange(todayLima)}
                  className="text-[12px] text-text-muted hover:text-text px-3 py-2 bg-surface-light border border-border rounded-lg transition-colors"
                >
                  Hoy
                </button>
              )}
              <span className="text-[12.5px] text-text-muted ml-auto">
                {historialSesiones.length} sesión{historialSesiones.length !== 1 ? "es" : ""}
                {historialRetiros.length > 0 && ` · ${historialRetiros.length} retiro${historialRetiros.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {historialLoading ? (
              <div className="text-center py-10 text-text-muted text-sm border border-border rounded-xl">
                Cargando...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Retiros del día */}
                {historialRetiros.length > 0 && (
                  <div className="border border-warning/30 rounded-xl overflow-hidden">
                    <div className="bg-warning/10 px-4 py-2.5 flex items-center gap-2 border-b border-warning/20">
                      <ArrowUpCircle size={14} className="text-warning" />
                      <span className="text-[12px] font-semibold text-warning uppercase tracking-wide">Retiros registrados</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-surface-light text-text-muted text-xs uppercase">
                        <tr>
                          <th className="text-left px-4 py-2.5">Registrado por</th>
                          <th className="text-left px-4 py-2.5">Hora</th>
                          <th className="text-right px-4 py-2.5">Monto retirado</th>
                          <th className="text-right px-4 py-2.5">Fondo dejado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {historialRetiros.map((r) => (
                          <tr key={r.id} className="bg-surface hover:bg-surface-light transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-text">{r.registradoPor.name ?? r.registradoPor.email}</div>
                              {r.registradoPor.name && <div className="text-xs text-text-muted">{r.registradoPor.email}</div>}
                            </td>
                            <td className="px-4 py-3 text-text-muted text-xs">{formatTime(r.createdAt)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-warning">{formatPEN(r.montoRetirado)}</td>
                            <td className="px-4 py-3 text-right font-mono text-text-muted">{formatPEN(r.fondoQueQueda)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sesiones cerradas */}
                {historialSesiones.length === 0 ? (
                  <div className="text-center py-10 text-text-muted text-sm border border-border rounded-xl">
                    No hay sesiones cerradas para esta fecha
                  </div>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-light text-text-muted text-xs uppercase">
                        <tr>
                          <th className="text-left px-4 py-3">Cajero</th>
                          <th className="text-left px-4 py-3">Apertura</th>
                          <th className="text-left px-4 py-3">Cierre</th>
                          <th className="text-right px-4 py-3">Efectivo</th>
                          <th className="text-right px-4 py-3">Tarjeta</th>
                          <th className="text-right px-4 py-3">Yape</th>
                          <th className="text-right px-4 py-3">Total ventas</th>
                          <th className="text-right px-4 py-3">Esperado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {historialSesiones.map((s) => {
                          const esperado = s.openingBalance + s.totalEfectivo;
                          return (
                            <tr key={s.id} className="bg-surface hover:bg-surface-light transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium text-text">{s.user.name ?? s.user.email}</div>
                                {s.user.name && <div className="text-xs text-text-muted">{s.user.email}</div>}
                              </td>
                              <td className="px-4 py-3 text-text-muted text-xs">{formatTime(s.openedAt)}</td>
                              <td className="px-4 py-3 text-text-muted text-xs">{s.closedAt ? formatTime(s.closedAt) : "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalEfectivo)}</td>
                              <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalTarjeta)}</td>
                              <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalYape)}</td>
                              <td className="px-4 py-3 text-right font-mono text-text">{formatPEN(s.totalVentas)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-text">{formatPEN(esperado)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
