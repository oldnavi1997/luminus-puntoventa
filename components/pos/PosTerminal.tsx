"use client";

import { useState } from "react";
import { ProductGrid } from "./ProductGrid";
import { CartPanel } from "./CartPanel";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import type { ProductForPOS, StockSource } from "@/types";

interface PosTerminalProps {
  posSessionId: string;
  cashierId: string;
  sessionOpenedAt?: string;
  isAdmin?: boolean;
}

export function PosTerminal({ posSessionId, cashierId, sessionOpenedAt, isAdmin = false }: PosTerminalProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductForPOS | null>(null);
  const [stockSource, setStockSource] = useState<StockSource>("TIENDA");

  const openedTime = sessionOpenedAt
    ? new Date(sessionOpenedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Punto de Venta"
        subtitle={openedTime ? `Turno abierto ${openedTime}` : "Turno activo"}
      />
      <div className="flex flex-1 overflow-hidden" style={{ gridTemplateColumns: "1fr 420px" }}>
        {/* Products */}
        <div className="flex-1 min-w-0 overflow-hidden border-r border-border">
          <ProductGrid onSelectProduct={setSelectedProduct} stockSource={stockSource} />
        </div>

        {/* Cart */}
        <div className="w-[420px] shrink-0 flex flex-col overflow-hidden bg-surface">
          <CartPanel
            posSessionId={posSessionId}
            cashierId={cashierId}
            selectedProduct={selectedProduct}
            onProductHandled={() => setSelectedProduct(null)}
            isAdmin={isAdmin}
            stockSource={stockSource}
            onStockSourceChange={setStockSource}
          />
        </div>
      </div>
    </div>
  );
}
