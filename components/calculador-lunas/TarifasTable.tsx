"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Pencil, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { TarifaLunaRow } from "@/lib/calculador-lunas/types";

interface Props {
  tarifas: TarifaLunaRow[];
  onUpdated: (updated: TarifaLunaRow[]) => void;
}

const GROUPS = [
  { label: "Esfera 0 – 2",       ids: [1, 2, 3, 4, 5]    },
  { label: "Esfera 2.25 – 3.99", ids: [6, 7, 8, 9, 10]   },
  { label: "Esfera 4 – 4.99",    ids: [11, 12, 13, 14, 15] },
  { label: "Esfera 5 – 5.99",    ids: [16, 17, 18, 19, 20] },
  { label: "Esfera 6 – 6.99",    ids: [21, 22, 23, 24, 25] },
];

function cilLabel(r: TarifaLunaRow) {
  return `Cil ${r.cilMin.toFixed(2)} – ${r.cilMax.toFixed(2)}`;
}

export default function TarifasTable({ tarifas, onUpdated }: Props) {
  const { data: session } = useSession();
  const canEdit = session?.user.role === "ADMIN";

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<TarifaLunaRow[]>([]);
  const [saving, setSaving]   = useState(false);

  function startEdit() {
    setDraft(tarifas.map((r) => ({ ...r })));
    setEditing(true);
    setOpen(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft([]);
  }

  function updateDraft(id: number, field: "poli" | "foto", raw: string) {
    setDraft((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: parseFloat(raw) || 0 } : r))
    );
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await Promise.all(
        draft.map((row) =>
          fetch(`/api/calculador-lunas/tarifas/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ poli: row.poli, foto: row.foto }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
          })
        )
      );
      onUpdated(draft);
      setEditing(false);
      toast.success("Tarifas actualizadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const display = editing ? draft : tarifas;
  const getRow  = (id: number) => display.find((r) => r.id === id);

  const inputCls =
    "w-20 text-right bg-surface rounded px-2 py-0.5 text-[12px] text-ink border border-border focus:border-accent focus:outline-none";

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-5 py-4 bg-surface-light hover:bg-surface-dark transition-colors"
      >
        <div className="text-left">
          <h3 className="text-[14px] font-semibold tracking-tight text-ink">Tarifas por Graduación</h3>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Precios policarbonato y fotocromático{canEdit ? "" : " · Solo administradores"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); startEdit(); }}
              className="flex items-center gap-1.5 bg-surface text-ink-2 text-[11px] font-medium px-2.5 py-1.5 rounded-md hover:bg-accent-soft hover:text-accent transition-colors border border-border"
            >
              <Pencil size={12} /> Editar
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-ink-3" /> : <ChevronDown size={16} className="text-ink-3" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {editing && (
            <div className="flex gap-2 pt-3 pb-2">
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 text-[11px] font-medium text-ink-3 border border-border rounded-md px-2.5 py-1.5 hover:bg-surface-light transition-colors"
              >
                <X size={12} /> Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1 text-[11px] font-medium text-white bg-accent hover:bg-accent-dark rounded-md px-2.5 py-1.5 disabled:opacity-60 transition-colors"
              >
                <Check size={12} /> {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}

          <div className="mt-3 space-y-4">
            {GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-accent uppercase tracking-[0.08em] mb-1.5">
                  {group.label}
                </p>
                <div className="rounded-lg overflow-hidden border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-surface-light">
                        <th className="text-left px-3 py-1.5 text-[10px] font-medium text-ink-3 uppercase tracking-wide">Cilindro</th>
                        <th className="text-right px-3 py-1.5 text-[10px] font-medium text-ink-3 uppercase tracking-wide">Policarb.</th>
                        <th className="text-right px-3 py-1.5 text-[10px] font-medium text-ink-3 uppercase tracking-wide">Fotocrom.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {group.ids.map((id) => {
                        const row = getRow(id);
                        if (!row) return null;
                        return (
                          <tr key={id} className="hover:bg-surface-light/50 transition-colors">
                            <td className="px-3 py-2 text-ink-3 text-[12px]">{cilLabel(row)}</td>
                            {(["poli", "foto"] as const).map((field) => (
                              <td key={field} className="px-3 py-2 text-right">
                                {editing ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    defaultValue={row[field]}
                                    onChange={(e) => updateDraft(id, field, e.target.value)}
                                    className={inputCls}
                                  />
                                ) : (
                                  <span className="text-ink font-medium tabular-nums">
                                    S/. {row[field].toFixed(2)}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
