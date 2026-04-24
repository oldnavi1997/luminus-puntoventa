"use client";

import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { X, Printer } from "lucide-react";

interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sku?: string | null;
}

interface ReceiptProps {
  document: {
    id: string;
    fullNumber: string;
    total: number;
    cambio?: number;
    montoAdelanto?: number | null;
    status: string;
    pdfUrl?: string | null;
    qrCode?: string | null;
  };
  items: ReceiptItem[];
  buyerName?: string;
  buyerDoc?: string;
  paymentMethod?: string;
  montoRecibido?: number;
  cashierName?: string;
  onClose: () => void;
}

function numeroALetras(monto: number): string {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  const unidades = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const decenas = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  function grupo(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "CIEN";
    let r = "";
    if (n >= 100) { r += centenas[Math.floor(n / 100)] + " "; n %= 100; }
    if (n >= 20) { r += decenas[Math.floor(n / 10)]; if (n % 10) r += " Y " + unidades[n % 10]; }
    else if (n > 0) r += unidades[n];
    return r.trim();
  }

  function convertir(n: number): string {
    if (n === 0) return "CERO";
    let r = "";
    if (n >= 1000000) { r += grupo(Math.floor(n / 1000000)) + " MILLONES "; n %= 1000000; }
    if (n >= 1000) {
      const miles = Math.floor(n / 1000);
      r += miles === 1 ? "MIL " : grupo(miles) + " MIL ";
      n %= 1000;
    }
    r += grupo(n);
    return r.trim();
  }

  return `${convertir(entero)} ${centavos.toString().padStart(2, "0")}/100 SOLES`;
}

