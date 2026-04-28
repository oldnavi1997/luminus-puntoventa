"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Pencil, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { LensCatalogRow } from "@/lib/calculador-lunas/types";

const AR_COLS = [
  { key: "ar16"      as const, label: "AR16"      },
  { key: "arshapire" as const, label: "ARSHAPIRE" },
];

const NEW_ROW_PREFIX = "new-";
const EDIT_ROLES = new Set(["ADMIN"]);

export default function LensCatalog() {
  const { data: session } = useSession();
  const canEdit = !!session && EDIT_ROLES.has(session.user.role);

  const [rows, setRows]       = useState<LensCatalogRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<LensCatalogRow[]>([]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch("/api/calculador-lunas/lens-catalog")
      .then((r) => r.json())
      .then((data: LensCatalogRow[]) => setRows(data))
      .catch(() => toast.error("No se pudo cargar el catálogo"));
  }, []);

  function startEdit() {
    setDraft(rows.map((r) => ({ ...r })));
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft([]);
  }

  function addRow() {
    const tempId = `${NEW_ROW_PREFIX}${Date.now()}`;
    const maxOrder = draft.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    setDraft((prev) => [
      ...prev,
      { id: tempId, nombre: "", nota: null, ar16: null, arsy: null, arshapire: null, sortOrder: maxOrder + 1 },
    ]);
  }

  function updateDraftNombre(id: string, val: string) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, nombre: val } : r)));
  }

  function updateDraftPrice(id: string, col: "ar16" | "arshapire", raw: string) {
    setDraft((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [col]: raw === "" ? null : parseFloat(raw) } : r))
    );
  }

  function removeRow(id: string) {
    setDraft((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const existing = draft.filter((r) => !r.id.startsWith(NEW_ROW_PREFIX));
      const newRows  = draft.filter((r) =>  r.id.startsWith(NEW_ROW_PREFIX));

      await Promise.all(
        existing.map((row) =>
          fetch(`/api/calculador-lunas/lens-catalog/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre: row.nombre, ar16: row.ar16, arshapire: row.arshapire }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
          })
        )
      );

      const inserted: LensCatalogRow[] = [];
      for (const row of newRows) {
        if (!row.nombre.trim()) continue;
        const res = await fetch("/api/calculador-lunas/lens-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: row.nombre,
            nota: row.nota,
            ar16: row.ar16,
            arshapire: row.arshapire,
            sortOrder: row.sortOrder,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al crear");
        inserted.push(await res.json());
      }

      setRows([...existing, ...inserted]);
      setEditing(false);
      toast.success("Catálogo actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const displayRows = editing ? draft : rows;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="bg-accent px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">Catálogo de Precios</h2>
          <p className="text-[11px] text-white/70 mt-0.5">Lunas premium · Precios en Soles (PEN)</p>
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
              {AR_COLS.map((c) => (
                <th
                  key={c.key}
                  className="text-right px-4 py-3 text-[10px] font-medium text-ink-3 uppercase tracking-wide"
                >
                  {c.label}
                </th>
              ))}
              {editing && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row) => (
              <tr key={row.id} className="hover:bg-surface-light/50 transition-colors">
                <td className="px-6 py-3 text-ink">
                  {editing ? (
                    <input
                      type="text"
                      value={row.nombre}
                      placeholder="Nombre de la luna"
                      onChange={(e) => updateDraftNombre(row.id, e.target.value)}
                      className="w-full bg-surface rounded px-2 py-1 text-[13px] text-ink border border-border focus:border-accent focus:outline-none"
                    />
                  ) : (
                    <>
                      {row.nombre}
                      {row.nota && <span className="ml-1 text-ink-3 text-[11px]">{row.nota}</span>}
                    </>
                  )}
                </td>
                {AR_COLS.map((col) => {
                  const val = row[col.key];
                  return (
                    <td key={col.key} className="px-4 py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={val ?? ""}
                          placeholder="—"
                          onChange={(e) => updateDraftPrice(row.id, col.key, e.target.value)}
                          className="w-24 text-right bg-surface rounded px-2 py-1 text-[13px] text-ink border border-border focus:border-accent focus:outline-none"
                        />
                      ) : val === null ? (
                        <span className="text-ink-4 italic text-[11px]">No disp.</span>
                      ) : (
                        <span className="text-ink font-medium tabular-nums">S/. {val.toFixed(2)}</span>
                      )}
                    </td>
                  );
                })}
                {editing && (
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="text-ink-3 hover:text-danger transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="px-6 py-3 border-t border-border">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-dark transition-colors"
          >
            <Plus size={14} /> Añadir luna
          </button>
        </div>
      )}
    </div>
  );
}
