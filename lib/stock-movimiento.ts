import type { Prisma } from "@/app/generated/prisma/client";

export const TIPOS_MOVIMIENTO = ["INGRESO", "TRASLADO", "RETORNO"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export function esTipoMovimiento(v: unknown): v is TipoMovimiento {
  return typeof v === "string" && (TIPOS_MOVIMIENTO as readonly string[]).includes(v);
}

export const MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  INGRESO:  "Ingreso a almacén",
  TRASLADO: "Traslado a tienda",
  RETORNO:  "Retorno a almacén",
};

/** Columna de la que sale el stock. El INGRESO es mercadería nueva: no descuenta de ninguna. */
export const ORIGEN_DE: Record<TipoMovimiento, "stockAlmacen" | "stockTienda" | null> = {
  INGRESO:  null,
  TRASLADO: "stockAlmacen",
  RETORNO:  "stockTienda",
};

export const ORIGEN_LABEL = { stockAlmacen: "almacén", stockTienda: "tienda" } as const;

/** Unidades que el movimiento puede tomar de un producto. El INGRESO no tiene tope. */
export function disponible(
  producto: { stockTienda: number; stockAlmacen: number },
  tipo: TipoMovimiento
): number {
  const origen = ORIGEN_DE[tipo];
  return origen ? producto[origen] : Infinity;
}

/**
 * Cómo queda el stock del producto según el tipo. Única fuente de esta matriz:
 * las rutas solo mandan tipo y cantidad, no eligen columna.
 *
 * `stock` es el total (tienda + almacén), así que solo lo mueve el INGRESO:
 * trasladar y retornar reubican unidades que ya estaban contadas.
 */
export function dataDe(tipo: TipoMovimiento, cantidad: number): Prisma.ProductUpdateInput {
  switch (tipo) {
    case "INGRESO":
      return { stockAlmacen: { increment: cantidad }, stock: { increment: cantidad } };
    case "TRASLADO":
      return { stockAlmacen: { decrement: cantidad }, stockTienda: { increment: cantidad } };
    case "RETORNO":
      return { stockTienda: { decrement: cantidad }, stockAlmacen: { increment: cantidad } };
  }
}

/**
 * La condición de stock va dentro del `where` del update, no en un chequeo
 * previo: así Postgres evalúa y descuenta en la misma sentencia y dos
 * movimientos simultáneos del mismo producto no pueden dejarlo negativo.
 * Si no alcanza, Prisma tira P2025 en vez de escribir.
 */
export function whereConStock(
  id: string,
  tipo: TipoMovimiento,
  cantidad: number
): Prisma.ProductWhereUniqueInput {
  if (tipo === "TRASLADO") return { id, stockAlmacen: { gte: cantidad } };
  if (tipo === "RETORNO")  return { id, stockTienda:  { gte: cantidad } };
  return { id };
}
