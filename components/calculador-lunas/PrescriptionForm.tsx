"use client";

import { useMemo } from "react";

interface Props {
  odSphere: string;
  odCylinder: string;
  oiSphere: string;
  oiCylinder: string;
  onChange: (field: "odSphere" | "odCylinder" | "oiSphere" | "oiCylinder", value: string) => void;
}

function buildOptions(): string[] {
  const opts: string[] = [""];
  for (let v = 0; v <= 6; v += 0.25) {
    opts.push(v.toFixed(2));
  }
  return opts;
}

function EyeInputs({
  label,
  sphere,
  cylinder,
  onSphere,
  onCylinder,
}: {
  label: string;
  sphere: string;
  cylinder: string;
  onSphere: (v: string) => void;
  onCylinder: (v: string) => void;
}) {
  const opts = useMemo(buildOptions, []);

  const selectClass =
    "w-full bg-surface border border-border rounded-md px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors";

  return (
    <div>
      <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-[0.08em] mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-ink-4 mb-1 uppercase tracking-wide">Esfera</label>
          <select value={sphere} onChange={(e) => onSphere(e.target.value)} className={selectClass}>
            {opts.map((o) => (
              <option key={o} value={o}>{o === "" ? "—" : o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-ink-4 mb-1 uppercase tracking-wide">Cilindro</label>
          <select value={cylinder} onChange={(e) => onCylinder(e.target.value)} className={selectClass}>
            {opts.map((o) => (
              <option key={o} value={o}>{o === "" ? "—" : o}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function PrescriptionForm({ odSphere, odCylinder, oiSphere, oiCylinder, onChange }: Props) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">Graduación</h2>
      <EyeInputs
        label="OD — Ojo Derecho"
        sphere={odSphere}
        cylinder={odCylinder}
        onSphere={(v) => onChange("odSphere", v)}
        onCylinder={(v) => onChange("odCylinder", v)}
      />
      <div className="border-t border-border" />
      <EyeInputs
        label="OI — Ojo Izquierdo"
        sphere={oiSphere}
        cylinder={oiCylinder}
        onSphere={(v) => onChange("oiSphere", v)}
        onCylinder={(v) => onChange("oiCylinder", v)}
      />
    </div>
  );
}
