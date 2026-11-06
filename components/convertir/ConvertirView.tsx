"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowRightLeft, X, CheckCircle, Clock, Search, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { formatPEN } from "@/lib/utils";
import { esBusqueda, hoyEnLima } from "@/lib/busqueda-ventas";

interface NVDoc {
  id: string;
  fullNumber: string;
  buyerName: string | null;
  buyerDocNumber: string | null;
  total: number;
  createdAt: string;
}

// ─── ConvertModal ─────────────────────────────────────────────────────────────

function ConvertModal({ doc, onClose, onConverted }: {
  doc: NVDoc;
  onClose: () => void;
  onConverted: () => void;
}) {
  const router = useRouter();
  const [docType, setDocType]           = useState<"BOLETA" | "FACTURA">("BOLETA");
  const [buyerName, setBuyerName]       = useState(doc.buyerName ?? "");
  const [buyerDocType, setBuyerDocType] = useState("DNI");
  const [buyerDocNumber, setBuyerDocNumber] = useState(doc.buyerDocNumber && doc.buyerDocNumber !== "00000000" ? doc.buyerDocNumber : "");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [result, setResult]             = useState<{ fullNumber: string; status: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus]   = useState<"idle" | "found" | "not_found">("idle");

  async function lookupCustomer() {
    if (!buyerDocNumber.trim()) return;
    setLookupLoading(true);
    setLookupStatus("idle");
    try {
      const res  = await fetch(`/api/clientes?docNumber=${encodeURIComponent(buyerDocNumber.trim())}`);
      const json = await res.json();
      if (json.customer) {
        setBuyerName(json.customer.name);
        setBuyerDocType(json.customer.docType);
        setBuyerDocNumber(json.customer.docNumber);
        setLookupStatus("found");
      } else {
        setLookupStatus("not_found");
      }
    } catch {
      setLookupStatus("not_found");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleConvert() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ventas/${doc.id}/convertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          buyer: { docType: buyerDocType, docNumber: buyerDocNumber, name: buyerName },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al convertir");
      setResult({ fullNumber: json.fullNumber, status: json.status });
      onConverted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al convertir");
    } finally {
      setLoading(false);
    }
  }

  const canConvert =
    buyerName.trim().length > 0 &&
    buyerDocNumber.trim().length > 0 &&
    (docType === "BOLETA" || buyerDocNumber.length === 11);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-ink text-[15px]">Convertir a comprobante</h2>
            <p className="text-[11px] font-mono text-ink-3 mt-0.5">{doc.fullNumber} · {formatPEN(doc.total)}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center space-y-3 py-2">
              {result.status === "ACCEPTED" ? (
                <CheckCircle size={32} className="mx-auto text-success" />
              ) : (
                <Clock size={32} className="mx-auto text-warning" />
              )}
              <p className="text-[16px] font-bold font-mono text-ink">{result.fullNumber}</p>
              <p className="text-[13px] text-ink-3">
                {result.status === "ACCEPTED" ? "Aceptado por SUNAT" : "Pendiente de envío a SUNAT"}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink transition-colors hover:bg-border"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => router.push("/comprobantes")}
                  className="flex-1 bg-ink text-white rounded-xl py-2.5 text-[13px] font-medium hover:bg-ink-2 transition-colors"
                >
                  Ver comprobantes
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1 bg-surface-light p-0.5 rounded-lg">
                {(["BOLETA", "FACTURA"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`py-2 rounded-md text-[12.5px] font-medium transition-all ${
                      docType === t ? "bg-surface text-ink shadow-sm" : "text-ink-3"
                    }`}
                  >
                    {t === "BOLETA" ? "Boleta" : "Factura"}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={buyerDocType}
                    onChange={(e) => { setBuyerDocType(e.target.value); setLookupStatus("idle"); }}
                    className="bg-surface-light border border-border rounded-lg px-2 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                  >
                    <option value="DNI">DNI</option>
                    <option value="RUC">RUC</option>
                    <option value="CE">CE</option>
                  </select>
                  <div className="relative flex-1">
                    <input
                      value={buyerDocNumber}
                      onChange={(e) => { setBuyerDocNumber(e.target.value); setLookupStatus("idle"); }}
                      onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                      placeholder={docType === "FACTURA" ? "RUC (11 dígitos)" : "DNI / RUC"}
                      className="w-full bg-surface-light border border-border rounded-lg pl-3 pr-8 py-2 text-[13px] text-ink focus:outline-none focus:border-accent font-mono"
                    />
                    {lookupStatus === "found" && (
                      <UserCheck size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-success" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={lookupCustomer}
                    disabled={lookupLoading || !buyerDocNumber.trim()}
                    className="bg-surface-light hover:bg-border border border-border rounded-lg px-3 py-2 text-[13px] text-ink transition-colors disabled:opacity-40"
                  >
                    {lookupLoading ? "..." : <Search size={13} />}
                  </button>
                </div>

                {lookupStatus === "found" && (
                  <p className="text-[11px] text-success flex items-center gap-1">
                    <UserCheck size={11} /> Encontrado — datos autocompletados
                  </p>
                )}
                {lookupStatus === "not_found" && (
                  <p className="text-[11px] text-warning flex items-center gap-1">
                    <UserX size={11} /> No encontrado — ingresa el nombre manualmente
                  </p>
                )}

                <input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Nombre / Razón social"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                />

                {docType === "FACTURA" && buyerDocNumber.length > 0 && buyerDocNumber.length !== 11 && (
                  <p className="text-[11px] text-warning">El RUC debe tener 11 dígitos</p>
                )}
              </div>

              {error && <p className="text-[12px] text-danger">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink transition-colors hover:bg-border"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConvert}
                  disabled={!canConvert || loading}
                  className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
                >
                  {loading ? "Procesando..." : "Emitir a SUNAT"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ConvertirView ────────────────────────────────────────────────────────────

export function ConvertirView() {
  const [docs, setDocs]         = useState<NVDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [convertDoc, setConvertDoc] = useState<NVDoc | null>(null);
  const [date, setDate]         = useState(hoyEnLima);
  const [query, setQuery]       = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [limite, setLimite]     = useState<number | null>(null);

  // Mismo patrón inline que VentasView: el repo no tiene un hook de debounce.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const buscando = esBusqueda(debouncedQuery);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    // Buscar ignora la fecha: el servidor recorre todo el historial.
    if (buscando) params.set("q", debouncedQuery.trim());
    else params.set("date", date);
    try {
      const res  = await fetch(`/api/ventas/convertibles?${params}`);
      const json = await res.json();
      setDocs(json.docs ?? []);
      setLimite(json.limite ?? null);
    } finally {
      setLoading(false);
    }
  }, [buscando, debouncedQuery, date]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  function handleConverted() {
    fetchDocs();
  }

  const today = hoyEnLima();
  const plural = docs.length !== 1 ? "s" : "";

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Convertir Nota de Venta"
        subtitle="Notas de venta pendientes de emisión a SUNAT"
      />

      <div className="flex-1 overflow-auto p-6">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
              <div className="relative flex-1 min-w-56 max-w-80">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  className="w-full bg-surface-light border border-border rounded-lg pl-8 pr-8 py-2 text-[13px] text-ink placeholder-ink-4 focus:outline-none focus:border-accent"
                  placeholder="Buscar por cliente, DNI, celular, N° de nota, montura o SKU..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    title="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {buscando ? (
                <span className="text-[11.5px] text-ink-4">en todo el historial</span>
              ) : (
                <>
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                  />
                  {date !== today && (
                    <button
                      onClick={() => setDate(today)}
                      className="text-[12px] text-ink-3 hover:text-ink px-3 py-2 bg-surface-light border border-border rounded-lg transition-colors"
                    >
                      Hoy
                    </button>
                  )}
                </>
              )}
              <p className="text-[12.5px] text-ink-3 ml-auto">
                {loading
                  ? "Cargando..."
                  : limite !== null && docs.length >= limite
                    ? `Primeras ${docs.length} — afina la búsqueda`
                    : `${docs.length} nota${plural} pendiente${plural} de conversión`}
              </p>
            </div>

            {!loading && docs.length === 0 ? (
              <div className="p-12 text-center">
                <ArrowRightLeft size={32} className="mx-auto text-ink-4 mb-3 opacity-40" />
                <p className="text-[14px] font-medium text-ink mb-1">Sin notas pendientes</p>
                <p className="text-[13px] text-ink-3">
                  {buscando
                    ? `Ninguna nota sin convertir coincide con «${debouncedQuery.trim()}»`
                    : date === today
                      ? "No hay notas de venta de hoy por convertir."
                      : "No hay notas de venta de esa fecha por convertir."}
                </p>
              </div>
            ) : loading ? (
              <div className="p-8 text-center text-ink-3">Cargando notas de venta...</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-light">
                    {["Fecha", "Nota de Venta", "Cliente", "Doc.", "Total", ""].map((h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border ${i >= 4 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const date = new Date(doc.createdAt);
                    return (
                      <tr key={doc.id} className="hover:bg-surface-light transition-colors">
                        <td className="px-4 py-3 border-b border-border text-[12px] text-ink-3 font-mono whitespace-nowrap">
                          {date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          <span className="ml-2 text-ink-4">
                            {date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-border">
                          <span className="text-[13px] font-semibold font-mono text-ink">{doc.fullNumber}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-border text-[12.5px] text-ink max-w-[200px]">
                          <span className="truncate block">{doc.buyerName ?? "Consumidor final"}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-border text-[12px] text-ink-3 font-mono">
                          {doc.buyerDocNumber && doc.buyerDocNumber !== "00000000" ? doc.buyerDocNumber : "—"}
                        </td>
                        <td className="px-4 py-3 border-b border-border text-right">
                          <span className="text-[13px] font-semibold font-mono text-ink">{formatPEN(doc.total)}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-border text-right">
                          <button
                            onClick={() => setConvertDoc(doc)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors whitespace-nowrap ml-auto"
                          >
                            <ArrowRightLeft size={12} />
                            Convertir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
      </div>

      {convertDoc && (
        <ConvertModal
          doc={convertDoc}
          onClose={() => setConvertDoc(null)}
          onConverted={() => {
            setConvertDoc(null);
            handleConverted();
          }}
        />
      )}
    </div>
  );
}
