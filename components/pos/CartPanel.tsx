"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Minus, ShoppingCart, Tag, Percent } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { formatPEN } from "@/lib/utils";
import { calcularIGV } from "@/lib/sunat";
import { CustomerPanel } from "./CustomerPanel";
import { LensSelector } from "./LensSelector";
import { PaymentModal } from "./PaymentModal";
import { getLensLabel } from "@/lib/lens-tree";
import type { ProductForPOS, StockSource } from "@/types";

interface CartPanelProps {
  posSessionId: string;
  cashierId: string;
  selectedProduct: ProductForPOS | null;
  onProductHandled: () => void;
  isAdmin?: boolean;
  stockSource?: StockSource;
  onStockSourceChange?: (s: StockSource) => void;
}

export function CartPanel({ posSessionId, cashierId, selectedProduct, onProductHandled, isAdmin = false, stockSource = "TIENDA", onStockSourceChange }: CartPanelProps) {
  const { items, customer, discount, removeItem, updateQuantity, updatePrice, setDiscount, total, subtotal, discountAmount } = useCartStore();
  const [lensProduct, setLensProduct] = useState<ProductForPOS | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [discountInput, setDiscountInput] = useState("");

  useEffect(() => {
    if (!selectedProduct) return;
    if (false && selectedProduct?.requiresLensSelection) {
      setLensProduct(selectedProduct);
    } else {
      useCartStore.getState().addItem({
        id: selectedProduct.id,
        cartKey: selectedProduct.id,
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        price: selectedProduct.storePrice ?? selectedProduct.price,
        imageUrl: selectedProduct.images[0],
        quantity: 1,
        stock: selectedProduct.trackInventory ? selectedProduct.stock : 999999,
        slug: selectedProduct.slug,
      });
    }
    onProductHandled();
  }, [selectedProduct, onProductHandled]);

  const totalForIGV = total();
  const { baseImponible, igv } = calcularIGV(totalForIGV);

  const canPay = items.length > 0;

  return (
    <>
      <div className="h-full flex flex-col bg-surface">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold">Venta actual</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">NOTA DE VENTA</span>
              <span className="text-[12px] text-ink-3">
                {items.reduce((s, i) => s + i.quantity, 0)} {items.reduce((s, i) => s + i.quantity, 0) === 1 ? "ítem" : "ítems"}
              </span>
            </div>
          </div>
          {isAdmin && onStockSourceChange && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-4 font-medium">Stock:</span>
              <div className="flex bg-surface-light border border-border rounded-lg p-0.5 gap-0.5">
                {(["TIENDA", "ALMACEN"] as StockSource[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => onStockSourceChange(s)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      stockSource === s
                        ? "bg-accent text-white shadow-sm"
                        : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    {s === "TIENDA" ? "Tienda" : "Almacén"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-ink-4 font-medium mb-2">Cliente (opcional)</div>
          <CustomerPanel />
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-3 py-10">
              <ShoppingCart size={36} className="mb-3 opacity-20" />
              <p className="text-[13px]">Carrito vacío</p>
              <p className="text-[11.5px] text-ink-4 mt-1">Toca un producto para comenzar</p>
            </div>
          ) : (
            items.map((item) => (
              <CartItemRow
                key={item.cartKey}
                item={item}
                onRemove={() => removeItem(item.cartKey)}
                onQtyChange={(q) => updateQuantity(item.cartKey, q)}
                onPriceChange={(p) => updatePrice(item.cartKey, p)}
              />
            ))
          )}
        </div>

        {/* Totals */}
        {items.length > 0 && (
          <div className="border-t border-border shrink-0">
            <div className="px-4 py-3 space-y-1.5">
              {/* Breakdown */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[12.5px] text-ink-3">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatPEN(subtotal())}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[12.5px] text-warning">
                    <span>Descuento ({discount}%)</span>
                    <span className="font-mono">-{formatPEN(discountAmount())}</span>
                  </div>
                )}
                <div className="flex justify-between text-[12.5px] text-ink-3">
                  <span>Op. gravada</span>
                  <span className="font-mono">{formatPEN(baseImponible)}</span>
                </div>
                <div className="flex justify-between text-[12.5px] text-ink-3">
                  <span>IGV 18%</span>
                  <span className="font-mono">{formatPEN(igv)}</span>
                </div>
                <div className="flex justify-between text-[16px] font-bold text-ink pt-2 border-t border-dashed border-border-strong mt-1">
                  <span>Total</span>
                  <span className="font-mono">{formatPEN(totalForIGV)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 space-y-2">
              <button
                onClick={() => setShowPayment(true)}
                disabled={!canPay}
                className="w-full bg-accent hover:bg-accent-dark disabled:opacity-40 active:scale-[0.98] text-white font-bold rounded-xl py-3.5 text-[15px] transition-all"
              >
                Cobrar · {formatPEN(totalForIGV)}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { useCartStore.getState().clearCart(); setDiscountInput(""); }}
                  disabled={items.length === 0}
                  className="bg-surface-light hover:bg-border disabled:opacity-40 rounded-lg py-2 text-[13px] text-ink-2 transition-colors border border-border"
                >
                  Vaciar
                </button>
                <button
                  disabled
                  className="bg-surface-light rounded-lg py-2 text-[13px] text-ink-4 border border-border opacity-50"
                >
                  En espera
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {lensProduct && (
        <LensSelector product={lensProduct} onClose={() => setLensProduct(null)} />
      )}

      {showPayment && (
        <PaymentModal
          posSessionId={posSessionId}
          cashierId={cashierId}
          total={totalForIGV}
          customer={customer}
          discount={discount}
          docType="NOTA_VENTA"
          stockSource={stockSource}
          onClose={() => setShowPayment(false)}
        />
      )}
    </>
  );
}

function CartItemRow({
  item,
  onRemove,
  onQtyChange,
  onPriceChange,
}: {
  item: ReturnType<typeof useCartStore.getState>["items"][number];
  onRemove: () => void;
  onQtyChange: (q: number) => void;
  onPriceChange: (p: number) => void;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const lensLabel = item.lensType
    ? getLensLabel(item.lensType, item.lensSubType, item.lensVariant)
    : null;
  const unitPrice = item.editedPrice ?? item.price;
  const lineTotal = (unitPrice + (item.lensPrice ?? 0)) * item.quantity;
  const priceEdited = item.editedPrice != null && item.editedPrice !== item.price;

  function startEdit() {
    setInputVal(unitPrice.toFixed(2));
    setEditingPrice(true);
  }

  function confirmEdit() {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val > 0) onPriceChange(val);
    setEditingPrice(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") setEditingPrice(false);
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5 hover:bg-surface-light transition-colors">
      <div className="flex items-start gap-2 mb-2">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="w-9 h-9 object-cover rounded-md shrink-0" />
        ) : (
          <div className="w-9 h-9 bg-surface-light rounded-md flex items-center justify-center shrink-0 border border-border">
            <Tag size={13} className="text-ink-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-ink leading-tight line-clamp-1">{item.name}</p>
          {item.sku && <p className="text-[12px] text-ink-4 font-mono mt-0.5">Código: {item.sku}</p>}
          {lensLabel && <p className="text-[10.5px] text-accent mt-0.5">{lensLabel}</p>}
        </div>
        <button onClick={onRemove} className="text-ink-4 hover:text-danger transition-colors p-0.5 shrink-0">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-surface-light rounded-md overflow-hidden border border-border">
          <button
            onClick={() => onQtyChange(item.quantity - 1)}
            className="w-6 h-6 flex items-center justify-center text-ink-2 hover:bg-border transition-colors"
          >
            <Minus size={10} />
          </button>
          <span className="text-[12px] font-semibold text-ink w-5 text-center font-mono">{item.quantity}</span>
          <button
            onClick={() => onQtyChange(item.quantity + 1)}
            disabled={item.quantity >= item.stock}
            className="w-6 h-6 flex items-center justify-center text-ink-2 hover:bg-border disabled:opacity-30 transition-colors"
          >
            <Plus size={10} />
          </button>
        </div>
        <div className="text-right">
          {priceEdited && (
            <p className="text-[10px] text-ink-4 font-mono line-through">{formatPEN(item.price)}</p>
          )}
          {item.lensPrice && item.lensPrice > 0 && (
            <p className="text-[10px] text-ink-4 font-mono">{formatPEN(unitPrice)} + {formatPEN(item.lensPrice)}</p>
          )}
          {editingPrice ? (
            <input
              type="number"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              min="0.01"
              step="0.01"
              className="w-20 text-right text-[13px] font-semibold font-mono bg-surface border border-accent rounded px-1 py-0.5 focus:outline-none text-ink"
            />
          ) : (
            <button
              onClick={startEdit}
              title="Clic para editar precio"
              className={`text-[13.5px] font-semibold font-mono transition-colors ${priceEdited ? "text-warning" : "text-ink hover:text-accent"}`}
            >
              {formatPEN(lineTotal)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
