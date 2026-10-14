"use client";

import { forwardRef } from "react";
import { filasEtiqueta, type DatosEnvio } from "@/lib/envio";

/**
 * Etiqueta del paquete, en el mismo rollo térmico que el ticket.
 *
 * 72 mm de ancho útil, como `Receipt`: la impresora no pinta los 80 del rollo.
 * El alto es automático, así que un nombre o una dirección largos envuelven en
 * vez de cortarse.
 *
 * Solo lleva los datos del destinatario: nada de precios, productos ni receta,
 * que el paquete viaja a la vista de todos.
 */

const ANCHO_MM = 72;

/**
 * Los `!important` por lo mismo que en el ticket: `app/globals.css` fija
 * `html, body { height:100%; overflow:hidden }` y react-to-print lo copia al
 * iframe, lo que recortaría una etiqueta más alta que el viewport.
 */
export const ESTILO_PAGINA_ETIQUETA = `
  @page { size: ${ANCHO_MM}mm auto; margin: 0; }
  html, body {
    width: ${ANCHO_MM}mm;
    margin: 0;
    padding: 0;
    height: auto !important;
    overflow: visible !important;
  }
`;

export const EtiquetaEnvio = forwardRef<HTMLDivElement, { datos: DatosEnvio }>(
  function EtiquetaEnvio({ datos }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: `${ANCHO_MM}mm`,
          padding: "3mm",
          boxSizing: "border-box",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#000",
          background: "#fff",
        }}
      >
        <div style={{ border: "1.5px solid #000", padding: "3mm 3.5mm" }}>
          {filasEtiqueta(datos).map((f) => (
            <p
              key={f.etiqueta}
              style={{
                margin: f.destacado ? "3mm 0 0" : "0 0 2mm",
                fontSize: f.destacado ? "17px" : "14px",
                lineHeight: 1.25,
                wordBreak: "break-word",
              }}
            >
              {f.etiqueta}: <strong>{f.valor}</strong>
            </p>
          ))}
        </div>
      </div>
    );
  }
);
