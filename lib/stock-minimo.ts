/**
 * Cuándo un producto tiene «stock bajo».
 *
 * Hay un umbral general (`PosConfig.stockMinimo`, 5 si nadie lo cambió) y cada
 * producto puede reemplazarlo con el suyo (`Product.stockMinimo`; null = rige el
 * general). Bajo es tener entre 1 y el umbral, sobre el stock total: lo que está
 * en 0 es «agotado», que es otra cosa.
 *
 * Sin imports a propósito: lo usa también el inventario en el navegador.
 */

export const STOCK_MINIMO_POR_DEFECTO = 5;

/** Tope razonable para que un error de tipeo no marque todo como bajo. */
export const STOCK_MINIMO_MAXIMO = 9999;

export type ConStockMinimo = { stock: number; stockMinimo: number | null };

export function umbralDe(p: { stockMinimo: number | null }, general: number): number {
  return p.stockMinimo ?? general;
}

export function esStockBajo(p: ConStockMinimo, general: number): boolean {
  return p.stock > 0 && p.stock <= umbralDe(p, general);
}

/**
 * Lo que llega del formulario: un entero entre 0 y el máximo. `null` y "" valen
 * null (para el mínimo propio de un producto: volver al general). Devuelve
 * `undefined` si el valor no sirve, para que la ruta responda 400.
 */
export function parsearStockMinimo(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > STOCK_MINIMO_MAXIMO) return undefined;
  return n;
}
