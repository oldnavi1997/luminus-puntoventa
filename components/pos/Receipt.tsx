"use client";

import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, X } from "lucide-react";
import type { RepresentacionImpresa } from "@/lib/impresion/tipos";

/**
 * El ticket de 80 mm.
 *
 * Es presentacional puro: recibe la representación ya armada y sólo la pinta.
 * Antes derivaba el título del prefijo del `fullNumber`, componía el monto en
 * letras y llevaba la cabecera de la empresa escrita a mano; todo eso vive
 * ahora en `lib/impresion`, que es también lo que consume el PDF.
 *
 * Los estilos van en línea a propósito. `react-to-print` clona el nodo a un
 * iframe y copia las hojas del documento; con Tailwind v4 no hay garantía de
 * que llegue todo, y unos estilos en línea no dependen de eso.
 */

/** Las térmicas de 80 mm imprimen 72 mm útiles (576 dots). */
const ANCHO_MM = 72;
/** Ese mismo ancho en píxeles a 96 dpi, para la vista previa en pantalla. */
const ANCHO_PREVIEW_PX = Math.round((ANCHO_MM / 25.4) * 96);

/**
 * Sin `size` el navegador maqueta A4 y el ticket sale a escala equivocada o
 * paginado. Y `app/globals.css` fija `html, body { height:100%; overflow:hidden }`,
 * que react-to-print copia al iframe y recortaría un ticket más alto que el
 * viewport: de ahí los `!important`, que son deliberados.
 */
const ESTILO_PAGINA = `
  @page { size: ${ANCHO_MM}mm auto; margin: 0; }
  html, body {
    width: ${ANCHO_MM}mm;
    margin: 0;
    padding: 0;
    height: auto !important;
    overflow: visible !important;
  }
`;

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

const hr: React.CSSProperties = { border: "none", borderTop: "1px dashed #000", margin: "5px 0" };
const centrado: React.CSSProperties = { textAlign: "center", margin: "1px 0" };

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <tr>
      <td style={{ paddingRight: "4px", fontWeight: fuerte ? "bold" : undefined }}>{etiqueta}</td>
      <td style={{ textAlign: "right", fontWeight: fuerte ? "bold" : undefined }}>{valor}</td>
    </tr>
  );
}

