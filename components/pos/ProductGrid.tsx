"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Tag } from "lucide-react";
import type { ProductForPOS, StockSource } from "@/types";
import { formatPEN } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
}

interface ProductGridProps {
  onSelectProduct: (product: ProductForPOS) => void;
  stockSource?: StockSource;
}

export function ProductGrid({ onSelectProduct, stockSource = "TIENDA" }: ProductGridProps) {
  const [products, setProducts] = useState<ProductForPOS[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, categoryId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (categoryId) params.set("category", categoryId);
    params.set("page", String(page));
    params.set("limit", "48");

    const res = await fetch(`/api/productos?${params}`);
    const json = await res.json();
    setProducts(json.products ?? []);
    setTotalPages(json.pages ?? 1);
    setLoading(false);
  }, [debouncedSearch, categoryId, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Load categories once
  useEffect(() => {
    fetch("/api/productos/categorias")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface-dark">
      {/* Search + Category bar */}
      <div className="p-3 space-y-2 border-b border-border shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>

      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-xl h-32 animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-text-muted">
            <Tag size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Sin resultados</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                stockSource={stockSource}
                onClick={() => onSelectProduct(product)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4 pb-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs bg-surface hover:bg-surface-light disabled:opacity-40 rounded-lg text-text transition-colors"
            >
              ←
            </button>
            <span className="px-3 py-1.5 text-xs text-text-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs bg-surface hover:bg-surface-light disabled:opacity-40 rounded-lg text-text transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, stockSource, onClick }: { product: ProductForPOS; stockSource: StockSource; onClick: () => void }) {
  const img = product.images[0];
  const availableStock = stockSource === "ALMACEN" ? product.stockAlmacen : product.stockTienda;
  const tracked = product.trackInventory;

  return (
    <button
      onClick={onClick}
      disabled={tracked && availableStock === 0}
      className="relative bg-surface hover:bg-surface-light active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl p-2 text-left transition-all group"
    >
      {/* Image */}
      <div className="w-full aspect-square bg-surface-dark rounded-lg mb-2 overflow-hidden">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <Tag size={20} />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-[11px] font-medium text-text leading-tight line-clamp-2 mb-1">
        {product.name}
      </p>
      {product.sku && (
        <p className="text-[12px] text-ink-4 font-mono mb-0.5 truncate">Código: {product.sku}</p>
      )}
      <p className="text-[11px] font-bold text-accent">{formatPEN(product.storePrice ?? product.price)}</p>

      {/* Stock badge */}
      <div
        className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
          !tracked
            ? "bg-accent/10 text-accent"
            : availableStock === 0
            ? "bg-danger/20 text-danger"
            : availableStock <= 3
            ? "bg-warning/20 text-warning"
            : "bg-success/10 text-success"
        }`}
      >
        {!tracked ? "Libre" : availableStock === 0 ? "Agotado" : availableStock}
      </div>

      {/* Lens required badge */}
      {product.requiresLensSelection && (
        <div className="absolute top-1.5 left-1.5 text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium">
          Lentes
        </div>
      )}
    </button>
  );
}
