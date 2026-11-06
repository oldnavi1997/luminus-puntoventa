"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Banknote, CreditCard, Smartphone, CheckCircle, AlertCircle, Clock, Printer, Send, FileText, Layers, Tag } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { formatPEN } from "@/lib/utils";
import type { PosCustomer, StockSource } from "@/types";
import { ReceiptModal } from "./ReceiptModal";
import { EnvioModal } from "@/components/envio/EnvioModal";
import type { RepresentacionImpresa } from "@/lib/impresion/tipos";

interface PaymentModalProps {
  posSessionId: string;
  cashierId: string;
  total: number;
  customer: PosCustomer | null;
  discount: number;
  docType: "BOLETA" | "FACTURA" | "NOTA_VENTA";
  stockSource?: StockSource;
  onClose: () => void;
}

type PaymentMethod = "EFECTIVO" | "TARJETA" | "YAPE" | "MIXTO";
type Step = "method" | "efectivo" | "card" | "yape" | "mixto" | "success" | "error";

interface SaleResult {
  id: string;
  fullNumber: string;
  total: number;
  cambio: number;
  montoAdelanto?: number | null;
  status: string;
  /** Ya armada por el servidor; el ticket la pinta sin volver a pedir nada. */
  impresion?: RepresentacionImpresa | null;
  /** Estuche/líquido que se descontó sin stock. La venta pasó igual. */
  avisosAccesorios?: string[];
}

const PAYMENT_METHODS = [
  { id: "EFECTIVO" as PaymentMethod, label: "Efectivo",     icon: Banknote,   step: "efectivo" as Step },
  { id: "TARJETA"  as PaymentMethod, label: "Tarjeta",      icon: CreditCard, step: "card"     as Step },
  { id: "YAPE"     as PaymentMethod, label: "Yape",         icon: Smartphone, step: "yape"     as Step },
  { id: "MIXTO"    as PaymentMethod, label: "Pago mixto",   icon: Layers,     step: "mixto"    as Step },
];

