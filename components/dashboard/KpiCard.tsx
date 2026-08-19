import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  /** Variación porcentual contra el periodo anterior. `null` = sin base para comparar. */
  delta?: number | null;
  /** Cola de la variación, p. ej. "vs. semana anterior". */
  deltaSuffix?: string;
  /** Pie alternativo cuando la tarjeta no compara nada. */
  sub?: ReactNode;
  /** Resalta el borde y la cifra (adelantos pendientes). */
  alerta?: boolean;
}

export function KpiCard({ label, value, delta, deltaSuffix, sub, alerta }: Props) {
  // Debajo de 0.05% la flecha miente más de lo que informa.
  const plano = delta == null || Math.abs(delta) < 0.05;
  const color = plano ? "text-ink-3" : delta! > 0 ? "text-success" : "text-danger";

  return (
    <div
      className={`bg-surface border rounded-xl p-4 ${alerta ? "border-warning/40" : "border-border"}`}
    >
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">
        {label}
      </div>
      <div
        className={`text-[22px] font-bold font-mono tracking-tight ${alerta ? "text-warning" : "text-ink"}`}
      >
        {value}
      </div>
      {delta !== undefined ? (
        <div className={`text-[11.5px] mt-1 ${color}`}>
          {plano
            ? delta == null
              ? "Sin datos del periodo anterior"
              : `Igual que ${deltaSuffix ?? "el periodo anterior"}`
            : `${delta! > 0 ? "↗" : "↘"} ${Math.abs(delta!).toFixed(1)}% ${deltaSuffix ?? ""}`.trim()}
        </div>
      ) : (
        <div className="text-[11.5px] mt-1 text-ink-3">{sub}</div>
      )}
    </div>
  );
}
