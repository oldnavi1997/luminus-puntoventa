"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Package, ChevronLeft, ChevronRight, X, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";
import { ORIGEN_DE, ORIGEN_LABEL, type TipoMovimiento } from "@/lib/stock-movimiento";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  storePrice?: number | null;
  stock: number;
  stockTienda: number;
  stockAlmacen: number;
  sku?: string | null;
  brand?: string | null;
  images: string[];
  categories: { id: string; name: string }[];
  active: boolean;
  trackInventory: boolean;
}

interface Stats {
  total: number;
  totalUnits: number;
  totalValue: number;
  lowCount: number;
  outCount: number;
  inactiveCount: number;
}

type StockFilter = "all" | "low" | "out";

/**
 * Borrar un producto que ya tiene ventas no lo borra: lo desactiva (la línea del
 * comprobante lo referencia y la base impide quitarlo de en medio). Ese producto
 * desaparecía del POS sin dejar rastro y sólo se podía recuperar desde el panel
 * del ecommerce. Este filtro es la papelera.
 */
type EstadoFilter = "activos" | "inactivos" | "todos";

const ESTADO_LABEL: Record<EstadoFilter, string> = {
  activos:   "Activos",
  inactivos: "Desactivados",
  todos:     "Todos",
};

const PAGE_SIZE = 48;

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  product: Product;
  onClose: () => void;
  onSaved: (updated: Product) => void;
  onDeleted: (id: string) => void;
}

