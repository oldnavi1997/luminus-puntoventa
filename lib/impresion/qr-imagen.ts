/**
 * Rasteriza la cadena QR.
 *
 * Se hace SIEMPRE en el servidor, tanto para el PDF como para el ticket: el
 * ticket recibe un data-URL ya hecho y sólo lo mete en un `<img>`. Así no hay
 * librería de QR en el bundle del navegador, no hay dos implementaciones que
 * puedan divergir, y el papel térmico y el PDF llevan exactamente los mismos
 * bytes.
 *
 * Este módulo no se puede importar desde un componente `"use client"`.
 */

import QRCode from "qrcode";

const OPCIONES = {
  errorCorrectionLevel: "M" as const,
  // Zona de silencio. Con margen 0 un QR pegado al borde no lo lee ningún
  // escáner, y en térmica es el fallo típico.
  margin: 1,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** PNG en crudo, para embeber en el PDF. */
export function qrPngBuffer(cadena: string, px = 320): Promise<Buffer> {
  return QRCode.toBuffer(cadena, { ...OPCIONES, width: px });
}

/** PNG en data-URL, para un `<img>` del ticket. */
export function qrDataUrl(cadena: string, px = 320): Promise<string> {
  return QRCode.toDataURL(cadena, { ...OPCIONES, width: px });
}