export function PaymentModal({ posSessionId, cashierId, total, customer, discount, docType, stockSource = "TIENDA", onClose }: PaymentModalProps) {
  const { data: session } = useSession();
  // Etiquetas de envío: sólo administradores (igual que en el Historial de ventas).
  const isAdmin = session?.user.role === "ADMIN";
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [efectivoAmount, setEfectivoAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [showEnvio, setShowEnvio] = useState(false);
  const [saleItems, setSaleItems] = useState<ReturnType<typeof useCartStore.getState>["items"]>([]);
  const [saleCustomer, setSaleCustomer] = useState<PosCustomer | null>(null);
  const [esAdelanto, setEsAdelanto] = useState(false);
  const [adelantoAmount, setAdelantoAmount] = useState("");

  // Split payment state
  const [splitEfectivo, setSplitEfectivo] = useState("");
  const [splitTarjeta,  setSplitTarjeta]  = useState("");
  const [splitYape,     setSplitYape]     = useState("");

  // La serie sale de la base, no del código: cuando SUNAT deja inservible una
  // serie se cambia la fila y la pantalla debe seguirla, no anunciar la vieja.
  const [serie, setSerie] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    fetch("/api/comprobantes/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (vigente && s) setSerie(s[docType] ?? null); })
      .catch(() => {}); // Es sólo la etiqueta: si falla, no se muestra y ya.
    return () => { vigente = false; };
  }, [docType]);

  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const adelantoVal = parseFloat(adelantoAmount) || 0;
  const saldoPendiente = Math.max(0, total - adelantoVal);

  const cambio = method === "EFECTIVO" && efectivoAmount && !esAdelanto
    ? Math.max(0, parseFloat(efectivoAmount) - total)
    : 0;

  const nextRound = Math.ceil(total / 10) * 10;
  const quickAmounts = [total, nextRound, nextRound + 10, nextRound + 20];

  const isNotaVenta = docType === "NOTA_VENTA";

  // Split validation
  const splitTarget = esAdelanto ? adelantoVal : total;
  const splitEfectivoVal = parseFloat(splitEfectivo) || 0;
  const splitTarjetaVal  = parseFloat(splitTarjeta)  || 0;
  const splitYapeVal     = parseFloat(splitYape)     || 0;
  const splitSum         = Math.round((splitEfectivoVal + splitTarjetaVal + splitYapeVal) * 100) / 100;
  const splitDiff        = Math.round((splitTarget - splitSum) * 100) / 100;
  const splitValid       = splitSum === splitTarget && (
    [splitEfectivoVal > 0, splitTarjetaVal > 0, splitYapeVal > 0].filter(Boolean).length >= 2
  );

  function resetSplit() {
    setSplitEfectivo(""); setSplitTarjeta(""); setSplitYape("");
  }

  async function processSale() {
    setLoading(true);
    setErrorMsg("");
    try {
      const isMixto = method === "MIXTO";
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posSessionId,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            unitPrice: item.editedPrice,
            lensType: item.lensType,
            lensSubType: item.lensSubType,
            lensVariant: item.lensVariant,
            lensPrice: item.lensPrice,
            lensPriceRange: item.lensPriceRange,
          })),
          paymentMethod: method,
          ...(isMixto && {
            paymentSplit: {
              efectivo: splitEfectivoVal,
              tarjeta:  splitTarjetaVal,
              yape:     splitYapeVal,
            },
          }),
          montoRecibido: method === "EFECTIVO" && !esAdelanto ? parseFloat(efectivoAmount) : undefined,
          esAdelanto: esAdelanto && isNotaVenta,
          montoAdelanto: esAdelanto && isNotaVenta ? adelantoVal : undefined,
          discount,
          docType,
          stockSource,
          buyer: customer
            ? {
                docType: customer.docType,
                docNumber: customer.docNumber,
                name: customer.name,
                address: customer.address,
                email: customer.email,
                customerId: customer.id,
              }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error desconocido");
      setSaleItems([...items]);
      setSaleCustomer(customer);
      setSaleResult({ ...json, cambio });
      setStep("success");
      clearCart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al procesar");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  const stepTitle: Record<Step, string> = {
    method:  `Cobrar · ${docType === "FACTURA" ? "Factura" : docType === "NOTA_VENTA" ? "Nota de Venta" : "Boleta"}`,
    efectivo: "Pago en efectivo",
    card:    "Pago con tarjeta",
    yape:    "Pago con Yape",
    mixto:   "Pago mixto",
    success: isNotaVenta ? "Venta registrada" : "Comprobante emitido",
    error:   "Error en la venta",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-border animate-scale-in">
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-[16px]">{stepTitle[step]}</h2>
          {step === "method" && serie && (
            <span className="ml-3 text-[11px] px-2 py-0.5 rounded-full bg-surface-light text-ink-3 border border-border font-mono">
              {serie}
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {/* Step: method */}
          {step === "method" && (
            <div className="space-y-3">
              <p className="text-center text-[26px] font-bold font-mono text-ink mb-5">{formatPEN(total)}</p>

              {customer && (
                <div className="bg-surface-light border border-border rounded-xl px-3 py-2 text-[12px] text-ink-3 mb-2">
                  <span className="font-medium text-ink">{customer.name}</span>
                  {" · "}{customer.docType} {customer.docNumber}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(({ id, label, icon: Icon, step: s }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setMethod(id);
                      setEsAdelanto(false);
                      setAdelantoAmount("");
                      resetSplit();
                      setStep(s);
                    }}
                    className="flex flex-col items-center gap-2 bg-surface-light hover:bg-border rounded-xl px-4 py-4 text-ink transition-colors border border-border"
                  >
                    <Icon size={22} className={id === "MIXTO" ? "text-ink-3" : "text-accent"} />
                    <span className="text-[12.5px] font-medium">{label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-1 text-[12.5px]">
                <div className="flex justify-between text-ink-3">
                  <span>IGV incluido</span>
                  <span className="font-mono">{formatPEN(total - total / 1.18)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step: efectivo */}
          {step === "efectivo" && (
            <div className="space-y-4">
              <div className="bg-surface-light rounded-xl p-4 text-center">
                <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1">Total a cobrar</p>
                <p className="text-[28px] font-bold font-mono text-ink">{formatPEN(total)}</p>
              </div>

              {isNotaVenta && (
                <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-light border border-border rounded-xl px-4 py-3">
                  <div
                    onClick={() => { setEsAdelanto(!esAdelanto); setAdelantoAmount(""); setEfectivoAmount(""); }}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${esAdelanto ? "bg-accent" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${esAdelanto ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-ink">Registrar con adelanto</p>
                    <p className="text-[11px] text-ink-4">El cliente paga parte ahora y el saldo al recoger</p>
                  </div>
                </label>
              )}

              {esAdelanto ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-2">Monto del adelanto</p>
                    <input
                      type="number" value={adelantoAmount} onChange={(e) => setAdelantoAmount(e.target.value)}
                      placeholder="0.00" min="0.01" max={(total - 0.01).toFixed(2)} step="0.10" autoFocus
                      className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-[20px] font-bold text-ink focus:outline-none focus:border-accent text-center font-mono"
                    />
                  </div>
                  {adelantoVal > 0 && adelantoVal < total && (
                    <div className="bg-warning-soft border border-warning/20 rounded-xl px-4 py-3 flex justify-between text-[13px]">
                      <span className="text-ink-3 font-medium">Saldo pendiente</span>
                      <span className="font-bold text-warning font-mono">{formatPEN(saldoPendiente)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-2">Monto recibido</p>
                  <input
                    type="number" value={efectivoAmount} onChange={(e) => setEfectivoAmount(e.target.value)}
                    placeholder="0.00" min={total} step="0.10" autoFocus
                    className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-[20px] font-bold text-ink focus:outline-none focus:border-accent text-center font-mono"
                  />
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {quickAmounts.map((a, i) => (
                      <button key={i} onClick={() => setEfectivoAmount(a.toFixed(2))}
                        className="py-2 bg-surface-light hover:bg-border rounded-lg text-[12px] font-semibold font-mono transition-colors border border-border">
                        S/{Math.round(a)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!esAdelanto && efectivoAmount && parseFloat(efectivoAmount) >= total && (
                <div className="bg-success-soft border border-success/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-[11px] text-ink-3 font-medium uppercase tracking-wide">Vuelto</p>
                  <p className="text-[22px] font-bold text-success font-mono">{formatPEN(cambio)}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep("method")} className="flex-1 bg-surface-light hover:bg-border rounded-xl py-3 text-[13px] text-ink transition-colors border border-border">Atrás</button>
                <button
                  onClick={processSale}
                  disabled={loading || (esAdelanto ? (adelantoVal <= 0 || adelantoVal >= total) : (!efectivoAmount || parseFloat(efectivoAmount) < total))}
                  className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : esAdelanto ? <><Clock size={14} /> Registrar con adelanto</>
                    : isNotaVenta ? <><FileText size={14} /> Registrar venta</>
                    : <><Send size={14} /> Emitir a SUNAT</>}
                </button>
              </div>
            </div>
          )}

          {/* Step: card / yape */}
          {(step === "card" || step === "yape") && (
            <div className="space-y-4">
              <div className="bg-surface-light rounded-xl p-4 text-center">
                <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1">Total a cobrar</p>
                <p className="text-[28px] font-bold font-mono text-ink">{formatPEN(total)}</p>
              </div>

              {isNotaVenta && (
                <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-light border border-border rounded-xl px-4 py-3">
                  <div
                    onClick={() => { setEsAdelanto(!esAdelanto); setAdelantoAmount(""); }}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${esAdelanto ? "bg-accent" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${esAdelanto ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-ink">Registrar con adelanto</p>
                    <p className="text-[11px] text-ink-4">El cliente paga parte ahora y el saldo al recoger</p>
                  </div>
                </label>
              )}

              {esAdelanto ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-2">Monto del adelanto</p>
                    <input
                      type="number" value={adelantoAmount} onChange={(e) => setAdelantoAmount(e.target.value)}
                      placeholder="0.00" min="0.01" max={(total - 0.01).toFixed(2)} step="0.10" autoFocus
                      className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-[20px] font-bold text-ink focus:outline-none focus:border-accent text-center font-mono"
                    />
                  </div>
                  {adelantoVal > 0 && adelantoVal < total && (
                    <div className="bg-warning-soft border border-warning/20 rounded-xl px-4 py-3 flex justify-between text-[13px]">
                      <span className="text-ink-3 font-medium">Saldo pendiente</span>
                      <span className="font-bold text-warning font-mono">{formatPEN(saldoPendiente)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-surface rounded-xl p-5 text-center border border-border space-y-3">
                  {step === "card" ? (
                    <><CreditCard size={32} className="mx-auto text-ink-3" /><p className="text-[13px] text-ink font-medium">Procesa el pago en el terminal POS</p><p className="text-[12px] text-ink-3">Confirma cuando esté aprobado</p></>
                  ) : (
                    <><Smartphone size={32} className="mx-auto text-ink-3" /><p className="text-[13px] text-ink font-medium">Confirma la transferencia Yape</p><p className="text-[16px] font-bold text-accent font-mono">{formatPEN(total)}</p></>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep("method")} className="flex-1 bg-surface-light hover:bg-border rounded-xl py-3 text-[13px] text-ink transition-colors border border-border">Atrás</button>
                <button
                  onClick={processSale}
                  disabled={loading || (esAdelanto && (adelantoVal <= 0 || adelantoVal >= total))}
                  className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : esAdelanto ? <><Clock size={14} /> Registrar con adelanto</>
                    : isNotaVenta ? <><FileText size={14} /> Confirmar cobro</>
                    : <><Send size={14} /> Confirmar y emitir</>}
                </button>
              </div>
            </div>
          )}

          {/* Step: mixto */}
          {step === "mixto" && (
            <div className="space-y-4">
              <div className="bg-surface-light rounded-xl p-4 text-center">
                <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-1">Total a cobrar</p>
                <p className="text-[28px] font-bold font-mono text-ink">{formatPEN(total)}</p>
              </div>

              {/* Adelanto toggle — solo Nota de Venta */}
              {isNotaVenta && (
                <label className="flex items-center gap-3 cursor-pointer select-none bg-surface-light border border-border rounded-xl px-4 py-3">
                  <div
                    onClick={() => { setEsAdelanto(!esAdelanto); setAdelantoAmount(""); resetSplit(); }}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${esAdelanto ? "bg-accent" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${esAdelanto ? "translate-x-5" : ""}`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-ink">Registrar con adelanto</p>
                    <p className="text-[11px] text-ink-4">El cliente paga parte ahora y el saldo al recoger</p>
                  </div>
                </label>
              )}

              {/* Monto adelanto si activo */}
              {esAdelanto && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-2">Monto total del adelanto</p>
                  <input
                    type="number" value={adelantoAmount} onChange={(e) => { setAdelantoAmount(e.target.value); resetSplit(); }}
                    placeholder="0.00" min="0.01" max={(total - 0.01).toFixed(2)} step="0.10"
                    className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-[18px] font-bold text-ink focus:outline-none focus:border-accent text-center font-mono"
                  />
                </div>
              )}

              {/* Inputs de split */}
              {(!esAdelanto || adelantoVal > 0) && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium">
                    Distribuir {esAdelanto ? `adelanto de ${formatPEN(adelantoVal)}` : formatPEN(total)}
                  </p>
                  {[
                    { label: "Efectivo",  icon: Banknote,   val: splitEfectivo, set: setSplitEfectivo },
                    { label: "Tarjeta",   icon: CreditCard, val: splitTarjeta,  set: setSplitTarjeta  },
                    { label: "Yape",      icon: Smartphone, val: splitYape,     set: setSplitYape     },
                  ].map(({ label, icon: Icon, val, set }) => (
                    <div key={label} className="flex items-center gap-3 bg-surface-light border border-border rounded-xl px-3 py-2">
                      <Icon size={16} className="text-ink-3 shrink-0" />
                      <span className="text-[12.5px] font-medium text-ink w-16">{label}</span>
                      <input
                        type="number" value={val} onChange={(e) => set(e.target.value)}
                        placeholder="0.00" min="0" step="0.10"
                        className="flex-1 bg-transparent text-right text-[15px] font-bold font-mono text-ink focus:outline-none"
                      />
                      <span className="text-[12px] text-ink-4">S/</span>
                    </div>
                  ))}

                  {/* Diferencia */}
                  <div className={`flex justify-between text-[12.5px] px-1 ${Math.abs(splitDiff) < 0.01 ? "text-success" : "text-warning"}`}>
                    <span>{Math.abs(splitDiff) < 0.01 ? "✓ Monto completo" : splitDiff > 0 ? "Falta distribuir" : "Excede el monto"}</span>
                    {Math.abs(splitDiff) >= 0.01 && <span className="font-mono font-bold">{formatPEN(Math.abs(splitDiff))}</span>}
                  </div>
                </div>
              )}

              {esAdelanto && adelantoVal > 0 && adelantoVal < total && (
                <div className="bg-warning-soft border border-warning/20 rounded-xl px-4 py-3 flex justify-between text-[13px]">
                  <span className="text-ink-3 font-medium">Saldo pendiente</span>
                  <span className="font-bold text-warning font-mono">{formatPEN(saldoPendiente)}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep("method")} className="flex-1 bg-surface-light hover:bg-border rounded-xl py-3 text-[13px] text-ink transition-colors border border-border">Atrás</button>
                <button
                  onClick={processSale}
                  disabled={loading || !splitValid || (esAdelanto && (adelantoVal <= 0 || adelantoVal >= total))}
                  className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : esAdelanto ? <><Clock size={14} /> Registrar con adelanto</>
                    : isNotaVenta ? <><FileText size={14} /> Registrar venta</>
                    : <><Send size={14} /> Confirmar y emitir</>}
                </button>
              </div>
            </div>
          )}

          {/* Step: success */}
          {step === "success" && saleResult && (
            <div className="space-y-4 text-center">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${saleResult.status === "ACCEPTED" ? "bg-success-soft" : "bg-warning-soft"}`}>
                {saleResult.status === "ACCEPTED" ? <CheckCircle size={30} className="text-success" /> : <Clock size={30} className="text-warning" />}
              </div>

              <div>
                <p className="font-bold text-ink text-[18px] font-mono">{saleResult.fullNumber}</p>
                <p className="text-ink-3 text-[13px] mt-1">
                  {saleResult.status === "PARTIAL" ? "Adelanto registrado · saldo pendiente"
                    : isNotaVenta ? "Nota de venta registrada"
                    : saleResult.status === "ACCEPTED" ? "Aceptado por SUNAT" : "Pendiente de envío a SUNAT"}
                </p>
              </div>

              <div className="bg-surface-light rounded-xl p-4 text-left space-y-2 border border-border">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-3">Total</span>
                  <span className="font-bold text-ink font-mono">{formatPEN(saleResult.total)}</span>
                </div>
                {saleResult.status === "PARTIAL" && saleResult.montoAdelanto != null && (
                  <>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-ink-3">Adelanto cobrado</span>
                      <span className="font-bold text-accent font-mono">{formatPEN(saleResult.montoAdelanto)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-ink-3">Saldo pendiente</span>
                      <span className="font-bold text-warning font-mono">{formatPEN(saleResult.total - saleResult.montoAdelanto)}</span>
                    </div>
                  </>
                )}
                {method === "MIXTO" && (
                  <div className="pt-1 border-t border-border space-y-1">
                    {splitEfectivoVal > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Efectivo</span><span className="font-mono">{formatPEN(splitEfectivoVal)}</span></div>}
                    {splitTarjetaVal  > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Tarjeta</span><span className="font-mono">{formatPEN(splitTarjetaVal)}</span></div>}
                    {splitYapeVal     > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Yape</span><span className="font-mono">{formatPEN(splitYapeVal)}</span></div>}
                  </div>
                )}
                {saleResult.status !== "PARTIAL" && method === "EFECTIVO" && saleResult.cambio > 0 && (
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink-3">Vuelto</span>
                    <span className="font-bold text-success font-mono">{formatPEN(saleResult.cambio)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-3">Cliente</span>
                  <span className="text-ink">{saleCustomer?.name ?? "Consumidor final"}</span>
                </div>
              </div>

              {saleResult.avisosAccesorios && saleResult.avisosAccesorios.length > 0 && (
                <div className="bg-warning-soft border border-warning/20 rounded-xl px-4 py-3 text-left space-y-1">
                  {saleResult.avisosAccesorios.map((aviso) => (
                    <p key={aviso} className="flex items-start gap-1.5 text-[12px] text-warning">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" /> {aviso}
                    </p>
                  ))}
                </div>
              )}

              <div className={`grid ${isAdmin ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
                <button onClick={() => setShowReceipt(true)} className="flex items-center justify-center gap-1.5 bg-surface-light hover:bg-border rounded-xl py-2.5 text-[13px] text-ink transition-colors border border-border">
                  <Printer size={14} /> Ticket
                </button>
                {isAdmin && (
                  <button onClick={() => setShowEnvio(true)} className="flex items-center justify-center gap-1.5 bg-surface-light hover:bg-border rounded-xl py-2.5 text-[13px] text-ink transition-colors border border-border">
                    <Tag size={14} /> Envío
                  </button>
                )}
                <a
                  href={`/api/ventas/${saleResult.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 bg-surface-light hover:bg-border rounded-xl py-2.5 text-[13px] text-ink transition-colors border border-border"
                >
                  <FileText size={14} /> PDF
                </a>
              </div>
              <button onClick={onClose} className="w-full bg-ink hover:bg-ink-2 rounded-xl py-3 text-[14px] font-semibold text-white transition-colors">
                Nueva venta
              </button>
            </div>
          )}

          {/* Step: error */}
          {step === "error" && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto bg-danger-soft rounded-full flex items-center justify-center">
                <AlertCircle size={30} className="text-danger" />
              </div>
              <p className="text-[13px] text-ink-3">{errorMsg}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(method === "EFECTIVO" ? "efectivo" : method === "TARJETA" ? "card" : method === "YAPE" ? "yape" : "mixto")}
                  className="flex-1 bg-surface-light hover:bg-border rounded-xl py-3 text-[13px] text-ink transition-colors border border-border"
                >
                  Reintentar
                </button>
                <button onClick={onClose} className="flex-1 bg-danger-soft hover:bg-danger/20 rounded-xl py-3 text-[13px] text-danger transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showReceipt && saleResult && (
        // `impresion` viene con la respuesta de la venta, así que imprimir
        // justo después de cobrar no espera a ninguna petición.
        <ReceiptModal
          documentId={saleResult.id}
          rep={saleResult.impresion ?? null}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {showEnvio && saleResult && (
        <EnvioModal
          documentId={saleResult.id}
          fullNumber={saleResult.fullNumber}
          onClose={() => setShowEnvio(false)}
        />
      )}
    </div>
  );
}
