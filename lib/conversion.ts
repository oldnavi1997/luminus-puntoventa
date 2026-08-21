/**
 * Marca que deja una nota de venta convertida en comprobante.
 *
 * Convertir no mueve stock ni caja: eso ya lo hizo la nota de venta original.
 * El comprobante resultante es un documento nuevo para SUNAT sobre una venta ya
 * registrada. Sin una marca no hay forma de distinguirlo de una venta normal:
 * borrarlo devolvía stock que nunca salió y restaba de la caja plata que nunca
 * se sumó ahí, y nada impedía convertir la misma nota una y otra vez, emitiendo
 * varios comprobantes por una sola venta.
 *
 * Va en `notes` porque el schema es del ecommerce y no se puede añadir una
 * columna desde aquí. De paso queda a la vista de quien mire el comprobante.
 */
const MARCA = "Convertido de ";

/**
 * Exige la forma de un `fullNumber` detrás del texto: así una nota escrita a
 * mano que empiece igual —"Convertido de una cotización antigua"— no pasa por
 * una conversión y no bloquea la venta.
 */
const RE_ORIGEN = new RegExp("^" + MARCA + String.raw`([A-Z0-9]+-\d+)(?:\.|$)`);

/**
 * Los `fullNumber` tienen ancho fijo (`formatCorrelativo` rellena a 8 dígitos),
 * así que ninguno es prefijo de otro y buscar por `startsWith` no confunde
 * NV001-00000025 con NV001-00000251.
 */
export function prefijoDeConversion(origen: string): string {
  return `${MARCA}${origen}`;
}

export function marcaDeConversion(origen: string, notaOriginal?: string | null): string {
  const base = prefijoDeConversion(origen);
  return notaOriginal?.trim() ? `${base}. ${notaOriginal.trim()}` : base;
}

export function naceDeConversion(notes: string | null | undefined): boolean {
  return origenDeConversion(notes) !== null;
}

/** El comprobante del que salió, o `null` si esa nota no es una marca. */
export function origenDeConversion(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = RE_ORIGEN.exec(notes);
  return m ? m[1] : null;
}