export function Receipt({ rep, onClose }: { rep: RepresentacionImpresa; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: ESTILO_PAGINA,
    // El QR es un data-URL ya pintado en la vista previa, así que normalmente
    // está decodificado. Esto cubre el caso en que no lo esté: un QR sin
    // decodificar sale como un recuadro en blanco en el papel.
    onBeforePrint: async () => {
      const imgs = printRef.current?.querySelectorAll("img") ?? [];
      await Promise.all([...imgs].map((i) => i.decode().catch(() => undefined)));
    },
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-ink text-sm">Vista previa del ticket</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[65vh]">
          {/* Ancho fijo sólo en pantalla; al imprimir manda el @page. */}
          <div style={{ width: `${ANCHO_PREVIEW_PX}px`, margin: "0 auto" }}>
            <div
              ref={printRef}
              style={{
                fontFamily: "Verdana, Geneva, sans-serif",
                fontSize: "10px",
                color: "#000",
                background: "#fff",
                padding: "6px 8px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* ── Emisor ─────────────────────────────────────────────── */}
              <div style={{ textAlign: "center", marginBottom: "6px" }}>
                <p style={{ fontWeight: "bold", fontSize: "16px", letterSpacing: "2px", margin: 0 }}>
                  {rep.emisor.nombreComercial}
                </p>
                <p style={{ ...centrado, marginTop: "4px" }}>{rep.emisor.razonSocial}</p>
                {/* El RUC es obligatorio en la representación impresa y hasta
                    ahora no salía en el ticket. */}
                <p style={{ ...centrado, fontWeight: "bold" }}>RUC {rep.emisor.ruc}</p>
                {rep.emisor.domicilioFiscal && <p style={centrado}>{rep.emisor.domicilioFiscal}</p>}
                {rep.emisor.sucursal && <p style={centrado}>SUCURSAL: {rep.emisor.sucursal}</p>}
                {rep.emisor.direccionSucursal && <p style={centrado}>{rep.emisor.direccionSucursal}</p>}
                {rep.emisor.telefono && <p style={centrado}>{rep.emisor.telefono}</p>}
                {rep.emisor.email && <p style={centrado}>{rep.emisor.email}</p>}
              </div>

              <hr style={hr} />

              <div style={{ textAlign: "center", margin: "4px 0" }}>
                <p style={{ fontWeight: "bold", fontSize: "11px", margin: "0 0 1px 0" }}>
                  {rep.documento.titulo}
                </p>
                <p style={{ fontWeight: "bold", margin: 0 }}>{rep.documento.fullNumber}</p>
              </div>

              {rep.aviso && (
                <p
                  style={{
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "11px",
                    border: "1px solid #000",
                    padding: "2px",
                    margin: "4px 0",
                  }}
                >
                  {rep.aviso}
                </p>
              )}

              <hr style={hr} />

              {/* ── Datos ──────────────────────────────────────────────── */}
              <table style={{ width: "100%", marginBottom: "4px", borderCollapse: "collapse" }}>
                <tbody>
                  <Fila etiqueta="FECHA" valor={rep.documento.fechaEmisionCorta} />
                  <Fila etiqueta="HORA" valor={rep.documento.horaEmision} />
                  <Fila etiqueta="CLIENTE" valor={rep.adquirente.nombre} />
                  {rep.adquirente.numeroDoc && (
                    <Fila
                      etiqueta={rep.adquirente.tipoDocEtiqueta.toUpperCase()}
                      valor={rep.adquirente.numeroDoc}
                    />
                  )}
                  <Fila etiqueta="CONDICIÓN DE PAGO" valor={rep.pago.condicion} />
                  {rep.vendedor && <Fila etiqueta="VENDEDOR" valor={rep.vendedor} />}
                  <Fila etiqueta="MONEDA" valor={rep.documento.moneda} />
                </tbody>
              </table>

              <hr style={hr} />

              {/* ── Ítems ──────────────────────────────────────────────── */}
              <div
                style={{
                  display: "flex",
                  gap: "3px",
                  fontWeight: "bold",
                  borderBottom: "1px solid #000",
                  paddingBottom: "2px",
                  marginBottom: "3px",
                  fontSize: "9px",
                }}
              >
                <span style={{ width: "34px", flexShrink: 0 }}>COD.</span>
                <span style={{ flex: 1 }}>PRODUCTO</span>
                <span style={{ width: "20px", textAlign: "right", flexShrink: 0 }}>CANT</span>
                <span style={{ width: "38px", textAlign: "right", flexShrink: 0 }}>P.UNIT</span>
                <span style={{ width: "42px", textAlign: "right", flexShrink: 0 }}>IMPORTE</span>
              </div>

              {rep.items.map((item) => (
                <div
                  key={item.numero}
                  style={{ display: "flex", gap: "3px", marginBottom: "3px", fontSize: "9px" }}
                >
                  <span style={{ width: "34px", flexShrink: 0, overflow: "hidden" }}>{item.codigo ?? ""}</span>
                  <span style={{ flex: 1, wordBreak: "break-word" }}>{item.descripcion}</span>
                  <span style={{ width: "20px", textAlign: "right", flexShrink: 0 }}>{item.cantidad}</span>
                  <span style={{ width: "38px", textAlign: "right", flexShrink: 0 }}>
                    {item.precioUnitario.toFixed(2)}
                  </span>
                  <span style={{ width: "42px", textAlign: "right", flexShrink: 0 }}>
                    {item.importe.toFixed(2)}
                  </span>
                </div>
              ))}

              <hr style={hr} />

              {/* ── Totales ────────────────────────────────────────────── */}
              <table style={{ width: "100%", marginBottom: "4px", borderCollapse: "collapse" }}>
                <tbody>
                  {/* Sólo un comprobante desglosa impuestos. Aquí manda la clase y no
                      `rep.sunat`: ese también es null en una boleta pendiente o
                      rechazada, y una boleta declara IGV la conteste SUNAT o no. */}
                  {rep.clase === "COMPROBANTE" && (
                    <>
                      <Fila etiqueta="OP. GRAVADAS" valor={soles(rep.totales.opGravadas)} />
                      <Fila etiqueta="I.G.V. (18%)" valor={soles(rep.totales.igv)} />
                    </>
                  )}
                  {rep.totales.descuento > 0 && (
                    <Fila etiqueta="DESCUENTO" valor={soles(rep.totales.descuento)} />
                  )}
                  <Fila etiqueta="IMPORTE TOTAL" valor={soles(rep.totales.total)} fuerte />

                  {rep.pago.adelanto != null ? (
                    <>
                      <Fila etiqueta="ADELANTO RECIBIDO" valor={soles(rep.pago.adelanto)} fuerte />
                      <Fila
                        etiqueta="SALDO PENDIENTE"
                        valor={soles(rep.pago.saldoPendiente ?? 0)}
                        fuerte
                      />
                    </>
                  ) : (
                    <>
                      {rep.pago.desglose.map((d) => (
                        <Fila key={d.etiqueta} etiqueta={d.etiqueta.toUpperCase()} valor={soles(d.monto)} />
                      ))}
                      {rep.pago.montoRecibido != null && (
                        <Fila etiqueta="PAGADO" valor={soles(rep.pago.montoRecibido)} />
                      )}
                      {rep.pago.cambio != null && rep.pago.cambio > 0 && (
                        <Fila etiqueta="VUELTO" valor={soles(rep.pago.cambio)} />
                      )}
                    </>
                  )}
                </tbody>
              </table>

              <hr style={hr} />

              <p style={{ fontWeight: "bold", wordBreak: "break-word", margin: "3px 0" }}>
                SON: {rep.totales.totalLetras}
              </p>

              <hr style={hr} />

              {/* ── Pie legal ──────────────────────────────────────────── */}
              {rep.sunat && (
                <div style={{ textAlign: "center", marginTop: "6px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data-URL generado en el servidor, no es un asset */}
                  <img
                    src={rep.sunat.qrDataUrl}
                    alt="Código QR del comprobante"
                    style={{ width: "40mm", height: "40mm", display: "block", margin: "0 auto" }}
                  />
                  {rep.sunat.hash && (
                    <p style={{ fontSize: "8px", wordBreak: "break-all", margin: "3px 0" }}>
                      Valor resumen: {rep.sunat.hash}
                    </p>
                  )}
                  {rep.sunat.leyendas.map((l) => (
                    <p key={l} style={{ fontSize: "7.5px", margin: "2px 0", wordBreak: "break-word" }}>
                      {l}
                    </p>
                  ))}
                </div>
              )}

              <p style={{ textAlign: "center", marginTop: "6px", fontSize: "9px" }}>Gracias por su compra</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={() => handlePrint?.()}
            className="w-full bg-accent hover:bg-accent-dark rounded-xl py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Printer size={15} />
            Imprimir ticket
          </button>
        </div>
      </div>
    </div>
  );
}
