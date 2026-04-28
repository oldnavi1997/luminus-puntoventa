"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Pencil, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { FabricationCostRow } from "@/lib/calculador-lunas/types";

interface Props {
  costos: FabricationCostRow[];
  onUpdated: (updated: FabricationCostRow[]) => void;
}

const GROUPS = [
  {
    label: "Esfera ≤ 2",
    rows: [
      { id: 1, cil: "Cil ≤ 1" },
      { id: 2, cil: "Cil 2 – 3" },
      { id: 3, cil: "Cil 4" },
      { id: 4, cil: "Cil 5" },
      { id: 5, cil: "Cil 6" },
    ],
  },
  {
    label: "Esfera 3",
    rows: [
      { id: 6, cil: "Cil ≤ 3" },
      { id: 7, cil: "Cil 4" },
      { id: 8, cil: "Cil ≥ 5" },
    ],
  },
  {
    label: "Esfera ≥ 4",
    rows: [
      { id: 9,  cil: "Esf 4 · Cil 4" },
      { id: 10, cil: "Resto" },
    ],
  },
];

const EDIT_ROLES = new Set(["ADMIN"]);

export default function FabricationCostTable({ costos, onUpdated }: Props) {
  const { data: session } = useSession();
  const canEdit = !!session && EDIT_ROLES.has(session.user.role);

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<FabricationCostRow[]>([]);
  const [saving, setSaving]   = useState(false);

  function startEdit() {
    setDraft(costos.map((r) => ({ ...r })));
    setEditing(true);
    setOpen(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft([]);
  }

  function updateDraft(id: number, field: "costOd" | "costOi", raw: string) {
    setDraft((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: parseFloat(raw) || 0 } : r))
    );
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await Promise.all(
        draft.map((row) =>
          fetch(`/api/calculador-lunas/fabrication-costs/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ costOd: row.costOd, costOi: row.costOi }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
          })
        )
      );
      onUpdated(draft);
      setEditing(false);
      toast.success("Costos actualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const displayRows = editing ? draft : costos;
  const getRow = (id: number) => displayRows.find((r) => r.id === id);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-5 py-4 bg-surface-light hover:bg-surface-dark transition-colors"
      >
        <div className="text-left">
          <h3 className="text-[14px] font-semibold tracking-tight text-ink">Costos de Fabricación</h3>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Tabla de precios por graduación{canEdit ? "" : " · Solo administradores"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
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
                        <th className="text-right px-3 py-1.5 text-[10px] font-medium text-ink-3 uppercase tracking-wide">OD</th>
                        <th className="text-right px-3 py-1.5 text-[10px] font-medium text-ink-3 uppercase tracking-wide">OI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {group.rows.map(({ id, cil }) => {
                        const row = getRow(id);
                        if (!row) return null;
                        return (
                          <tr key={id} className="hover:bg-surface-light/50 transition-colors">
                            <td className="px-3 py-2 text-ink-3 text-[12px]">{cil}</td>
                            {(["costOd", "costOi"] as const).map((field) => (
                              <td key={field} className="px-3 py-2 text-right">
                                {editing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    defaultValue={row[field]}
                                    onChange={(e) => updateDraft(id, field, e.target.value)}
                                    className="w-20 text-right bg-surface rounded px-2 py-0.5 text-[12px] text-ink border border-border focus:border-accent focus:outline-none"
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
