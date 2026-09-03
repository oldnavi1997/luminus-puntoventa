/**
 * Orden por defecto del listado de productos: el SKU más alto primero.
 *
 * El SKU se asigna de forma correlativa, así que el más alto es lo último que
 * entró — que es lo que se quiere ver arriba al cargar mercadería.
 *
 * No se puede pedir en el `orderBy` de Prisma. Los SKU son numéricos pero no
 * están rellenados con ceros ("45", "614" y "0697" conviven en la base), así que
 * el orden de texto pondría "97" por encima de "697". Hay que comparar el valor
 * numérico, y Prisma no ordena por expresiones.
 */

/** El valor numérico del SKU, o null si no lo tiene o no es un número. */
export function valorSku(sku: string | null | undefined): number | null {
  const limpio = sku?.trim();
  if (!limpio || !/^\d+$/.test(limpio)) return null;
  return parseInt(limpio, 10); // "0697" y "697" valen lo mismo
}

export type ClaveDeOrden = { sku: string | null; name: string };

/**
 * SKU numérico descendente. Lo que no tiene SKU usable va al final, y el empate
 * lo resuelve el nombre para que la paginación sea estable.
 */
export function compararProductos(a: ClaveDeOrden, b: ClaveDeOrden): number {
  const sa = valorSku(a.sku);
  const sb = valorSku(b.sku);
  if (sa !== sb) {
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  }
  return a.name.localeCompare(b.name, "es");
}

/**
 * El SKU que le toca al próximo producto: el número más alto que ya existe, más
 * uno. Se calcula sobre TODOS los productos, incluidos los desactivados — un
 * producto desactivado sigue siendo dueño de su SKU, y el POST rechaza el
 * duplicado igual.
 *
 * Es una sugerencia, no una reserva: el campo del formulario se puede editar y
 * dos altas simultáneas pueden proponer el mismo número. Quien llegue segundo se
 * lleva el 409 de la ruta, que es la única garantía real de unicidad.
 */
export function siguienteSku(skus: (string | null)[]): string {
  const numeros = skus.map(valorSku).filter((n): n is number => n !== null);
  return String((numeros.length ? Math.max(...numeros) : 0) + 1);
}
