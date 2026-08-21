"use client";

import { useState } from "react";
import { Search, UserCheck, UserX, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import type { PosCustomer } from "@/types";

export function CustomerPanel() {
  const { customer, setCustomer } = useCartStore();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function lookupCustomer() {
    if (!search.trim()) return;
    setLoading(true);
    setNotFound(false);

    const res = await fetch(`/api/clientes?docNumber=${encodeURIComponent(search.trim())}`);
    const json = await res.json();
    setLoading(false);

    if (json.customer) {
      setCustomer(json.customer as PosCustomer);
      setSearch("");
    } else {
      setNotFound(true);
    }
  }

  if (customer) {
    return (
      <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-3 py-2">
        <UserCheck size={14} className="text-success shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text truncate">{customer.name}</p>
          <p className="text-[10px] text-text-muted">{customer.docType} {customer.docNumber}</p>
        </div>
        <button onClick={() => setCustomer(null)} className="text-text-muted hover:text-text">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
            placeholder="DNI / RUC del cliente"
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={lookupCustomer}
          disabled={loading}
          className="bg-surface hover:bg-surface-light border border-border rounded-lg px-3 py-2 text-xs text-text transition-colors"
        >
          {loading ? "..." : "Buscar"}
        </button>
      </div>

      {notFound && (
        <div className="flex items-center gap-1.5 text-[10px] text-warning">
          <UserX size={12} />
          <span>No encontrado — se emitirá como &laquo;Cliente Varios&raquo;</span>
        </div>
      )}
    </div>
  );
}
