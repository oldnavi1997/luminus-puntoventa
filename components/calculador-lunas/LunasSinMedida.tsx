"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { LunaSinMedidaRow } from "@/lib/calculador-lunas/types";

const EDIT_ROLES = new Set(["ADMIN", "SUPERVISOR"]);

export default function LunasSinMedida() {
  const { data: session } = useSession();
  const canEdit = !!session && EDIT_ROLES.has(session.user.role);

  const [rows, setRows]       = useState<LunaSinMedidaRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<LunaSinMedidaRow[]>([]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch("/api/calculador-lunas/lunas-sin-medida")
      .then((r) => r.json())
      .then((data: LunaSinMedidaRow[]) => setRows(data))
      .catch(() => toast.error("No se pudo cargar la lista"));
  }, []);

  function startEdit() {
    setDraft(rows.map((r) => ({ ...r })));
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft([]);
  }

  function updateDraft(id: string, raw: string) {
    setDraft((prev) =>
      prev.map((r) => (r.id === id ? { ...r, precio: parseFloat(raw) || 0 } : r))
    );
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await Promise.all(
        draft.map((row) =>
          fetch(`/api/calculador-lunas/lunas-sin-medida/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ precio: row.precio }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
          })
        )
      );
      setRows(draft);
      setEditing(false);
      toast.success("Precios actualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const displayRows = editing ? draft : rows;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden mt-6">
      <div className="bg-accent px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">Lunas sin medida</h2>
          <p className="text-[11px] text-white/70 mt-0.5">Precio fijo · Sin graduación</p>
        </div>
        {canEdit && !editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors"
          >
            <Pencil size={13} /> Editar
          </button>
        )}
        {canEdit && editing && (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              <X size={13} /> Cancelar
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 bg-white/30 hover:bg-white/40 text-white text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-60"
            >
              <Check size={13} /> {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface-light">
              <th className="text-left px-6 py-3 text-[10px] font-medium text-ink-3 uppercase tracking-wide">Luna</th>
              <th className="text-right px-6 py-3 text-[10px] font-medium text-ink-3 uppercase tracking-wide">Precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row) => (
              <tr key={row.id} className="hover:bg-surface-light/50 transition-colors">
                <td className="px-6 py-3 text-ink">{row.nombre}</td>
                <td className="px-6 py-3 text-right">
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={row.precio}
                      onChange={(e) => updateDraft(row.id, e.target.value)}
                      className="w-24 text-right bg-surface rounded px-2 py-1 text-[13px] text-ink border border-border focus:border-accent focus:outline-none"
                    />
                  ) : (
                    <span className="text-ink font-medium tabular-nums">S/. {row.precio.toFixed(2)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
