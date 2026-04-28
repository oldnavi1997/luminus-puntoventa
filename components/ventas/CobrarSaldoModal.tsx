"use client";

import { useState } from "react";
import { X, Banknote, CreditCard, Smartphone, Layers, CheckCircle, AlertCircle } from "lucide-react";
import { formatPEN } from "@/lib/utils";

interface PendienteDoc {
  id: string;
  fullNumber: string;
  total: number;
  montoAdelanto: number;
  saldoPendiente: number;
  buyerName: string | null;
}

interface CobrarSaldoModalProps {
  doc: PendienteDoc;
  posSessionId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type PaymentMethod = "EFECTIVO" | "TARJETA" | "YAPE" | "MIXTO";
type Step = "method" | "efectivo" | "card" | "yape" | "mixto" | "success" | "error";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ElementType; step: Step }[] = [
  { id: "EFECTIVO", label: "Efectivo",  icon: Banknote,    step: "efectivo" },
  { id: "TARJETA",  label: "Tarjeta",   icon: CreditCard,  step: "card"     },
  { id: "YAPE",     label: "Yape",      icon: Smartphone,  step: "yape"     },
  { id: "MIXTO",    label: "Mixto",     icon: Layers,      step: "mixto"    },
];

export function CobrarSaldoModal({ doc, posSessionId, onSuccess, onClose }: CobrarSaldoModalProps) {
  const [step, setStep]       = useState<Step>("method");
  const [method, setMethod]   = useState<PaymentMethod>("EFECTIVO");
  const [efectivoAmount, setEfectivoAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [cambio, setCambio]   = useState(0);

  // Pago mixto
  const [splitEfectivo, setSplitEfectivo] = useState("");
  const [splitTarjeta,  setSplitTarjeta]  = useState("");
  const [splitYape,     setSplitYape]     = useState("");

  const saldo = doc.saldoPendiente;
  const nextRound = Math.ceil(saldo / 10) * 10;
  const quickAmounts = [saldo, nextRound, nextRound + 10, nextRound + 20];

  const cambioCalc = efectivoAmount ? Math.max(0, parseFloat(efectivoAmount) - saldo) : 0;

  // Validación mixto
  const splitEfVal = parseFloat(splitEfectivo) || 0;
  const splitTarVal = parseFloat(splitTarjeta) || 0;
  const splitYapeVal = parseFloat(splitYape) || 0;
  const splitSum  = Math.round((splitEfVal + splitTarVal + splitYapeVal) * 100) / 100;
  const splitDiff = Math.round((saldo - splitSum) * 100) / 100;
  const splitValid = Math.abs(splitDiff) < 0.01 &&
    [splitEfVal > 0, splitTarVal > 0, splitYapeVal > 0].filter(Boolean).length >= 2;

  function resetSplit() { setSplitEfectivo(""); setSplitTarjeta(""); setSplitYape(""); }

  async function processCobro() {
    setLoading(true);
    setErrorMsg("");
    try {
      const body: Record<string, unknown> = {
        paymentMethod: method,
        posSessionId,
      };

      if (method === "EFECTIVO") {
        body.montoRecibido = parseFloat(efectivoAmount);
      } else if (method === "MIXTO") {
        body.montoEfectivo = splitEfVal > 0 ? splitEfVal : undefined;
        body.montoTarjeta  = splitTarVal  > 0 ? splitTarVal  : undefined;
        body.montoYape     = splitYapeVal > 0 ? splitYapeVal : undefined;
      }

      const res = await fetch(`/api/ventas/${doc.id}/cobrar-saldo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error desconocido");
      setCambio(json.cambio ?? 0);
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al cobrar");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  const btnBack = (toStep: Step) => (
    <button
      onClick={() => { setStep(toStep); }}
      className="flex-1 bg-surface-light hover:bg-border rounded-xl py-3 text-[13px] text-ink transition-colors border border-border"
    >
      Atrás
    </button>
  );

  const btnConfirmar = (disabled: boolean) => (
    <button
      onClick={processCobro}
      disabled={disabled || loading}
      className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2"
    >
      {loading
        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : "Confirmar cobro"}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-border">
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-ink text-[16px]">Cobrar saldo</h2>
            <p className="text-[11px] text-ink-3 font-mono mt-0.5">{doc.fullNumber}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {/* Resumen */}
          <div className="bg-surface-light border border-border rounded-xl px-4 py-3 mb-4 space-y-1.5">
            <div className="flex justify-between text-[12.5px]">
              <span className="text-ink-3">Total venta</span>
              <span className="font-mono text-ink">{formatPEN(doc.total)}</span>
            </div>
            <div className="flex justify-between text-[12.5px]">
              <span className="text-ink-3">Adelanto pagado</span>
              <span className="font-mono text-accent">{formatPEN(doc.montoAdelanto)}</span>
            </div>
            <div className="flex justify-between text-[13.5px] font-bold border-t border-border pt-1.5 mt-0.5">
              <span className="text-ink">Saldo a cobrar</span>
              <span className="font-mono text-warning">{formatPEN(saldo)}</span>
            </div>
            {doc.buyerName && (
              <div className="flex justify-between text-[11.5px] text-ink-3 border-t border-border pt-1.5">
                <span>Cliente</span>
                <span>{doc.buyerName}</span>
              </div>
            )}
          </div>

          {/* Step: method */}
          {step === "method" && (
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon, step: s }) => (
                <button
                  key={id}
                  onClick={() => {
                    setMethod(id);
                    resetSplit();
                    setEfectivoAmount("");
                    setStep(s);
                  }}
                  className="flex flex-col items-center gap-2 bg-surface-light hover:bg-border rounded-xl px-4 py-4 text-ink transition-colors border border-border"
                >
                  <Icon size={22} className={id === "MIXTO" ? "text-ink-3" : "text-accent"} />
                  <span className="text-[12.5px] font-medium">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step: efectivo */}
          {step === "efectivo" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium mb-2">Monto recibido</p>
                <input
                  type="number"
                  value={efectivoAmount}
                  onChange={(e) => setEfectivoAmount(e.target.value)}
                  placeholder="0.00"
                  min={saldo}
                  step="0.10"
                  autoFocus
                  className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-[20px] font-bold text-ink focus:outline-none focus:border-accent text-center font-mono"
                />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {quickAmounts.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => setEfectivoAmount(a.toFixed(2))}
                      className="py-2 bg-surface-light hover:bg-border rounded-lg text-[12px] font-semibold font-mono transition-colors border border-border"
                    >
                      S/{Math.round(a)}
                    </button>
                  ))}
                </div>
              </div>

              {efectivoAmount && parseFloat(efectivoAmount) >= saldo && (
                <div className="bg-success-soft border border-success/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-[11px] text-ink-3 font-medium uppercase tracking-wide">Vuelto</p>
                  <p className="text-[22px] font-bold text-success font-mono">{formatPEN(cambioCalc)}</p>
                </div>
              )}

              <div className="flex gap-2">
                {btnBack("method")}
                {btnConfirmar(!efectivoAmount || parseFloat(efectivoAmount) < saldo)}
              </div>
            </div>
          )}

          {/* Step: card / yape */}
          {(step === "card" || step === "yape") && (
            <div className="space-y-4">
              <div className="bg-surface rounded-xl p-5 text-center border border-border space-y-3">
                {step === "card" ? (
                  <>
                    <CreditCard size={32} className="mx-auto text-ink-3" />
                    <p className="text-[13px] text-ink font-medium">Procesa el pago en el terminal POS</p>
                    <p className="text-[16px] font-bold text-accent font-mono">{formatPEN(saldo)}</p>
                  </>
                ) : (
                  <>
                    <Smartphone size={32} className="mx-auto text-ink-3" />
                    <p className="text-[13px] text-ink font-medium">Confirma la transferencia Yape</p>
                    <p className="text-[16px] font-bold text-accent font-mono">{formatPEN(saldo)}</p>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {btnBack("method")}
                {btnConfirmar(false)}
              </div>
            </div>
          )}

          {/* Step: mixto */}
          {step === "mixto" && (
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-3 font-medium">
                Distribuye el saldo de <span className="font-mono text-warning">{formatPEN(saldo)}</span>
              </p>

              {[
                { label: "Efectivo",  icon: Banknote,   value: splitEfectivo, set: setSplitEfectivo },
                { label: "Tarjeta",   icon: CreditCard, value: splitTarjeta,  set: setSplitTarjeta  },
                { label: "Yape",      icon: Smartphone, value: splitYape,     set: setSplitYape     },
              ].map(({ label, icon: Icon, value, set }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    <Icon size={14} className="text-ink-3" />
                    <span className="text-[12.5px] text-ink-3">{label}</span>
                  </div>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.10"
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-[14px] font-mono text-ink focus:outline-none focus:border-accent text-right"
                  />
                </div>
              ))}

              {/* Faltante / Exceso */}
              <div className={`flex justify-between text-[12.5px] px-1 ${Math.abs(splitDiff) < 0.01 ? "text-success" : "text-warning"}`}>
                <span>{splitDiff > 0.01 ? "Falta" : splitDiff < -0.01 ? "Excede" : "Suma correcta"}</span>
                <span className="font-mono font-semibold">
                  {Math.abs(splitDiff) < 0.01 ? "✓" : formatPEN(Math.abs(splitDiff))}
                </span>
              </div>

              <div className="flex gap-2">
                {btnBack("method")}
                {btnConfirmar(!splitValid)}
              </div>
            </div>
          )}

          {/* Step: success */}
          {step === "success" && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto bg-success-soft rounded-full flex items-center justify-center">
                <CheckCircle size={30} className="text-success" />
              </div>
              <div>
                <p className="font-bold text-ink text-[17px]">Saldo cobrado</p>
                <p className="text-ink-3 text-[13px] mt-1">{doc.fullNumber} · Venta completada</p>
              </div>
              <div className="bg-surface-light rounded-xl p-4 text-left space-y-2 border border-border">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-3">Saldo cobrado</span>
                  <span className="font-bold text-ink font-mono">{formatPEN(saldo)}</span>
                </div>
                {method === "EFECTIVO" && cambio > 0 && (
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink-3">Vuelto</span>
                    <span className="font-bold text-success font-mono">{formatPEN(cambio)}</span>
                  </div>
                )}
                {method === "MIXTO" && (
                  <>
                    {splitEfVal  > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Efectivo</span><span className="font-mono">{formatPEN(splitEfVal)}</span></div>}
                    {splitTarVal > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Tarjeta</span><span className="font-mono">{formatPEN(splitTarVal)}</span></div>}
                    {splitYapeVal > 0 && <div className="flex justify-between text-[12px] text-ink-3"><span>Yape</span><span className="font-mono">{formatPEN(splitYapeVal)}</span></div>}
                  </>
                )}
              </div>
              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="w-full bg-ink hover:bg-ink-2 rounded-xl py-3 text-[14px] font-semibold text-white transition-colors"
              >
                Listo
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
                  onClick={() => {
                    if (method === "EFECTIVO") setStep("efectivo");
                    else if (method === "TARJETA") setStep("card");
                    else if (method === "YAPE") setStep("yape");
                    else setStep("mixto");
                  }}
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
    </div>
  );
}