function EditModal({ product, onClose, onSaved, onDeleted }: EditModalProps) {
  const [form, setForm] = useState({
    name:           product.name,
    sku:            product.sku ?? "",
    brand:          product.brand ?? "",
    storePrice:     product.storePrice != null ? String(product.storePrice) : "",
    stockTienda:    String(product.stockTienda),
    stockAlmacen:   String(product.stockAlmacen),
    trackInventory: product.trackInventory,
    active:         product.active,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [movTipo, setMovTipo] = useState<TipoMovimiento | null>(null);
  const [movQty, setMovQty] = useState("");
  const [movLoading, setMovLoading] = useState(false);

  const set = (k: string, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleMovimiento() {
    if (!movTipo) return;
    const cantidad = Number(movQty);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError("La cantidad debe ser un entero mayor a 0");
      return;
    }
    const origen = ORIGEN_DE[movTipo];
    if (origen && cantidad > product[origen]) {
      setError(`Solo hay ${product[origen]} en ${ORIGEN_LABEL[origen]}`);
      return;
    }
    setMovLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/productos/${product.id}/movimiento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: movTipo, cantidad }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al registrar el movimiento");
      onSaved(json.product);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento.");
    } finally {
      setMovLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const stockTienda  = form.trackInventory ? Number(form.stockTienda)  : 0;
      const stockAlmacen = form.trackInventory ? Number(form.stockAlmacen) : 0;
      const res = await fetch(`/api/productos/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:           form.name,
          sku:            form.sku,
          brand:          form.brand,
          storePrice:     form.storePrice,
          stockTienda,
          stockAlmacen,
          stock:          form.trackInventory ? stockTienda + stockAlmacen : product.stock,
          trackInventory: form.trackInventory,
          active:         form.active,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const json = await res.json();
      onSaved(json.product);
      onClose();
    } catch {
      setError("No se pudo guardar. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/productos/${product.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted(product.id);
      onClose();
    } catch {
      setError("No se pudo eliminar. Intentá de nuevo.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-ink">Editar producto</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Nombre */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Nombre</label>
            <input
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* SKU + Marca */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">SKU / Código</label>
              <input
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Marca</label>
              <input
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          {/* Precio Web (read-only) */}
          {product.price > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-surface-light border border-border rounded-lg">
              <span className="text-[11.5px] text-ink-3">Precio Web (ecommerce)</span>
              <span className="text-[13px] font-mono text-ink">{formatPEN(product.price)}</span>
            </div>
          )}

          {/* Precio tienda */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Precio tienda (S/)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
              value={form.storePrice}
              onChange={(e) => set("storePrice", e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Sin inventario toggle */}
          <div className="flex items-center justify-between py-2.5 px-3 bg-surface-light border border-border rounded-lg">
            <div>
              <p className="text-[13px] font-medium text-ink">Sin control de inventario</p>
              <p className="text-[11.5px] text-ink-3 mt-0.5">Para servicios y consumibles</p>
            </div>
            <button
              onClick={() => set("trackInventory", !form.trackInventory)}
              className={`relative w-10 h-5.5 rounded-full transition-colors ${
                !form.trackInventory ? "bg-accent" : "bg-border"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                !form.trackInventory ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          {/* Stock tienda + almacén */}
          {form.trackInventory && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">
                  Stock Tienda
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                  value={form.stockTienda}
                  onChange={(e) => set("stockTienda", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">
                  Stock Almacén
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                  value={form.stockAlmacen}
                  onChange={(e) => set("stockAlmacen", e.target.value)}
                />
              </div>
              <div className="col-span-2 flex items-center justify-between px-3 py-2 bg-surface-light border border-border rounded-lg">
                <span className="text-[11.5px] text-ink-3">Total disponible</span>
                <span className="text-[13px] font-bold font-mono text-ink">
                  {(Number(form.stockTienda) || 0) + (Number(form.stockAlmacen) || 0)}
                </span>
              </div>
            </div>
          )}

          {/* Movimientos de stock */}
          {form.trackInventory && (
            <div className="border border-border rounded-lg p-3 space-y-2.5">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">Movimientos de stock</p>
              {movTipo === null ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setMovTipo("INGRESO"); setMovQty(""); setError(""); }}
                    title="Sumar unidades nuevas al almacén"
                    className="px-3 py-2 text-[12.5px] font-medium text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors"
                  >
                    📥 Ingreso
                  </button>
                  <button
                    onClick={() => { setMovTipo("TRASLADO"); setMovQty(""); setError(""); }}
                    disabled={product.stockAlmacen <= 0}
                    title="Mover de almacén a tienda"
                    className="px-3 py-2 text-[12.5px] font-medium text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors disabled:opacity-40"
                  >
                    🔄 A tienda
                  </button>
                  <button
                    onClick={() => { setMovTipo("RETORNO"); setMovQty(""); setError(""); }}
                    disabled={product.stockTienda <= 0}
                    title="Devolver de tienda a almacén"
                    className="px-3 py-2 text-[12.5px] font-medium text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors disabled:opacity-40"
                  >
                    ↩️ A almacén
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11.5px] text-ink-3">
                    {movTipo === "INGRESO"
                      ? "Sumar unidades nuevas al almacén."
                      : movTipo === "TRASLADO"
                        ? `Mover de almacén a tienda · disponible en almacén: ${product.stockAlmacen}`
                        : `Devolver de tienda a almacén · disponible en tienda: ${product.stockTienda}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      autoFocus
                      className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                      value={movQty}
                      onChange={(e) => setMovQty(e.target.value)}
                      placeholder="Cantidad"
                    />
                    <button
                      onClick={() => { setMovTipo(null); setMovQty(""); setError(""); }}
                      className="px-3 py-2 text-[12.5px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleMovimiento}
                      disabled={movLoading}
                      className="px-4 py-2 text-[12.5px] font-medium bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                    >
                      {movLoading ? "Guardando…" : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activo */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => set("active", !form.active)}
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                form.active ? "bg-accent border-accent" : "border-border"
              }`}
            >
              {form.active && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
            </button>
            <span className="text-[13px] text-ink">Producto activo</span>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-[13px] text-ink text-center">
                ¿Eliminar <span className="font-semibold">{product.name}</span>?
              </p>
              <p className="text-[11.5px] text-ink-3 text-center">Esta acción no se puede deshacer</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-4 py-1.5 text-[13px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-1.5 text-[13px] font-medium bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10 rounded-lg border border-danger/30 transition-colors"
              >
                <Trash2 size={13} /> Eliminar
              </button>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-[13px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-[13px] font-medium bg-ink text-white rounded-lg hover:bg-ink-2 disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Product Modal ────────────────────────────────────────────────────────

interface NewModalProps {
  onClose: () => void;
  onCreated: (p: Product) => void;
}

function NewProductModal({ onClose, onCreated }: NewModalProps) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name:           "",
    sku:            "",
    brand:          "",
    price:          "",
    storePrice:     "",
    categoryId:     "",
    stockTienda:    "0",
    stockAlmacen:   "0",
    trackInventory: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/productos/categorias")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { setError("El nombre es requerido"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:           form.name.trim(),
          sku:            form.sku.trim(),
          brand:          form.brand.trim(),
          price:          form.price,
          storePrice:     form.storePrice,
          categoryId:     form.categoryId || undefined,
          stockTienda:    form.trackInventory ? Number(form.stockTienda) : 0,
          stockAlmacen:   form.trackInventory ? Number(form.stockAlmacen) : 0,
          trackInventory: form.trackInventory,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear");
      onCreated(json.product);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-[15px] font-semibold text-ink">Nuevo producto</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
          {/* Nombre */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Nombre *</label>
            <input
              autoFocus
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej: Armazón Ray-Ban RB3025"
            />
          </div>

          {/* SKU + Marca */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">SKU / Código</label>
              <input
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Marca</label>
              <input
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          {/* Precio web + Precio tienda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Precio web (S/)</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Precio tienda (S/)</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                value={form.storePrice}
                onChange={(e) => set("storePrice", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Categoría */}
          {categories.length > 0 && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Categoría</label>
              <select
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sin inventario toggle */}
          <div className="flex items-center justify-between py-2.5 px-3 bg-surface-light border border-border rounded-lg">
            <div>
              <p className="text-[13px] font-medium text-ink">Sin control de inventario</p>
              <p className="text-[11.5px] text-ink-3 mt-0.5">Para servicios y consumibles</p>
            </div>
            <button
              onClick={() => set("trackInventory", !form.trackInventory)}
              className={`relative w-10 h-5.5 rounded-full transition-colors ${!form.trackInventory ? "bg-accent" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${!form.trackInventory ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Stock */}
          {form.trackInventory && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Stock Tienda</label>
                <input
                  type="number" min="0"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                  value={form.stockTienda}
                  onChange={(e) => set("stockTienda", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">Stock Almacén</label>
                <input
                  type="number" min="0"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
                  value={form.stockAlmacen}
                  onChange={(e) => set("stockAlmacen", e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[13px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border rounded-lg border border-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-1.5 text-[13px] font-medium bg-ink text-white rounded-lg hover:bg-ink-2 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creando…" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function InventoryView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [estado, setEstado] = useState<EstadoFilter>("activos");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0, totalUnits: 0, totalValue: 0, lowCount: 0, outCount: 0, inactiveCount: 0,
  });
  const [reactivando, setReactivando] = useState<string | null>(null);
  const [editing,    setEditing]    = useState<Product | null>(null);
  const [showNew,    setShowNew]    = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { setPage(1); }, [debouncedQuery, filter, estado]);

  const refrescarStats = useCallback(() => {
    fetch("/api/productos/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => { refrescarStats(); }, [refrescarStats]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (filter !== "all") params.set("stockFilter", filter);
    if (estado !== "activos") params.set("estado", estado);
    const res = await fetch(`/api/productos?${params}`);
    const json = await res.json();
    setProducts(json.products ?? []);
    setTotalPages(json.pages ?? 1);
    setTotalFiltered(json.total ?? 0);
    setLoading(false);
  }, [debouncedQuery, filter, estado, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function handleSaved(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    refrescarStats();
  }

  function handleDeleted(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    refrescarStats();
  }

  async function handleReactivar(p: Product) {
    setReactivando(p.id);
    try {
      const res = await fetch(`/api/productos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${p.name}" vuelve a estar activo`);
      // La fila deja de encajar en el filtro "Desactivados", y el conteo de la
      // página cambia: se recarga en vez de parchear la lista a mano.
      await fetchProducts();
      refrescarStats();
    } catch {
      toast.error("No se pudo reactivar. Intentá de nuevo.");
    } finally {
      setReactivando(null);
    }
  }

  function handleCreated(p: Product) {
    setProducts((prev) => [p, ...prev]);
    refrescarStats();
  }

  const stockState = (p: Product) => {
    if (!p.trackInventory) return "service";
    const total = p.stockTienda + p.stockAlmacen;
    if (total === 0) return "out";
    if (total <= 5) return "low";
    return "ok";
  };

  return (
    <div className="flex flex-col h-full">
      {editing && (
        <EditModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {showNew && (
        <NewProductModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}

      <ModuleHeader
        title="Inventario"
        subtitle="Control de stock y productos"
        right={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-ink text-white rounded-lg px-3 py-1.5 text-[13px] font-medium hover:bg-ink-2 transition-colors"
          >
            <Plus size={14} /> Nuevo producto
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "Productos activos", value: String(stats.total), sub: `${stats.totalUnits.toLocaleString()} unidades` },
            { label: "Valor de inventario", value: formatPEN(stats.totalValue), sub: "a precio de venta", color: "text-success" },
            { label: "Stock bajo", value: String(stats.lowCount), sub: "Necesitan reposición", color: "text-warning" },
            { label: "Agotados", value: String(stats.outCount), sub: "Sin disponibilidad", color: "text-danger" },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium mb-1.5">{s.label}</div>
              <div className={`text-[22px] font-bold font-mono tracking-tight ${s.color ?? "text-ink"}`}>{s.value}</div>
              <div className="text-[11.5px] text-ink-3 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
            <div className="relative flex-1 max-w-72">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                className="w-full bg-surface-light border border-border rounded-lg pl-8 pr-3 py-2 text-[13px] text-ink placeholder-ink-4 focus:outline-none focus:border-accent"
                placeholder="Buscar por nombre, marca o SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex bg-surface-light rounded-lg p-0.5 gap-0.5 border border-border">
              {(["all", "low", "out"] as StockFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    filter === f ? "bg-surface shadow-sm text-ink" : "text-ink-3"
                  }`}
                >
                  {f === "all" ? "Todos" : f === "low" ? "Stock bajo" : "Agotados"}
                </button>
              ))}
            </div>
            <div className="flex bg-surface-light rounded-lg p-0.5 gap-0.5 border border-border">
              {(["activos", "inactivos", "todos"] as EstadoFilter[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEstado(e)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    estado === e ? "bg-surface shadow-sm text-ink" : "text-ink-3"
                  }`}
                >
                  {ESTADO_LABEL[e]}
                  {e === "inactivos" && stats.inactiveCount > 0 && (
                    <span className="ml-1.5 text-[11px] font-mono text-ink-4">{stats.inactiveCount}</span>
                  )}
                </button>
              ))}
            </div>
            <span className="text-[12.5px] text-ink-3 ml-auto">{totalFiltered} productos</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ink-3">Cargando inventario...</div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={32} className="mx-auto text-ink-4 mb-3 opacity-50" />
              <p className="text-[13px] text-ink-3">Sin resultados</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-light">
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Producto</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">SKU</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Categoría</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Marca</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Precio Web</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Precio tienda</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Tienda</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border">Almacén</th>
                  <th className="px-4 py-2.5 border-b border-border"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const state = stockState(p);
                  const total = p.stockTienda + p.stockAlmacen;
                  const maxStock = Math.max(total, 20);
                  const pct = (total / maxStock) * 100;
                  return (
                    <tr key={p.id} className="hover:bg-surface-light transition-colors">
                      <td className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2.5">
                          {p.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.images[0]} alt={p.name} className="w-8 h-8 object-cover rounded-md border border-border shrink-0" />
                          ) : (
                            <div className="w-8 h-8 bg-surface-light rounded-md border border-border flex items-center justify-center shrink-0">
                              <Package size={12} className="text-ink-4" />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[13px] font-medium text-ink leading-tight line-clamp-1">{p.name}</span>
                            {!p.active && (
                              <span className="text-[10px] font-medium text-danger bg-danger/10 border border-danger/25 rounded-full px-1.5 py-px w-fit">
                                desactivado
                              </span>
                            )}
                            {!p.trackInventory && (
                              <span className="text-[10px] font-medium text-ink-3 bg-surface-dark border border-border rounded-full px-1.5 py-px w-fit">
                                sin inventario
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-border text-[12px] font-mono text-ink-3">
                        {p.sku ?? "—"}
                      </td>
                      <td className="px-4 py-3 border-b border-border text-[12.5px] text-ink-3">
                        {p.categories[0]?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 border-b border-border text-[12.5px] text-ink-3">
                        {p.brand ?? "—"}
                      </td>
                      <td className="px-4 py-3 border-b border-border text-right">
                        <span className="text-[12.5px] font-mono text-ink-3">
                          {p.price > 0 ? formatPEN(p.price) : <span className="text-ink-4">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-border text-right">
                        <span className="text-[13px] font-semibold font-mono text-ink">
                          {p.storePrice != null ? formatPEN(p.storePrice) : <span className="text-ink-4">—</span>}
                        </span>
                      </td>

                      {/* Stock Tienda */}
                      <td className="px-4 py-3 border-b border-border text-right">
                        {state === "service" ? (
                          <span className="text-[12px] text-ink-3 italic">—</span>
                        ) : (
                          <span className={`text-[13px] font-bold font-mono ${
                            p.stockTienda === 0 ? "text-danger" : p.stockTienda <= 3 ? "text-warning" : "text-ink"
                          }`}>{p.stockTienda}</span>
                        )}
                      </td>

                      {/* Stock Almacén */}
                      <td className="px-4 py-3 border-b border-border text-right">
                        {state === "service" ? (
                          <span className="text-[12px] text-ink-3 italic">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2.5">
                            <span className={`text-[13px] font-bold font-mono ${
                              state === "out" ? "text-danger" : state === "low" ? "text-warning" : "text-ink"
                            }`}>{p.stockAlmacen}</span>
                            <div className="w-14 h-1.5 bg-surface-light rounded-full overflow-hidden border border-border">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  state === "out" ? "bg-danger" : state === "low" ? "bg-warning" : "bg-success"
                                }`}
                                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 border-b border-border text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!p.active && (
                            <button
                              onClick={() => handleReactivar(p)}
                              disabled={reactivando === p.id}
                              title="Volver a ponerlo a la venta"
                              className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border px-3 py-1 rounded-lg transition-colors border border-border disabled:opacity-40"
                            >
                              <RotateCcw size={12} />
                              {reactivando === p.id ? "Reactivando…" : "Reactivar"}
                            </button>
                          )}
                          <button
                            onClick={() => setEditing(p)}
                            className="text-[12px] text-ink-3 hover:text-ink bg-surface-light hover:bg-border px-3 py-1 rounded-lg transition-colors border border-border"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-[12px] text-ink-3">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] bg-surface-light hover:bg-border disabled:opacity-40 rounded-lg transition-colors border border-border text-ink"
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] bg-surface-light hover:bg-border disabled:opacity-40 rounded-lg transition-colors border border-border text-ink"
                >
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
