/**
 * Geometría y utilidades de dibujo del PDF A4.
 *
 * pdfkit es imperativo: no hay flujo ni cajas que se acomoden solas, así que
 * todo el reparto del ancho vive aquí en constantes y no repartido por el
 * documento. Cambiar una columna es cambiar un número.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A4 en puntos. */
export const PAGINA = { ancho: 595.28, alto: 841.89 };
export const MARGEN = 40;
export const ANCHO_UTIL = PAGINA.ancho - MARGEN * 2;

export const FUENTE = "cond";
export const FUENTE_NEGRITA = "cond-bold";

/**
 * Las columnas de la tabla de ítems, con los mismos rótulos que traían los
 * comprobantes del facturador anterior. Suman `ANCHO_UTIL`.
 */
export const COLUMNAS = [
  { clave: "item", titulo: "Item", ancho: 30, alineacion: "left" as const },
  { clave: "cantidad", titulo: "Cant.", ancho: 35, alineacion: "right" as const },
  { clave: "unidad", titulo: "Unidad", ancho: 40, alineacion: "center" as const },
  { clave: "codigo", titulo: "Cod. Prod.", ancho: 55, alineacion: "left" as const },
  { clave: "descripcion", titulo: "Descripción", ancho: 185, alineacion: "left" as const },
  { clave: "precio", titulo: "Precio Unitario", ancho: 85, alineacion: "right" as const },
  { clave: "importe", titulo: "Importe", ancho: 85, alineacion: "right" as const },
];

export const GRIS_CABECERA = "#EFEFEF";
export const GRIS_LINEA = "#BBBBBB";

/** Alto que hay que dejar libre al pie antes de pasar de página. */
export const RESERVA_PIE = 150;

const rutaFuente = (archivo: string) => join(process.cwd(), "lib", "impresion", "fuentes", archivo);

export const RUTA_FUENTE_REGULAR = rutaFuente("DejaVuSansCondensed.ttf");
export const RUTA_FUENTE_NEGRITA = rutaFuente("DejaVuSansCondensed-Bold.ttf");

let logoCache: Buffer | null | undefined;

/**
 * El logo, o `null` si no está.
 *
 * Se memoriza porque no cambia entre documentos, y un logo que falte **no puede
 * impedir emitir el PDF**: el comprobante vale igual sin él.
 */
export function logoBuffer(): Buffer | null {
  if (logoCache !== undefined) return logoCache;

  try {
    logoCache = readFileSync(join(process.cwd(), "public", "logo-comprobante.png"));
  } catch {
    console.error("[impresion] no se encontró public/logo-comprobante.png; el PDF sale sin logo.");
    logoCache = null;
  }
  return logoCache;
}

/** Sólo para las pruebas. */
export function _olvidarLogo(): void {
  logoCache = undefined;
}

/** Importe con separador de miles, como en los comprobantes de referencia. */
export function soles(n: number): string {
  return `S/ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
