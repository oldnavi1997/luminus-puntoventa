"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Receipt } from "./Receipt";
import type { ClaseImpresion, RepresentacionImpresa } from "@/lib/impresion/tipos";

/**
 * Trae del servidor lo que hace falta para imprimir y se lo da al ticket.
 *
 * Existe para que los tres sitios que imprimen dejen de ensamblar las props a
 * mano. Cada uno lo hacía distinto: el POS no pasaba la fecha —así que reimprimir
 * ponía la de hoy—, Ventas recalculaba el unitario dividiendo, y el cobro de
 * saldo fabricaba un recibo con el total de la venta en vez del saldo.
 *
 * `rep` se puede pasar ya hecho: `POST /api/ventas` lo devuelve con la venta, y
 * así imprimir justo después de cobrar no espera a ninguna petición, que es el
 * momento en que el cajero tiene a alguien delante.
 */
export function ReceiptModal({
  documentId,
  clase,
  recibido,
  rep: repInicial,
  onClose,
}: {
  documentId: string;
  clase?: ClaseImpresion;
  recibido?: number;
  rep?: RepresentacionImpresa | null;
  onClose: () => void;
}) {
  const [rep, setRep] = useState<RepresentacionImpresa | null>(repInicial ?? null);
  const [error, setError] = useState("");

  const traer = useCallback(async () => {
    const params = new URLSearchParams();
    if (clase) params.set("clase", clase);
    if (recibido != null) params.set("recibido", String(recibido));

    const res = await fetch(`/api/ventas/${documentId}/impresion?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "No se pudo preparar el ticket");
      return;
    }
    setRep(json);
  }, [documentId, clase, recibido]);

  useEffect(() => {
    if (repInicial) return;
    void traer();
  }, [repInicial, traer]);

  if (rep) return <Receipt rep={rep} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-ink text-sm">Ticket</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {error ? (
          <p className="text-[13px] text-danger">{error}</p>
        ) : (
          <p className="text-[13px] text-ink-3">Preparando el ticket…</p>
        )}
      </div>
    </div>
  );
}
