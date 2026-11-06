/**
 * Búsqueda de ventas compartida por el Historial de ventas (`/api/ventas`) y
 * Convertir NV (`/api/ventas/convertibles`), para que las dos pantallas
 * encuentren lo mismo con el mismo texto.
 *
 * Sin imports de Prisma a propósito: el cliente importa `MIN_BUSQUEDA`.
 */

/** Menos caracteres que esto no filtra nada útil y sólo genera ruido. */
export const MIN_BUSQUEDA = 2;

/** Tope de filas transferidas al buscar. */
export const MAX_RESULTADOS = 100;

export function esBusqueda(q: string): boolean {
  return q.trim().length >= MIN_BUSQUEDA;
}

/** Rango de un día calendario de Lima (`YYYY-MM-DD`), en instantes UTC. */
export function rangoDelDia(fecha: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${fecha}T00:00:00-05:00`),
    lte: new Date(`${fecha}T23:59:59.999-05:00`),
  };
}

/** `YYYY-MM-DD` de hoy en Lima. */
export function hoyEnLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** `where` de Prisma sobre `SaleDocument` para un texto de búsqueda. */
export function whereBusquedaVentas(texto: string) {
  const q = texto.trim();
  // SKU sin ceros a la izquierda ("0632" -> "632"), mismo truco que /api/productos.
  const qStripped = q.replace(/^0+/, "") || q;
  return {
    OR: [
      { buyerName:      { contains: q, mode: "insensitive" as const } },
      { buyerPhone:     { contains: q } },
      { buyerDocNumber: { contains: q } },
      { fullNumber:     { contains: q, mode: "insensitive" as const } },
      // description es el nombre del producto al momento de vender; name y sku
      // son los del catalogo hoy. Con los tres, un producto renombrado se
      // encuentra tanto por el nombre viejo como por el nuevo.
      { items: { some: { description:     { contains: q, mode: "insensitive" as const } } } },
      { items: { some: { product: { name: { contains: q, mode: "insensitive" as const } } } } },
      { items: { some: { product: { sku:  { contains: q, mode: "insensitive" as const } } } } },
      ...(qStripped !== q
        ? [{ items: { some: { product: { sku: { contains: qStripped, mode: "insensitive" as const } } } } }]
        : []),
    ],
  };
}
