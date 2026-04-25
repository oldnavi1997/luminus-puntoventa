"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, ArrowDownCircle, XCircle, AlertTriangle, CheckCircle, DollarSign, History, ArrowUpCircle, Store, Warehouse, Banknote } from "lucide-react";
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
  location: string;
  createdAt: string;
  registradoPor: { name: string | null; email: string };
}

interface LocationData {
  efectivoVentas: number;
  fondoActual: number;
  ultimoRetiroAt: string | null;
  nextOverride?: number | null;
  countVentasEfectivo: number;
  retiros: RetiroItem[];
}

interface CajaAdminViewProps {
  sesiones: SesionItem[];
  sesionesCerradas: SesionItem[];
  tienda: LocationData;
  almacen: LocationData;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

function EfectivoPanel({
  label,
  icon: Icon,
  data,
  location,
  onRetiro,
  onAjusteFondo,
}: {
  label: string;
  icon: React.ElementType;
  data: LocationData;
  location: "TIENDA" | "ALMACEN";
  onRetiro: (monto: number) => Promise<void>;
  onAjusteFondo: (location: "TIENDA" | "ALMACEN", monto: number) => Promise<void>;
}) {
  const [retiro, setRetiro] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  const [nextOverride, setNextOverride] = useState(data.nextOverride ?? null);
  const [showFondo, setShowFondo] = useState(false);
  const [fondoInput, setFondoInput] = useState("");
  const [loadingFondo, setLoadingFondo] = useState(false);
  const [fondoOk, setFondoOk] = useState(false);
  const [fondoError, setFondoError] = useState("");

  async function handleAjusteFondo() {
    const monto = parseFloat(fondoInput);
    if (isNaN(monto) || monto < 0) return;
    setLoadingFondo(true);
    setFondoOk(false);
    setFondoError("");
    try {
      await onAjusteFondo(location, monto);
      setFondoOk(true);
      setFondoInput("");
    } catch (e) {
      setFondoError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingFondo(false);
    }
  }

  const efectivoDisponible = data.fondoActual + data.efectivoVentas;
  const fondoSiguiente = parseFloat(retiro) || 0;
  const montoARetirar = Math.max(0, efectivoDisponible - fondoSiguiente);

  async function handleRetiro() {
    if (retiro === "" || fondoSiguiente < 0) return;
    setLoading(true);
    setError("");
    setOk(false);
    try {
      await onRetiro(fondoSiguiente);
      setNextOverride(fondoSiguiente);
      setRetiro("");
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-accent" />
        <h3 className="text-[13px] font-semibold text-text uppercase tracking-wide">{label}</h3>
      </div>

      {/* KPI */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted font-medium">Efectivo disponible</div>
        <div className="text-[30px] font-bold font-mono text-text mt-1">{formatPEN(efectivoDisponible)}</div>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-[11.5px] text-text-muted">
            <span>Fondo</span>
            <span className="font-mono">{formatPEN(data.fondoActual)}</span>
          </div>
          <div className="flex justify-between text-[11.5px] text-text-muted">
            <span>{data.countVentasEfectivo} venta{data.countVentasEfectivo !== 1 ? "s" : ""} efectivo</span>
            <span className="font-mono">+ {formatPEN(data.efectivoVentas)}</span>
          </div>
          <div className="text-[10.5px] text-text-muted/70 pt-1 border-t border-border">
            {data.ultimoRetiroAt
              ? `Desde: ${formatTime(data.ultimoRetiroAt)}`
              : "Sin retiros registrados"}
          </div>
        </div>
      </div>

      {/* Registrar retiro */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="text-[11px] uppercase tracking-wide text-text-muted font-medium flex items-center gap-1.5">
          <ArrowDownCircle size={12} className="text-warning" /> Registrar retiro
        </div>

        {nextOverride !== null && !ok && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-[11.5px] text-warning">
            Retiro pendiente: próxima sesión abre con {formatPEN(nextOverride)}
          </div>
        )}
        {ok && (
          <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-2 text-[11.5px] text-success flex items-center gap-2">
            <CheckCircle size={12} /> Retiro registrado. Fondo: {formatPEN(nextOverride ?? 0)}
          </div>
        )}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-[11.5px] text-danger">
            {error}
          </div>
        )}

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="number"
              value={retiro}
              onChange={(e) => { setRetiro(e.target.value); setOk(false); }}
              min="0"
              step="0.10"
              placeholder="Fondo siguiente"
              className="w-full bg-primary border border-border rounded-lg pl-7 pr-3 py-2 text-[13px] font-bold text-text focus:outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={handleRetiro}
            disabled={loading || retiro === ""}
            className="bg-warning/10 hover:bg-warning/20 disabled:opacity-40 border border-warning/30 text-warning font-semibold rounded-lg px-3 py-2 text-[12px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            {loading
              ? <div className="w-3.5 h-3.5 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
              : <><ArrowDownCircle size={13} /> Retirar</>}
          </button>
        </div>

        {retiro !== "" && fondoSiguiente >= 0 && !ok && (
          <div className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[11.5px] space-y-0.5">
            <div className="flex justify-between text-text-muted">
              <span>Disponible</span>
              <span className="font-mono">{formatPEN(efectivoDisponible)}</span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>Fondo siguiente</span>
              <span className="font-mono">− {formatPEN(fondoSiguiente)}</span>
            </div>
            <div className="flex justify-between font-bold text-text border-t border-border pt-1">
              <span>A retirar</span>
              <span className="font-mono">{formatPEN(montoARetirar)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Retiros del día */}
      {data.retiros.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-text-muted font-medium">Retiros de hoy</div>
          {data.retiros.map((r) => (
            <div key={r.id} className="flex justify-between text-[11.5px] text-text-muted bg-surface-light rounded-lg px-3 py-2">
              <span>{formatTime(r.createdAt)}</span>
              <span className="font-mono font-semibold text-warning">− {formatPEN(r.montoRetirado)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ajuste de fondo */}
      <div className="border-t border-border pt-3 space-y-2">
        <button
          onClick={() => { setShowFondo(!showFondo); setFondoOk(false); setFondoError(""); }}
          className="text-[11px] uppercase tracking-wide text-text-muted font-medium flex items-center gap-1.5 hover:text-text transition-colors w-full"
        >
          <Banknote size={12} />
          Ajuste de fondo
          <span className="ml-auto text-[10px]">{showFondo ? "▲" : "▼"}</span>
        </button>

        {showFondo && (
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted">
              Declara el efectivo físico actual en caja. No genera retiro ni cierra sesiones.
            </p>
            {fondoOk && (
              <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-2 text-[11.5px] text-success flex items-center gap-2">
                <CheckCircle size={12} /> Fondo actualizado
              </div>
            )}
            {fondoError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-[11.5px] text-danger">
                {fondoError}
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="number"
                  value={fondoInput}
                  onChange={(e) => { setFondoInput(e.target.value); setFondoOk(false); }}
                  min="0"
                  step="0.10"
                  placeholder="Monto en caja"
                  className="w-full bg-primary border border-border rounded-lg pl-7 pr-3 py-2 text-[13px] font-bold text-text focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={handleAjusteFondo}
                disabled={loadingFondo || fondoInput === ""}
                className="bg-accent/10 hover:bg-accent/20 disabled:opacity-40 border border-accent/30 text-accent font-semibold rounded-lg px-3 py-2 text-[12px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                {loadingFondo
                  ? <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  : <><Banknote size={13} /> Guardar</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CajaAdminView({ sesiones: initial, sesionesCerradas: initialCerradas, tienda, almacen }: CajaAdminViewProps) {
  const router = useRouter();
  const [sesiones, setSesiones] = useState(initial);
  const [tab, setTab] = useState<"activas" | "historial">("activas");

  const todayLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [historialDate, setHistorialDate] = useState(todayLima);
  const [historialSesiones, setHistorialSesiones] = useState(initialCerradas);
  const [historialRetiros, setHistorialRetiros] = useState<RetiroItem[]>([
    ...tienda.retiros,
    ...almacen.retiros,
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const [historialLoading, setHistorialLoading] = useState(false);

  async function fetchHistorial(date: string) {
    setHistorialLoading(true);
    try {
      const [resSesiones, resRetiros] = await Promise.all([
        fetch(`/api/admin/sesiones?date=${date}`),
        fetch(`/api/admin/retiros?date=${date}`),
      ]);
      const jsonSesiones = await resSesiones.json();
      const jsonRetiros  = await resRetiros.json();
      if (resSesiones.ok) setHistorialSesiones(jsonSesiones.sesiones ?? []);
      if (resRetiros.ok)  setHistorialRetiros(jsonRetiros.retiros ?? []);
    } finally {
      setHistorialLoading(false);
    }
  }

  function handleHistorialDateChange(date: string) {
    setHistorialDate(date);
    fetchHistorial(date);
  }

  async function handleRetiro(location: "TIENDA" | "ALMACEN", montoQueQueda: number) {
    const res = await fetch("/api/caja/retiro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ montoQueQueda, location }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Error al registrar");
    if (location === "TIENDA") setSesiones([]);
    router.refresh();
  }

  async function handleAjusteFondo(location: "TIENDA" | "ALMACEN", monto: number) {
    const res = await fetch("/api/caja/fondo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, monto }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Error al ajustar fondo");
    router.refresh();
  }

  // Cerrar sesión state
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loadingCierre, setLoadingCierre] = useState<string | null>(null);
  const [cierreError, setCierreError] = useState("");

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

  const historialRetirosTienda  = historialRetiros.filter((r) => r.location === "TIENDA");
  const historialRetirosAlmacen = historialRetiros.filter((r) => r.location === "ALMACEN");

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Caja · Administración" subtitle="Vista global del efectivo por ubicación" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Paneles de efectivo por ubicación */}
        <div className="grid grid-cols-2 gap-4">
          <EfectivoPanel
            label="Tienda Física"
            icon={Store}
            data={tienda}
            location="TIENDA"
            onRetiro={(m) => handleRetiro("TIENDA", m)}
            onAjusteFondo={handleAjusteFondo}
          />
          <EfectivoPanel
            label="Almacén"
            icon={Warehouse}
            data={almacen}
            location="ALMACEN"
            onRetiro={(m) => handleRetiro("ALMACEN", m)}
            onAjusteFondo={handleAjusteFondo}
          />
        </div>

        {/* Tabs de sesiones */}
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

        {/* Historial */}
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
              <div className="text-center py-10 text-text-muted text-sm border border-border rounded-xl">Cargando...</div>
            ) : (
              <div className="space-y-4">
                {/* Retiros Tienda */}
                {historialRetirosTienda.length > 0 && (
                  <div className="border border-warning/30 rounded-xl overflow-hidden">
                    <div className="bg-warning/10 px-4 py-2.5 flex items-center gap-2 border-b border-warning/20">
                      <Store size={13} className="text-warning" />
                      <span className="text-[12px] font-semibold text-warning uppercase tracking-wide">Retiros · Tienda</span>
                    </div>
                    <RetiroTable retiros={historialRetirosTienda} />
                  </div>
                )}

                {/* Retiros Almacén */}
                {historialRetirosAlmacen.length > 0 && (
                  <div className="border border-warning/30 rounded-xl overflow-hidden">
                    <div className="bg-warning/10 px-4 py-2.5 flex items-center gap-2 border-b border-warning/20">
                      <Warehouse size={13} className="text-warning" />
                      <span className="text-[12px] font-semibold text-warning uppercase tracking-wide">Retiros · Almacén</span>
                    </div>
                    <RetiroTable retiros={historialRetirosAlmacen} />
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

function RetiroTable({ retiros }: { retiros: RetiroItem[] }) {
  return (
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
        {retiros.map((r) => (
          <tr key={r.id} className="bg-surface hover:bg-surface-light transition-colors">
            <td className="px-4 py-3">
              <div className="font-medium text-text">{r.registradoPor.name ?? r.registradoPor.email}</div>
              {r.registradoPor.name && <div className="text-xs text-text-muted">{r.registradoPor.email}</div>}
            </td>
            <td className="px-4 py-3 text-text-muted text-xs">{new Date(r.createdAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3 text-right font-mono font-bold text-warning">{formatPEN(r.montoRetirado)}</td>
            <td className="px-4 py-3 text-right font-mono text-text-muted">{formatPEN(r.fondoQueQueda)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
