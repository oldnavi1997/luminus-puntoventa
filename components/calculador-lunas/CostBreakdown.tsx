"use client";

import type { Desglose } from "@/lib/calculador-lunas/types";

function formatSol(v: number) {
  return `S/. ${v.toFixed(2)}`;
}

export default function CostBreakdown({ desglose }: { desglose: Desglose }) {
  const { totalNk, totalPoli, totalFoto, hasValues } = desglose;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">Costo de Fabricación</h2>
      <div className="flex justify-between items-center py-2 border-b border-border">
        <span className="text-[13px] text-ink-3">Lunas Nk Blue Defense / Antireflex</span>
        <span className="text-xl font-semibold tracking-tight text-accent tabular-nums">
          {hasValues ? formatSol(totalNk) : "—"}
        </span>
      </div>
      <div className="flex justify-between items-center py-2 border-b border-border">
        <span className="text-[13px] text-ink-3">Policarbonato Blue Defense / Antireflex</span>
        <span className="text-xl font-semibold tracking-tight text-accent tabular-nums">
          {hasValues ? formatSol(totalPoli) : "—"}
        </span>
      </div>
      <div className="flex justify-between items-center py-2">
        <span className="text-[13px] text-ink-3">Fotocromático Blue Defense / Antireflex</span>
        <span className="text-xl font-semibold tracking-tight text-accent tabular-nums">
          {hasValues ? formatSol(totalFoto) : "—"}
        </span>
      </div>
    </div>
  );
}
