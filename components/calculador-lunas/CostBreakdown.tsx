"use client";

import type { Desglose } from "@/lib/calculador-lunas/types";

function formatSol(v: number) {
  return `S/. ${v.toFixed(2)}`;
}

export default function CostBreakdown({ desglose }: { desglose: Desglose }) {
  const { total } = desglose;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">Costo de Fabricación</h2>
      <div className="flex justify-between items-center py-2 border-b border-border">
        <span className="text-[13px] text-ink-3">Lunas Policarbonato Blue Defense/Antireflex</span>
        <span className="text-xl font-semibold tracking-tight text-accent tabular-nums">{formatSol(total)}</span>
      </div>
      <div className="flex justify-between items-center py-2">
        <span className="text-[13px] text-ink-3">Lunas Nk 55 (Resina) Blue Defense/Antireflex</span>
        <span className="text-xl font-semibold tracking-tight text-accent tabular-nums">
          {formatSol(Math.max(0, total - 50))}
        </span>
      </div>
    </div>
  );
}
