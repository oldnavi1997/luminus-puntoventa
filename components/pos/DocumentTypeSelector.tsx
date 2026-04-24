"use client";

import { FileText, Building2 } from "lucide-react";
import type { PosCustomer } from "@/types";

interface DocumentTypeSelectorProps {
  docType: "BOLETA" | "FACTURA";
  onChange: (type: "BOLETA" | "FACTURA") => void;
  customer: PosCustomer | null;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function DocumentTypeSelector({
  docType,
  onChange,
  customer,
  loading,
  onBack,
  onConfirm,
}: DocumentTypeSelectorProps) {
  const isFactura = docType === "FACTURA";
  const hasRUC = customer?.docType === "RUC" && customer.docNumber?.length === 11;
  const canConfirm = docType === "BOLETA" || hasRUC;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted text-center">Selecciona el tipo de comprobante</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange("BOLETA")}
          className={`rounded-xl p-4 text-left transition-all border-2 ${
            docType === "BOLETA"
              ? "border-accent bg-accent/10"
              : "border-border bg-surface hover:bg-surface-light"
          }`}
        >
          <FileText size={20} className={docType === "BOLETA" ? "text-accent" : "text-text-muted"} />
          <p className="font-semibold text-text mt-2 text-sm">Boleta</p>
          <p className="text-[10px] text-text-muted mt-0.5">Consumidor final · DNI</p>
        </button>

        <button
          onClick={() => onChange("FACTURA")}
          className={`rounded-xl p-4 text-left transition-all border-2 ${
            docType === "FACTURA"
              ? "border-accent bg-accent/10"
              : "border-border bg-surface hover:bg-surface-light"
          }`}
        >
          <Building2 size={20} className={docType === "FACTURA" ? "text-accent" : "text-text-muted"} />
          <p className="font-semibold text-text mt-2 text-sm">Factura</p>
          <p className="text-[10px] text-text-muted mt-0.5">Empresa · RUC requerido</p>
        </button>
      </div>

      {/* Factura RUC warning */}
      {isFactura && !hasRUC && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
          <p className="text-xs text-warning">
            Para emitir factura necesitas seleccionar un cliente con RUC válido (11 dígitos).
            {!customer && " Busca el cliente por RUC en el carrito."}
          </p>
        </div>
      )}

      {/* Customer summary */}
      {customer && (
        <div className="bg-surface rounded-xl px-3 py-2 text-xs text-text-muted">
          <span className="font-medium text-text">{customer.name}</span>{" "}
          · {customer.docType} {customer.docNumber}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 bg-surface hover:bg-surface-light rounded-xl py-3 text-sm text-text transition-colors"
        >
          Atrás
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || !canConfirm}
          className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Confirmar venta"
          )}
        </button>
      </div>
    </div>
  );
}
