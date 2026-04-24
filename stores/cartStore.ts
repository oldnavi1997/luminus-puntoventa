"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PosCartItem, PosCustomer } from "@/types";

interface CartStore {
  items: PosCartItem[];
  customer: PosCustomer | null;
  discount: number; // porcentaje 0-100

  // Actions
  addItem: (item: PosCartItem) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, qty: number) => void;
  updatePrice: (cartKey: string, price: number) => void;
  setCustomer: (customer: PosCustomer | null) => void;
  setDiscount: (pct: number) => void;
  clearCart: () => void;

  // Computed
  itemCount: () => number;
  subtotal: () => number;
  discountAmount: () => number;
  total: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      discount: 0,

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => i.cartKey === item.cartKey);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.cartKey === item.cartKey
                  ? { ...i, quantity: Math.min(i.quantity + item.quantity, i.stock) }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem: (cartKey) => {
        set((state) => ({ items: state.items.filter((i) => i.cartKey !== cartKey) }));
      },

      updatePrice: (cartKey, price) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.cartKey === cartKey ? { ...i, editedPrice: price } : i
          ),
        }));
      },

      updateQuantity: (cartKey, qty) => {
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.cartKey !== cartKey)
              : state.items.map((i) =>
                  i.cartKey === cartKey
                    ? { ...i, quantity: Math.min(qty, i.stock) }
                    : i
                ),
        }));
      },

      setCustomer: (customer) => set({ customer }),

      setDiscount: (pct) => set({ discount: Math.max(0, Math.min(100, pct)) }),

      clearCart: () => set({ items: [], customer: null, discount: 0 }),

      itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),

      subtotal: () =>
        get().items.reduce(
          (s, i) => s + ((i.editedPrice ?? i.price) + (i.lensPrice ?? 0)) * i.quantity,
          0
        ),

      discountAmount: () => {
        const sub = get().subtotal();
        return Math.round((sub * get().discount) / 100 * 100) / 100;
      },

      total: () => {
        const sub = get().subtotal();
        const disc = get().discountAmount();
        return Math.round((sub - disc) * 100) / 100;
      },
    }),
    { name: "luminus-pos-cart" }
  )
);
