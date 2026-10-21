import type { Prisma, TipoMovimientoStock } from "@/app/generated/prisma/client";

/**
 * Tipos que un usuario crea desde el POS. Los *_WEB los origina el ecommerce y
 * los *_ACCESORIO_POS la venta (`lib/accesorios-venta.ts`).
 */
export const TIPOS_MOVIMIENTO = ["INGRESO", "TRASLADO", "RETORNO"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export function esTipoMovimiento(v: unknown): v is TipoMovimiento {
  return typeof v === "string" && (TIPOS_MOVIMIENTO as readonly string[]).includes(v);
}

/** Todo el enum: sirve para filtrar el historial, que sí incluye los de la web. */
export const TIPOS_MOVIMIENTO_FILTRO = [
  ...TIPOS_MOVIMIENTO,
  "VENTA_WEB",
  "ANULACION_WEB",
  "ACCESORIO_POS",
  "ANULACION_ACCESORIO_POS",
] as const satisfies readonly TipoMovimientoStock[];

export function esTipoMovimientoFiltro(v: unknown): v is TipoMovimientoStock {
  return typeof v === "string" && (TIPOS_MOVIMIENTO_FILTRO as readonly string[]).includes(v);
}

/** Cubre el enum completo: el historial muestra también lo que genera la web. */
export const MOVIMIENTO_LABEL: Record<TipoMovimientoStock, string> = {
  INGRESO:       "Ingreso a almacén",
  TRASLADO:      "Traslado a tienda",
  RETORNO:       "Retorno a almacén",
  VENTA_WEB:     "Venta web",
  ANULACION_WEB: "Anulación de venta web",
  ACCESORIO_POS:           "Accesorio de venta",
  ANULACION_ACCESORIO_POS: "Accesorio devuelto",
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

/**
 * P2025 es lo que devuelve Prisma cuando el `where` de arriba no matcheó: entre
 * la lectura del producto y el update, otro movimiento se llevó las unidades.
 * No es un error a propagar, es la carrera que `whereConStock` existe para
 * detectar.
 */
export function esCarreraDeStock(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2025";
}

/**
 * Las rutas de movimiento abortan la transacción lanzando la respuesta HTTP que
 * les toca, para que el rollback y el mensaje salgan del mismo sitio. Esto lo
 * reconoce al recogerlo, sin tener que tipar el catch como `any`.
 */
export interface FalloDeMovimiento {
  status: number;
  message: string;
  /** Marca el 409 de reintento, que el cliente resuelve confirmando, no repitiendo. */
  duplicadoProbable?: boolean;
}

export function esFalloDeMovimiento(e: unknown): e is FalloDeMovimiento {
  if (typeof e !== "object" || e === null) return false;
  const posible = e as { status?: unknown; message?: unknown };
  return typeof posible.status === "number" && typeof posible.message === "string";
}

/**
 * Cuánto se mira hacia atrás para decidir que un movimiento idéntico es un
 * reintento y no una carga nueva.
 *
 * El POST suma (`dataDe` incrementa), así que repetirlo suma de nuevo. Cuando el
 * celular corta por timeout la escritura ya ocurrió, pero el cajero ve un error
 * y vuelve a confirmar: así se duplicaba el stock. Como no hay columna donde
 * guardar una llave de idempotencia —el esquema lo manda el ecommerce, ver
 * railway.toml— se reconoce el reintento por su forma: mismo producto, tipo,
 * cantidad y usuario dentro de la ventana.
 *
 * No se bloquea nada: el cliente puede repetir con `forzar` si de verdad es un
 * segundo movimiento igual.
 */
export const VENTANA_DUPLICADO_MS = 90_000;

/**
 * El movimiento idéntico más reciente dentro de la ventana, si lo hay.
 * Va por el índice `[productId, createdAt]` que ya existe.
 */
export async function movimientoGemeloReciente(
  tx: Prisma.TransactionClient,
  mov: { productId: string; tipo: TipoMovimiento; cantidad: number; userId: string },
  ahora: Date = new Date()
) {
  return tx.stockMovimiento.findFirst({
    where: {
      productId: mov.productId,
      tipo:      mov.tipo,
      cantidad:  mov.cantidad,
      userId:    mov.userId,
      createdAt: { gte: new Date(ahora.getTime() - VENTANA_DUPLICADO_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Segundos transcurridos, para redactar el aviso de duplicado. */
export function haceSegundos(desde: Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 1000));
}
