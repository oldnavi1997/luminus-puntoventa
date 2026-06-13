"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Minus, X, Package, Boxes } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";

interface Product {
  id: string;
  name: string;
  sku?: string | null;
  stock: number;
  stockTienda: number;
  stockAlmacen: number;
  images: string[];
  trackInventory: boolean;
}

interface LineItem {
  product: Product;
  cantidad: number;
}

type Tipo = "INGRESO" | "TRASLADO";

export function MovimientosView() {
  const [tipo, setTipo] = useState<Tipo>("INGRESO");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const addedIds = new Set(items.map((i) => i.product.id));

  const fetchResults = useCallback(async () => {
    if (!debouncedQuery.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/productos?limit=25&q=${encodeURIComponent(debouncedQuery)}`);
      const json = await res.json();
      setResults(json.products ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  function switchTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    setItems([]);
    setError("");
    setSuccess("");
  }

  function canAdd(p: Product): boolean {
    if (!p.trackInventory) return false;
    if (tipo === "TRASLADO" && p.stockAlmacen <= 0) return false;
    return true;
  }

  function addProduct(p: Product) {
    if (!canAdd(p) || addedIds.has(p.id)) return;
    setItems((prev) => [{ product: p, cantidad: 1 }, ...prev]);
    setQuery("");
    setResults([]);
    setSuccess("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== id));
  }

  function setCantidad(id: string, value: number) {
    setItems((prev) => prev.map((i) => {
      if (i.product.id !== id) return i;
      let n = Number.isFinite(value) ? Math.floor(value) : 1;
      if (n < 1) n = 1;
      if (tipo === "TRASLADO") n = Math.min(n, i.product.stockAlmacen);
      return { ...i, cantidad: n };
    }));
  }

  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);

  async function handleConfirm() {
    if (items.length === 0) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/productos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          items: items.map((i) => ({ productId: i.product.id, cantidad: i.cantidad })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al registrar el movimiento");
      const label = tipo === "INGRESO" ? "Ingreso a almacén" : "Traslado a tienda";
      setSuccess(`${label}: ${items.length} productos · ${totalUnidades} unidades.`);
      setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader title="Movimientos de stock" subtitle="Ingreso y traslado por lote" />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Tipo */}
          <div className="flex bg-surface-light rounded-lg p-0.5 gap-0.5 border border-border w-fit">
            {(["INGRESO", "TRASLADO"] as Tipo[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTipo(t)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  tipo === t ? "bg-surface shadow-sm text-ink" : "text-ink-3"
                }`}
              >
                {t === "INGRESO" ? "📥 Ingreso a almacén" : "🔄 Traslado a tienda"}
              </button>
            ))}
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-[13px] text-ink placeholder-ink-4 focus:outline-none focus:border-accent"
              placeholder="Buscar producto o SKU para agregar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {/* Resultados */}
            {query.trim().length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-3 text-[12.5px] text-ink-3 text-center">Buscando…</div>
                ) : results.filter((p) => !addedIds.has(p.id)).length === 0 ? (
                  <div className="px-4 py-3 text-[12.5px] text-ink-3 text-center">Sin resultados disponibles</div>
                ) : (
                  results.filter((p) => !addedIds.has(p.id)).map((p) => {
                    const disabled = !canAdd(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        disabled={disabled}
                        className={`flex items-center gap-2.5 w-full text-left px-3 py-2 border-b border-border last:border-0 transition-colors ${
                          disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-surface-light"
                        }`}
                      >
                        <Thumb product={p} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-ink line-clamp-1">{p.name}</div>
                          <div className="text-[10.5px] font-mono text-ink-4">
                            {p.sku ? `${p.sku} · ` : ""}Almacén: {p.stockAlmacen}
                            {!p.trackInventory ? " · sin inventario" : ""}
                          </div>
                        </div>
                        {!disabled && <Plus size={15} className="text-accent shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Lista seleccionada */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {items.length === 0 ? (
              <div className="p-10 text-center">
                <Boxes size={30} className="mx-auto text-ink-4 mb-2 opacity-50" />
                <p className="text-[13px] text-ink-3">Buscá y agregá productos para armar el lote.</p>
              </div>
            ) : (
              items.map((i) => (
                <div key={i.product.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  <Thumb product={i.product} big />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-ink line-clamp-1">{i.product.name}</div>
                    <div className="text-[11px] font-mono text-ink-4 mt-0.5">
                      {i.product.sku ? `${i.product.sku} · ` : ""}Tienda: {i.product.stockTienda} · Almacén: {i.product.stockAlmacen}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCantidad(i.product.id, i.cantidad - 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-light border border-border hover:bg-border transition-colors">
                      <Minus size={13} className="text-ink-2" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={i.cantidad}
                      onChange={(e) => setCantidad(i.product.id, Number(e.target.value))}
                      className="w-14 text-center bg-surface-light border border-border rounded-md py-1 text-[13px] font-mono font-bold text-ink focus:outline-none focus:border-accent"
                    />
                    <button onClick={() => setCantidad(i.product.id, i.cantidad + 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-light border border-border hover:bg-border transition-colors">
                      <Plus size={13} className="text-ink-2" />
                    </button>
                  </div>
                  <button onClick={() => removeItem(i.product.id)} className="w-7 h-7 flex items-center justify-center rounded-md bg-danger-soft border border-danger/30 text-danger hover:opacity-90 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          {success && <p className="text-[12.5px] text-success">{success}</p>}

          {/* Footer */}
          {items.length > 0 && (
            <div className="flex items-center gap-4 sticky bottom-0 bg-primary py-3">
              <div>
                <div className="text-[14px] font-bold text-ink">{items.length} productos</div>
                <div className="text-[11.5px] font-mono text-ink-3">{totalUnidades} unidades</div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="ml-auto px-6 py-2.5 text-[13px] font-medium bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Aplicando…" : "Confirmar movimiento"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Thumb({ product, big }: { product: Product; big?: boolean }) {
  const size = big ? "w-10 h-10" : "w-8 h-8";
  if (product.images?.[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.images[0]} alt={product.name} className={`${size} object-cover rounded-md border border-border shrink-0`} />;
  }
  return (
    <div className={`${size} bg-surface-light rounded-md border border-border flex items-center justify-center shrink-0`}>
      <Package size={big ? 14 : 12} className="text-ink-4" />
    </div>
  );
}