export function Receipt({ document, items, buyerName, buyerDoc, paymentMethod, montoRecibido, cashierName, onClose }: ReceiptProps) {
  const esAdelanto = document.status === "PARTIAL" && document.montoAdelanto != null;
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: `
      @page { margin: 0; }
      body  { margin: 0; padding: 0; }
    `,
  });

  const total = document.total;
  const isNotaVenta = document.fullNumber.startsWith("NV");
  const isFactura = document.fullNumber.startsWith("F");
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  const docTitle = isNotaVenta
    ? "NOTA DE VENTA"
    : isFactura
      ? "FACTURA ELECTRÓNICA"
      : "BOLETA DE VENTA ELECTRÓNICA";

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", marginBottom: "1px" };
  const hrStyle: React.CSSProperties = { border: "none", borderTop: "1px dashed #000", margin: "5px 0" };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-ink text-sm">Vista previa del ticket</h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {/* Receipt preview */}
        <div className="p-4 overflow-y-auto max-h-[65vh]">
          {/* Wrapper de preview: ancho fijo solo en pantalla */}
          <div style={{ width: "302px", margin: "0 auto" }}>
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
            {/* Header empresa */}
            <div style={{ textAlign: "center", marginBottom: "6px" }}>
              <p style={{ fontWeight: "bold", fontSize: "18px", letterSpacing: "3px", margin: 0 }}>LUMINUS</p>
              <p style={{ fontSize: "10px", letterSpacing: "5px", margin: "0 0 4px 0" }}>EYEWEAR</p>
              <p style={{ margin: "1px 0" }}>LUMINUS S.A.C.</p>
              <p style={{ margin: "1px 0" }}>CALLE MORAL 107</p>
              <p style={{ margin: "1px 0" }}>+51932079598</p>
              <p style={{ margin: "1px 0" }}>TIENDA MORAL</p>
              <p style={{ margin: "1px 0" }}>VENTAS@LUMINUSEYEWEAR.COM</p>
            </div>

            <hr style={hrStyle} />

            {/* Tipo de documento */}
            <div style={{ textAlign: "center", margin: "4px 0" }}>
              <p style={{ fontWeight: "bold", fontSize: "11px", margin: "0 0 1px 0" }}>{docTitle}</p>
              <p style={{ fontWeight: "bold", margin: 0 }}>{document.fullNumber}</p>
            </div>

            <hr style={hrStyle} />

            {/* Datos */}
            <table style={{ width: "100%", marginBottom: "4px", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: "4px" }}>FECHA</td>
                  <td style={{ textAlign: "right" }}>{fecha}</td>
                </tr>
                <tr>
                  <td>HORA</td>
                  <td style={{ textAlign: "right" }}>{hora}</td>
                </tr>
                <tr>
                  <td>FECHA ENTREGA</td>
                  <td style={{ textAlign: "right" }}>{fecha}</td>
                </tr>
                <tr>
                  <td>CLIENTE</td>
                  <td style={{ textAlign: "right" }}>{buyerName ?? "CONSUMIDOR FINAL"}</td>
                </tr>
                {buyerDoc && (
                  <tr>
                    <td>DOC.</td>
                    <td style={{ textAlign: "right" }}>{buyerDoc}</td>
                  </tr>
                )}
                <tr>
                  <td>CONDICIÓN DE PAGO</td>
                  <td style={{ textAlign: "right" }}>CONTADO</td>
                </tr>
                {cashierName && (
                  <tr>
                    <td>VENDEDOR</td>
                    <td style={{ textAlign: "right" }}>{cashierName}</td>
                  </tr>
                )}
                <tr>
                  <td>MONEDA</td>
                  <td style={{ textAlign: "right" }}>SOL</td>
                </tr>
              </tbody>
            </table>

            <hr style={hrStyle} />

            {/* Encabezado items */}
            <div style={{ display: "flex", gap: "3px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "2px", marginBottom: "3px", fontSize: "9px" }}>
              <span style={{ width: "36px", flexShrink: 0 }}>SKU</span>
              <span style={{ flex: 1 }}>PRODUCTO</span>
              <span style={{ width: "22px", textAlign: "right", flexShrink: 0 }}>UND</span>
              <span style={{ width: "38px", textAlign: "right", flexShrink: 0 }}>UNIT</span>
              <span style={{ width: "42px", textAlign: "right", flexShrink: 0 }}>TOTAL</span>
            </div>

            {/* Items */}
            {items.length > 0 ? (
              items.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: "3px", marginBottom: "3px", fontSize: "9px" }}>
                  <span style={{ width: "36px", flexShrink: 0, overflow: "hidden" }}>{item.sku ?? ""}</span>
                  <span style={{ flex: 1, wordBreak: "break-word" }}>{item.description}</span>
                  <span style={{ width: "22px", textAlign: "right", flexShrink: 0 }}>{item.quantity}</span>
                  <span style={{ width: "38px", textAlign: "right", flexShrink: 0 }}>{item.unitPrice.toFixed(2)}</span>
                  <span style={{ width: "42px", textAlign: "right", flexShrink: 0 }}>{item.lineTotal.toFixed(2)}</span>
                </div>
              ))
            ) : (
              <p style={{ fontStyle: "italic", color: "#666", fontSize: "9px" }}>Ver documento para detalle</p>
            )}

            <hr style={hrStyle} />

            {/* Totales */}
            <table style={{ width: "100%", marginBottom: "4px", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: "4px" }}>TOTAL DE LA VENTA</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>S/ {total.toFixed(2)}</td>
                </tr>
                {esAdelanto ? (
                  <>
                    <tr>
                      <td>ADELANTO RECIBIDO</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>S/ {document.montoAdelanto!.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: "bold" }}>SALDO PENDIENTE</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>S/ {(total - document.montoAdelanto!).toFixed(2)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td>TOTAL A PAGAR</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>S/ {total.toFixed(2)}</td>
                    </tr>
                    {montoRecibido != null && (
                      <tr>
                        <td>PAGADO</td>
                        <td style={{ textAlign: "right" }}>S/ {montoRecibido.toFixed(2)}</td>
                      </tr>
                    )}
                    {paymentMethod === "EFECTIVO" && document.cambio != null && document.cambio >= 0 && (
                      <tr>
                        <td>VUELTO</td>
                        <td style={{ textAlign: "right" }}>S/ {document.cambio.toFixed(2)}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>

            <hr style={hrStyle} />

            {/* Monto en letras */}
            <p style={{ fontWeight: "bold", wordBreak: "break-word", margin: "3px 0" }}>
              SON: {numeroALetras(total)}
            </p>

            <hr style={hrStyle} />

            {/* Footer */}
            <p style={{ textAlign: "center", marginTop: "4px", fontSize: "9px" }}>Gracias por su compra</p>
            {!isNotaVenta && document.qrCode && (
              <p style={{ textAlign: "center", fontSize: "8px", wordBreak: "break-all", marginTop: "3px", color: "#666" }}>
                {document.qrCode.substring(0, 60)}...
              </p>
            )}
          </div>
          </div>{/* fin wrapper preview */}
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
