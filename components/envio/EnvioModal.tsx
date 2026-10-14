"use client";

import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Tag, X } from "lucide-react";
import { EnvioCampos } from "./EnvioCampos";
import { EtiquetaEnvio, ESTILO_PAGINA_ETIQUETA } from "./EtiquetaEnvio";
import {
  BORRADOR_VACIO,
  borradorAEnvio,
  envioABorrador,
  errorDeEnvio,
  type BorradorEnvio,
  type DatosEnvio,
} from "@/lib/envio";

/**
 * Etiqueta de envío de una venta ya cobrada.
 *
 * Abre con lo guardado o, si la venta no tiene, con lo que propone el servidor
 * (el pedido de una venta web, el comprador de una de mostrador). Guardar e
 * imprimir es un solo paso: la etiqueta que sale es siempre la que queda
 * guardada, y es la misma fila que lee la exportación a Shalom.
 */
export function EnvioModal({
  documentId,
  fullNumber,
  imprimir = true,
  onClose,
  onGuardado,
}: {
  documentId: string;
  fullNumber?: string;
  /** La exportación a Shalom corrige filas sin imprimir. */
  imprimir?: boolean;
  onClose: () => void;
  onGuardado?: (datos: DatosEnvio) => void;
}) {
  const [borrador, setBorrador] = useState<BorradorEnvio | null>(null);
  const [yaGuardado, setYaGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // `n` cambia en cada impresión, así que reimprimir la misma etiqueta también dispara.
  const [etiqueta, setEtiqueta] = useState<{ datos: DatosEnvio; n: number } | null>(null);
  const etiquetaRef = useRef<HTMLDivElement>(null);

  const imprimirEtiqueta = useReactToPrint({
    contentRef: etiquetaRef,
    pageStyle: ESTILO_PAGINA_ETIQUETA,
  });

  useEffect(() => {
    let vigente = true;
    fetch(`/api/ventas/${documentId}/envio`)
      .then(async (res) => {
        const data = await res.json();
        if (!vigente) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudieron cargar los datos de envío");
          setBorrador(BORRADOR_VACIO);
          return;
        }
        setYaGuardado(data.guardado !== null);
        setBorrador(envioABorrador(data.guardado ?? data.propuesta));
      })
      .catch(() => {
        if (vigente) {
          setError("No se pudieron cargar los datos de envío");
          setBorrador(BORRADOR_VACIO);
        }
      });
    return () => { vigente = false; };
  }, [documentId]);

  useEffect(() => {
    if (etiqueta) imprimirEtiqueta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etiqueta]);

  const errorForma = borrador ? errorDeEnvio(borrador) : null;

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/ventas/${documentId}/envio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borradorAEnvio(borrador)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo guardar");
        return;
      }
      setYaGuardado(true);
      onGuardado?.(data);
      if (imprimir) setEtiqueta((prev) => ({ datos: data, n: (prev?.n ?? 0) + 1 }));
    } catch {
      setError("No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-border animate-scale-in">
        <div className="flex items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-[16px]">
            {yaGuardado ? "Etiqueta de envío" : "Agregar datos de envío"}
          </h2>
          {fullNumber && (
            <span className="ml-3 text-[11px] px-2 py-0.5 rounded-full bg-surface-light text-ink-3 border border-border font-mono">
              {fullNumber}
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {borrador ? (
            <EnvioCampos valor={borrador} onChange={setBorrador} />
          ) : (
            <p className="text-[13px] text-ink-3 py-6 text-center">Cargando…</p>
          )}
        </div>

        <div className="px-5 pb-5 space-y-2">
          {(error || errorForma) && (
            <p className="text-[12px] text-warning text-center">{error || errorForma}</p>
          )}
          <button
            onClick={guardar}
            disabled={!borrador || guardando || errorForma !== null}
            className="w-full bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl py-3 text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {guardando ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Tag size={14} /> {imprimir ? "Guardar e imprimir etiqueta" : "Guardar"}</>
            )}
          </button>
        </div>
      </div>

      {/* Fuera de pantalla: react-to-print clona este nodo al iframe de impresión. */}
      <div style={{ display: "none" }}>
        {etiqueta && <EtiquetaEnvio ref={etiquetaRef} datos={etiqueta.datos} />}
      </div>
    </div>
  );
}
