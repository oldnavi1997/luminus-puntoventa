"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  desplazar,
  esPeriodoActual,
  etiquetaCorta,
  finMes,
  hoyLima,
  inicioMes,
  rangoDe,
  sumarDias,
  sumarMeses,
  type Periodo,
  type Rango,
} from "@/lib/periodo";

const SEGMENTOS: { key: Exclude<Periodo, "range">; label: string }[] = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

/** Atajos del popover. Cada uno devuelve el periodo y su rango ya resuelto. */
function atajos(): { label: string; periodo: Periodo; rango: Rango }[] {
  const hoy = hoyLima();
  const ayer = sumarDias(hoy, -1);
  const mesPasado = sumarMeses(inicioMes(hoy), -1);
  return [
    { label: "Hoy", periodo: "day", rango: { from: hoy, to: hoy } },
    { label: "Ayer", periodo: "day", rango: { from: ayer, to: ayer } },
    { label: "Últimos 7 días", periodo: "range", rango: { from: sumarDias(hoy, -6), to: hoy } },
    { label: "Últimos 30 días", periodo: "range", rango: { from: sumarDias(hoy, -29), to: hoy } },
    { label: "Este mes", periodo: "month", rango: rangoDe("month", hoy) },
    { label: "Mes anterior", periodo: "month", rango: { from: inicioMes(mesPasado), to: finMes(mesPasado) } },
  ];
}

interface Props {
  periodo: Periodo;
  rango: Rango;
  onChange: (periodo: Periodo, rango: Rango) => void;
}

export function PeriodFilter({ periodo, rango, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(rango.from);
  const [hasta, setHasta] = useState(rango.to);
  const caja = useRef<HTMLDivElement>(null);

  // El popover arranca siempre con el rango que está activo.
  useEffect(() => {
    if (abierto) {
      setDesde(rango.from);
      setHasta(rango.to);
    }
  }, [abierto, rango.from, rango.to]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const esRango = periodo === "range";
  const hoy = hoyLima();
  const sinSiguiente = esRango || esPeriodoActual(rango);
  const rangoInvalido = desde > hasta;

  const mover = (delta: number) => {
    if (esRango) return;
    if (delta > 0 && sinSiguiente) return;
    onChange(periodo, desplazar(periodo, rango, delta));
  };

  const aplicar = () => {
    if (rangoInvalido) return;
    onChange("range", { from: desde, to: hasta });
    setAbierto(false);
  };

  const navBtn = (deshabilitado: boolean) =>
    `w-[30px] h-[30px] flex items-center justify-center rounded-lg bg-surface-light border border-border transition-colors ${
      deshabilitado ? "text-border-strong cursor-default" : "text-ink-2 hover:bg-border"
    }`;

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-surface border-b border-border">
      {/* Navegación entre periodos */}
      <div className="flex gap-0.5">
        <button
          onClick={() => mover(-1)}
          disabled={esRango}
          className={navBtn(esRango)}
          title="Periodo anterior"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => mover(1)}
          disabled={sinSiguiente}
          className={navBtn(sinSiguiente)}
          title="Periodo siguiente"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Día / Semana / Mes */}
      <div className="flex bg-surface-light border border-border rounded-lg p-0.5 gap-0.5">
        {SEGMENTOS.map((s) => (
          <button
            key={s.key}
            onClick={() => onChange(s.key, rangoDe(s.key, s.key === periodo ? rango.from : hoy))}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              periodo === s.key ? "bg-surface shadow-sm text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Rango de fechas */}
      <div className="relative" ref={caja}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAbierto((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
              esRango
                ? "bg-accent-soft border border-accent text-accent"
                : "bg-surface-light border border-border text-ink-2 hover:bg-border"
            }`}
          >
            <Calendar size={14} />
            {esRango ? etiquetaCorta("range", rango) : "Rango de fechas"}
          </button>
          {esRango && (
            <button
              onClick={() => onChange("day", rangoDe("day", hoy))}
              className="w-[30px] h-[30px] flex items-center justify-center rounded-lg border border-border text-ink-3 hover:text-ink hover:bg-surface-light transition-colors"
              title="Quitar el rango"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {abierto && (
          <div className="absolute left-0 top-full mt-2 z-20 flex bg-surface border border-border rounded-xl shadow-lg overflow-hidden animate-scale-in">
            <div className="w-[178px] shrink-0 border-r border-border bg-surface-light p-2.5 flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-ink-4 font-medium px-2.5 pb-2 pt-0.5">
                Atajos
              </div>
              {atajos().map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    onChange(a.periodo, a.rango);
                    setAbierto(false);
                  }}
                  className="text-left px-2.5 py-1.5 rounded-md text-[12.5px] font-medium text-ink-2 hover:bg-surface transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="p-4 w-[320px]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-ink-4 font-medium pb-2.5">
                Rango personalizado
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={desde}
                  max={hoy}
                  onChange={(e) => setDesde(e.target.value)}
                  className="flex-1 min-w-0 bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                />
                <span className="text-[12.5px] text-ink-4">→</span>
                <input
                  type="date"
                  value={hasta}
                  max={hoy}
                  onChange={(e) => setHasta(e.target.value)}
                  className="flex-1 min-w-0 bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                />
              </div>
              {rangoInvalido && (
                <p className="text-[11.5px] text-danger mt-2">
                  La fecha inicial es posterior a la final.
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setAbierto(false)}
                  className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface-light border border-border text-ink-2 hover:bg-border transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={aplicar}
                  disabled={rangoInvalido}
                  className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Aplicar rango
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
