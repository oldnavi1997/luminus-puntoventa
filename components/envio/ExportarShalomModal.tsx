"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Globe, Pencil, X } from "lucide-react";
import { EnvioModal } from "./EnvioModal";
import type { EnvioShalomVista } from "@/app/api/envios/shalom/route";

/**
 * Exporta los envíos Shalom de un día a su plantilla de carga masiva.
 *
 * Primero enseña qué va a salir: una fila con la agencia mal escrita o sin DNI
 * haría fallar la carga en la web de Shalom, así que no se exporta y se puede
 * corregir aquí mismo.
 */
export function ExportarShalomModal({ fechaInicial, onClose }: { fechaInicial: string; onClose: () => void }) {
  const [fecha, setFecha] = useState(fechaInicial);
  // Sube tras cada corrección para volver a pedir la vista previa.
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<{
    clave: string;
    filas: EnvioShalomVista[];
    error: string;
  } | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<EnvioShalomVista | null>(null);

  const clave = `${fecha}#${version}`;

  useEffect(() => {
    let vigente = true;
    fetch(`/api/envios/shalom?fecha=${fecha}`)
      .then(async (res) => {
        const data = await res.json();
        if (!vigente) return;
        setResultado(
          res.ok
            ? { clave, filas: data, error: "" }
            : { clave, filas: [], error: typeof data.error === "string" ? data.error : "No se pudo cargar" }
        );
      })
      .catch(() => {
        if (vigente) setResultado({ clave, filas: [], error: "No se pudo cargar" });
      });
    return () => { vigente = false; };
  }, [fecha, clave]);

  // Mientras llega la respuesta del día elegido, la vista previa es «cargando».
  const filas = resultado?.clave === clave ? resultado.filas : null;
  const error = resultado?.clave === clave ? resultado.error : "";

  const listas = filas?.filter((f) => f.problema === null).length ?? 0;
  const conProblema = (filas?.length ?? 0) - listas;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl border border-border animate-scale-in flex flex-col max-h-[90vh]">
          <div className="flex items-center px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-ink text-[16px]">Exportar envíos a Shalom</h2>
            <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto">
            <div className="flex items-end gap-3 mb-4">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wide text-ink-3 font-medium mb-1">Día</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => e.target.value && setFecha(e.target.value)}
                  className="bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
                />
              </div>
              <p className="text-[12px] text-ink-4 pb-2">
                Ventas del mostrador con etiqueta de Shalom y pedidos web enviados por Shalom.
              </p>
            </div>

            {error && <p className="text-[13px] text-danger mb-3">{error}</p>}

            {filas === null ? (
              <p className="text-[13px] text-ink-3 py-8 text-center">Cargando…</p>
            ) : filas.length === 0 ? (
              <p className="text-[13px] text-ink-3 py-8 text-center">No hay envíos por Shalom ese día.</p>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-surface-light text-ink-4 border-b border-border">
                      <th className="w-8" />
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] font-medium">Destinatario</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] font-medium">DNI</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] font-medium">Celular</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] font-medium">Agencia</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] font-medium">Mercadería</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.documentId} className="border-b border-border last:border-0 align-top">
                        <td className="pl-3 py-2">
                          {f.problema ? (
                            <AlertTriangle size={14} className="text-warning" />
                          ) : (
                            <CheckCircle2 size={14} className="text-success" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink">
                          <div className="flex items-center gap-1.5">
                            {f.channel === "WEB" && <Globe size={11} className="text-accent shrink-0" />}
                            {f.nombre || "—"}
                          </div>
                          <p className="text-ink-4 font-mono text-[11px]">{f.fullNumber}</p>
                          {f.problema && <p className="text-warning mt-0.5">{f.problema}</p>}
                        </td>
                        <td className="px-3 py-2 font-mono text-ink-3">{f.documento ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-ink-3">{f.celular || "—"}</td>
                        <td className="px-3 py-2 text-ink-3">{f.destino || "—"}</td>
                        <td className="px-3 py-2 text-ink-3 whitespace-nowrap">{f.mercaderia}</td>
                        <td className="pr-2 py-2">
                          <button
                            onClick={() => setCorrigiendo(f)}
                            title="Corregir datos de envío"
                            className="p-1.5 rounded-lg text-ink-4 hover:text-accent hover:bg-surface-light transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border">
            <p className="text-[12px] text-ink-4">
              {conProblema > 0
                ? `${conProblema} sin exportar hasta corregirlos`
                : "Se descarga la plantilla oficial de Shalom, lista para subir."}
            </p>
            <button
              disabled={listas === 0}
              // Una navegación y no un fetch: el navegador guarda el adjunto solo.
              onClick={() => { window.location.href = `/api/envios/shalom?fecha=${fecha}&descargar=1`; }}
              className="bg-accent hover:bg-accent-dark disabled:opacity-40 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors flex items-center gap-2"
            >
              <FileSpreadsheet size={14} />
              Descargar Excel ({listas})
            </button>
          </div>
        </div>
      </div>

      {corrigiendo && (
        <EnvioModal
          documentId={corrigiendo.documentId}
          fullNumber={corrigiendo.fullNumber}
          imprimir={false}
          onClose={() => setCorrigiendo(null)}
          onGuardado={() => {
            setCorrigiendo(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
