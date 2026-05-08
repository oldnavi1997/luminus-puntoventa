"use client";

import { useState, useCallback, useEffect } from "react";
import { X, ArrowLeft, ChevronRight } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { LENS_TREE, type Level1Option, type SubType, type SubVariant } from "@/lib/lens-tree";
import { calcularDesglose } from "@/lib/lens-calc";
import { formatPEN } from "@/lib/utils";
import type { ProductForPOS, PrescriptionData } from "@/types";

interface LensSelectorProps {
  product: ProductForPOS;
  onClose: () => void;
}

type Step = "level1" | "level2" | "level3" | "form";

const EMPTY_RX: PrescriptionData = {
  od: { sphere: "", cylinder: "", axis: "" },
  oi: { sphere: "", cylinder: "", axis: "" },
  add: "", pd: "",
};

const SPHERE_OPTS = (() => {
  const opts: string[] = [];
  for (let v = -600; v <= 500; v += 25) {
    const n = v / 100;
    opts.push(n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  }
  return opts;
})();

const CYLINDER_OPTS = (() => {
  const opts: string[] = [];
  for (let v = 0; v >= -600; v -= 25) {
    opts.push((v / 100).toFixed(2));
  }
  return opts;
})();

const AXIS_OPTS = Array.from({ length: 180 }, (_, i) => String(i + 1));

function resolvePricing(lt: string, st: string | null, va: string | null) {
  const l1 = LENS_TREE.find((o) => o.id === lt);
  if (!l1 || lt === "solo_montura") return { lensPrice: 0 };
  if (!st) return { lensPrice: 0 };
  const stObj = l1.subTypes?.find((s) => s.id === st);
  if (!stObj) return { lensPrice: 0 };
  if (!va || !stObj.variants) {
    if (stObj.price !== undefined) return { lensPrice: stObj.price };
    if (stObj.priceRange) return { lensPrice: 0, lensPriceRange: stObj.priceRange };
    return { lensPrice: 0 };
  }
  const vObj = stObj.variants.find((v) => v.id === va);
  if (!vObj) return { lensPrice: 0 };
  if (vObj.price !== undefined) return { lensPrice: vObj.price };
  if (vObj.priceRange) return { lensPrice: 0, lensPriceRange: vObj.priceRange };
  return { lensPrice: 0 };
}

function isPrescriptionFilled(rx: PrescriptionData) {
  return rx.od.sphere !== "" || rx.oi.sphere !== "";
}

export function LensSelector({ product, onClose }: LensSelectorProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [step, setStep] = useState<Step>("level1");
  const [lensType, setLensType] = useState<string | null>(null);
  const [subType, setSubType] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [rx, setRx] = useState<PrescriptionData>(EMPTY_RX);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const reset = useCallback(() => {
    setStep("level1");
    setLensType(null);
    setSubType(null);
    setVariant(null);
    setRx(EMPTY_RX);
  }, []);

  function doAddToCart(lt: string, st: string | null, va: string | null, prescription?: PrescriptionData) {
    let { lensPrice, lensPriceRange } = resolvePricing(lt, st, va);

    if (lensPrice === 0 && lensPriceRange && prescription && isPrescriptionFilled(prescription)) {
      const d = calcularDesglose(
        prescription.od.sphere, prescription.od.cylinder,
        prescription.oi.sphere, prescription.oi.cylinder
      );
      if (d.hasValues && d.total > 0) {
        lensPrice = d.total;
        lensPriceRange = undefined;
      }
    }

    const cartKey = `${product.id}_${lt}_${st ?? ""}_${va ?? ""}`;
    addItem({
      id: product.id,
      cartKey,
      name: product.name,
      sku: product.sku,
      price: product.price,
      imageUrl: product.images[0],
      quantity: 1,
      stock: product.stock,
      slug: product.slug,
      lensType: lt as "sin_medida" | "con_medida" | "solo_montura",
      lensSubType: st ?? undefined,
      lensVariant: va ?? undefined,
      lensPrice: lensPrice > 0 ? lensPrice : undefined,
      lensPriceRange,
      prescription,
    });

    reset();
    onClose();
  }

  const currentL1 = LENS_TREE.find((o) => o.id === lensType);
  const currentST = currentL1?.subTypes?.find((s) => s.id === subType);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-primary border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl animate-scale-in flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          {step !== "level1" && (
            <button onClick={() => {
              if (step === "form" || step === "level3") setStep("level2");
              else if (step === "level2") setStep("level1");
            }} className="text-text-muted hover:text-text">
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-text line-clamp-1">{product.name}</p>
            <p className="text-[10px] text-text-muted">{formatPEN(product.price)}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">

          {/* Level 1 */}
          {step === "level1" && LENS_TREE.map((opt) => (
            <L1Button key={opt.id} opt={opt} onClick={() => {
              setLensType(opt.id);
              if (opt.id === "solo_montura") {
                doAddToCart("solo_montura", null, null);
              } else if (opt.subTypes && opt.subTypes.length > 0) {
                setStep("level2");
              } else {
                doAddToCart(opt.id, null, null);
              }
            }} />
          ))}

          {/* Level 2 */}
          {step === "level2" && currentL1?.subTypes?.map((st) => (
            <L2Button key={st.id} st={st} onClick={() => {
              setSubType(st.id);
              if (st.variants && st.variants.length > 0) {
                setStep("level3");
              } else if (st.action === "form") {
                setStep("form");
              } else {
                doAddToCart(lensType!, st.id, null);
              }
            }} />
          ))}

          {/* Level 3 */}
          {step === "level3" && currentST?.variants?.map((va) => (
            <L3Button key={va.id} va={va} onClick={() => {
              setVariant(va.id);
              if (va.action === "form") {
                setStep("form");
              } else {
                doAddToCart(lensType!, subType, va.id);
              }
            }} />
          ))}

          {/* Prescription form */}
          {step === "form" && (
            <PrescriptionForm
              rx={rx}
              onChange={setRx}
              onAdd={() => doAddToCart(lensType!, subType, variant, rx)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function L1Button({ opt, onClick }: { opt: Level1Option; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-surface hover:bg-surface-light rounded-xl px-4 py-3.5 flex items-center gap-3 text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-sm">{opt.label}</p>
        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{opt.description}</p>
      </div>
      {opt.id !== "solo_montura" && <ChevronRight size={15} className="text-text-muted shrink-0" />}
    </button>
  );
}

function L2Button({ st, onClick }: { st: SubType; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-surface hover:bg-surface-light rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-sm">{st.label}</p>
        {st.priceRange && (
          <p className="text-[11px] text-accent mt-0.5">{st.priceRange}</p>
        )}
        {st.price !== undefined && (
          <p className="text-[11px] text-accent mt-0.5">{formatPEN(st.price)}</p>
        )}
        {Array.isArray(st.description) ? (
          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{st.description[0]}</p>
        ) : (
          st.description && <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{st.description}</p>
        )}
      </div>
      <ChevronRight size={15} className="text-text-muted shrink-0 mt-0.5" />
    </button>
  );
}

function L3Button({ va, onClick }: { va: SubVariant; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-surface hover:bg-surface-light rounded-xl px-4 py-3.5 flex items-start gap-3 text-left transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-sm">{va.label}</p>
        {va.price !== undefined && (
          <p className="text-[11px] text-accent mt-0.5">{formatPEN(va.price)}</p>
        )}
        {va.priceRange && (
          <p className="text-[11px] text-accent mt-0.5">{va.priceRange}</p>
        )}
        {va.note && <p className="text-[10px] text-warning mt-0.5">{va.note}</p>}
      </div>
      <ChevronRight size={15} className="text-text-muted shrink-0 mt-0.5" />
    </button>
  );
}

function PrescriptionForm({
  rx,
  onChange,
  onAdd,
}: {
  rx: PrescriptionData;
  onChange: (rx: PrescriptionData) => void;
  onAdd: () => void;
}) {
  const sel = "w-full bg-primary-light border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent";

  function setOD(field: keyof PrescriptionData["od"], val: string) {
    onChange({ ...rx, od: { ...rx.od, [field]: val } });
  }
  function setOI(field: keyof PrescriptionData["oi"], val: string) {
    onChange({ ...rx, oi: { ...rx.oi, [field]: val } });
  }

  const desglose = calcularDesglose(
    rx.od.sphere, rx.od.cylinder,
    rx.oi.sphere, rx.oi.cylinder
  );

  return (
    <div className="space-y-4">
      {/* OD */}
      <div>
        <p className="text-xs font-semibold text-text mb-2">OD — Ojo Derecho</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-text-muted">Esfera</label>
            <select value={rx.od.sphere} onChange={(e) => setOD("sphere", e.target.value)} className={sel}>
              <option value="">—</option>
              {SPHERE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted">Cilindro</label>
            <select value={rx.od.cylinder} onChange={(e) => setOD("cylinder", e.target.value)} className={sel}>
              <option value="">—</option>
              {CYLINDER_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted">Eje</label>
            <select value={rx.od.axis} onChange={(e) => setOD("axis", e.target.value)} className={sel}>
              <option value="">—</option>
              {AXIS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* OI */}
      <div>
        <p className="text-xs font-semibold text-text mb-2">OI — Ojo Izquierdo</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-text-muted">Esfera</label>
            <select value={rx.oi.sphere} onChange={(e) => setOI("sphere", e.target.value)} className={sel}>
              <option value="">—</option>
              {SPHERE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted">Cilindro</label>
            <select value={rx.oi.cylinder} onChange={(e) => setOI("cylinder", e.target.value)} className={sel}>
              <option value="">—</option>
              {CYLINDER_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted">Eje</label>
            <select value={rx.oi.axis} onChange={(e) => setOI("axis", e.target.value)} className={sel}>
              <option value="">—</option>
              {AXIS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Price estimate */}
      {desglose.hasValues && desglose.total > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-3 py-2 text-xs text-accent">
          Precio lentes estimado: <strong>{formatPEN(desglose.total)}</strong>
        </div>
      )}

      <button
        onClick={onAdd}
        className="w-full bg-accent hover:bg-accent-dark rounded-xl py-3 text-sm font-semibold text-white transition-colors"
      >
        Agregar al carrito
      </button>
    </div>
  );
}
