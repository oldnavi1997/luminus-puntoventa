"use client";

import { BarChart2 } from "lucide-react";
import { formatPEN } from "@/lib/utils";
import { diaLima, hoyLima, horaLima, type Granularidad } from "@/lib/periodo";

export interface TrendBucket {
  key: string;
  label: string;
  total: number;
  /** Mismo tramo del periodo anterior, para la silueta de fondo. */
  previo: number;
}

interface Props {
  granularity: Granularidad;
  buckets: TrendBucket[];
  promedio: number;
  /** Texto del periodo, para el estado vacío. */
  periodoLabel: string;
}

export function TrendChart({ granularity, buckets, promedio, periodoLabel }: Props) {
  const porHora = granularity === "hour";
  const hayPrevio = buckets.some((b) => b.previo > 0);
  // La escala incluye la silueta: si no, el periodo anterior se sale del marco.
  const max = Math.max(...buckets.map((b) => Math.max(b.total, b.previo)), 1);
  const vacio = buckets.every((b) => b.total <= 0);

  // La franja en curso va en negro: da referencia de "hasta dónde vamos".
  const ahora = porHora ? String(horaLima(new Date())) : diaLima(new Date());
  const hoy = hoyLima();
  const marcaActual = porHora
    ? buckets.some((b) => b.key === ahora) && buckets.length > 0
      ? ahora
      : null
    : buckets.some((b) => b.key === hoy)
      ? hoy
      : null;

  // Con muchas barras las etiquetas se pisan: se dejan una de cada cinco.
  const saltoEtiqueta = buckets.length > 16 ? 5 : 1;

  return (
    <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start gap-4 mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">
            {porHora ? "Ventas por hora" : "Ventas por día"}
          </h3>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {porHora ? "Franja horaria de 08:00 a 21:00" : "Monto cobrado en cada día del periodo"}
          </p>
        </div>
        {!vacio && (
          <div className="ml-auto flex items-center gap-4">
            {hayPrevio && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <span className="w-2 h-2 rounded-sm bg-accent" />
                Actual
                <span className="w-2 h-2 rounded-sm bg-border-strong ml-1.5" />
                Anterior
              </span>
            )}
            <span className="text-[11.5px] text-ink-3">
              {porHora ? "Promedio por hora" : "Promedio diario"}{" "}
              <strong className="text-ink font-mono font-semibold">{formatPEN(promedio)}</strong>
            </span>
          </div>
        )}
      </div>

      {vacio ? (
        <div className="h-44 flex flex-col items-center justify-center gap-1.5">
          <BarChart2 size={30} className="text-ink-4 opacity-50" />
          <span className="text-[13px] text-ink-3">No hubo ventas en {periodoLabel.toLowerCase()}</span>
          <span className="text-[12px] text-ink-4">Prueba con otro periodo o revisa el Historial</span>
        </div>
      ) : (
        <>
          <div className={`flex items-stretch h-44 ${buckets.length > 20 ? "gap-0.5" : "gap-1"}`}>
            {buckets.map((b) => {
              const pct = (b.total / max) * 100;
              const actual = b.key === marcaActual;
              return (
                <div
                  key={b.key}
                  className="relative flex-1 flex flex-col justify-end"
                  title={`${b.label}${porHora ? "h" : ""} — ${formatPEN(b.total)}${
                    hayPrevio ? ` · anterior ${formatPEN(b.previo)}` : ""
                  }`}
                >
                  {b.previo > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t bg-border-strong"
                      style={{ height: `${Math.max(2, (b.previo / max) * 100)}%` }}
                    />
                  )}
                  <div
                    className={`relative rounded-t w-full transition-all ${
                      actual ? "bg-ink" : "bg-accent opacity-80 hover:opacity-100"
                    }`}
                    style={{ height: b.total > 0 ? `${Math.max(2, pct)}%` : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <div className={`flex mt-1.5 ${buckets.length > 20 ? "gap-0.5" : "gap-1"}`}>
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className="flex-1 text-center text-[9px] text-ink-4 font-mono"
              >
                {i === 0 || (i + 1) % saltoEtiqueta === 0 ? b.label : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
