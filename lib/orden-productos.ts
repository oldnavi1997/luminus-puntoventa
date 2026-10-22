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
 * Columnas por las que el inventario deja ordenar. El orden por defecto sigue
 * siendo `compararProductos`; cualquier otro lo usa como desempate, así que la
 * paginación queda estable con cualquier columna.
 */
export const CAMPOS_ORDEN = [
  "sku", "nombre", "categoria", "marca", "precio", "precioTienda", "stockTienda", "stockAlmacen",
] as const;
export type CampoOrden = (typeof CAMPOS_ORDEN)[number];
export type DireccionOrden = "asc" | "desc";

export function esCampoOrden(v: string | null | undefined): v is CampoOrden {
  return (CAMPOS_ORDEN as readonly string[]).includes(v ?? "");
}

export type ClaveDeOrdenCompleta = ClaveDeOrden & {
  brand: string | null;
  categoria: string | null;
  price: number;
  storePrice: number | null;
  stockTienda: number;
  stockAlmacen: number;
  trackInventory: boolean;
};

type Valor = number | string | null;

/**
 * El valor de la columna tal como se ve en la tabla: lo que se muestra como «—»
 * vale null. Un producto sin control de inventario no tiene stock (la tabla lo
 * pinta «—»), y un precio web 0 tampoco se muestra.
 */
function valorDe(p: ClaveDeOrdenCompleta, campo: CampoOrden): Valor {
  switch (campo) {
    case "sku":          return valorSku(p.sku);
    case "nombre":       return p.name.trim() || null;
    case "categoria":    return p.categoria?.trim() || null;
    case "marca":        return p.brand?.trim() || null;
    case "precio":       return p.price > 0 ? p.price : null;
    case "precioTienda": return p.storePrice;
    case "stockTienda":  return p.trackInventory ? p.stockTienda : null;
    case "stockAlmacen": return p.trackInventory ? p.stockAlmacen : null;
  }
}

/**
 * Comparador para una columna y una dirección. Lo vacío va SIEMPRE al final, en
 * las dos direcciones: quien ordena por precio quiere ver precios, no una página
 * de guiones. El texto se compara en español y sin distinguir mayúsculas.
 */
export function comparadorDe(campo: CampoOrden, dir: DireccionOrden) {
  const signo = dir === "asc" ? 1 : -1;
  return (a: ClaveDeOrdenCompleta, b: ClaveDeOrdenCompleta): number => {
    const va = valorDe(a, campo);
    const vb = valorDe(b, campo);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "es", { sensitivity: "base", numeric: true });
      if (c !== 0) return signo * c;
    }
    return compararProductos(a, b);
  };
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
