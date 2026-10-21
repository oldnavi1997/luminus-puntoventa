/**
 * Estuche y líquido limpiador que acompañan a una venta del POS.
 *
 * Una montura sale con su estuche, y ciertas lunas con su líquido. No se cobran
 * ni salen en el comprobante —declararlos a S/0 sería una transferencia
 * gratuita ante SUNAT—, pero sí salen de la vitrina, así que el inventario
 * tiene que bajar con la venta.
 *
 * Qué se descuenta lo deciden las marcas del producto vendido (`incluyeEstuche`,
 * `incluyeLiquido`); de dónde, el producto marcado con `accesorioVenta`. Cada
 * descuento deja un `StockMovimiento` ligado a la venta, y es ESO lo que se lee
 * para devolverlo al anular: lo que de verdad salió, no lo que digan hoy las
 * marcas, que pueden haber cambiado desde entonces.
 *
 * El faltante no bloquea la venta. El cliente ya se lleva la montura; que no
 * haya estuche registrado no puede impedir cobrarla. Se descuenta igual (el
 * stock queda negativo, que es lo que pasó físicamente o un ingreso que nadie
 * cargó) y se avisa.
 */

import type { AccesorioVenta, Prisma } from "@/app/generated/prisma/client";

export const ACCESORIO_LABEL: Record<AccesorioVenta, string> = {
  ESTUCHE: "Estuche",
  LIQUIDO: "Líquido limpiador",
};

export interface ItemConMarcas {
  quantity: number;
  product: {
    incluyeEstuche: boolean;
    incluyeLiquido: boolean;
    accesorioVenta: AccesorioVenta | null;
  };
}

/**
 * Unidades de cada accesorio que acompañan a estos ítems.
 *
 * Un accesorio vendido por sí mismo no arrastra otro: vender un estuche suelto
 * no regala un segundo estuche, se marque como se marque.
 */
export function accesoriosDeVenta(items: ItemConMarcas[]): Record<AccesorioVenta, number> {
  const total: Record<AccesorioVenta, number> = { ESTUCHE: 0, LIQUIDO: 0 };
  for (const { quantity, product } of items) {
    if (product.accesorioVenta) continue;
    if (product.incluyeEstuche) total.ESTUCHE += quantity;
    if (product.incluyeLiquido) total.LIQUIDO += quantity;
  }
  return total;
}

type Ubicacion = "TIENDA" | "ALMACEN";

function dataDe(ubicacion: Ubicacion, delta: number) {
  return ubicacion === "ALMACEN"
    ? { stockAlmacen: { increment: delta }, stock: { increment: delta } }
    : { stockTienda: { increment: delta }, stock: { increment: delta } };
}

/**
 * Descuenta los accesorios de una venta recién creada, dentro de su transacción.
 *
 * Devuelve los avisos para el cajero (accesorio sin stock) y los productos
 * tocados, para avisar al buscador de la web después del commit.
 */
export async function descontarAccesorios(
  tx: Prisma.TransactionClient,
  venta: {
    saleDocumentId: string;
    fullNumber: string;
    ubicacion: Ubicacion;
    userId: string;
    items: ItemConMarcas[];
  },
): Promise<{ avisos: string[]; productIds: string[] }> {
  const cantidades = accesoriosDeVenta(venta.items);
  const tipos = (Object.keys(cantidades) as AccesorioVenta[]).filter((t) => cantidades[t] > 0);
  if (tipos.length === 0) return { avisos: [], productIds: [] };

  // Un accesorio sin control de inventario no tiene stock que llevar: es lo
  // mismo que con cualquier otro producto de esos en una venta.
  const accesorios = await tx.product.findMany({
    where: { accesorioVenta: { in: tipos }, active: true, trackInventory: true },
  });

  const avisos: string[] = [];
  const productIds: string[] = [];

  for (const acc of accesorios) {
    const cantidad = cantidades[acc.accesorioVenta!];
    const actualizado = await tx.product.update({
      where: { id: acc.id },
      data: dataDe(venta.ubicacion, -cantidad),
    });

    await tx.stockMovimiento.create({
      data: {
        productId: acc.id,
        tipo: "ACCESORIO_POS",
        cantidad,
        stockAlmacenResultante: actualizado.stockAlmacen,
        stockTiendaResultante: actualizado.stockTienda,
        userId: venta.userId,
        saleDocumentId: venta.saleDocumentId,
        nota: `Acompaña a ${venta.fullNumber}`,
      },
    });

    const quedan = venta.ubicacion === "ALMACEN" ? actualizado.stockAlmacen : actualizado.stockTienda;
    if (quedan < 0) {
      const donde = venta.ubicacion === "ALMACEN" ? "almacén" : "tienda";
      avisos.push(`${acc.name}: sin stock en ${donde}, quedó en ${quedan}. Carga un ingreso.`);
    }
    productIds.push(acc.id);
  }

  return { avisos, productIds };
}

/**
 * Devuelve los accesorios que salieron con una venta que se deshace.
 *
 * Lee los movimientos `ACCESORIO_POS` de la venta y crea su reingreso. Si ya
 * tiene reingresos no hace nada: una venta no se deshace dos veces, pero si
 * alguna vez pasara, devolver de nuevo inflaría el stock.
 */
export async function devolverAccesorios(
  tx: Prisma.TransactionClient,
  venta: { id: string; fullNumber: string; location: string },
  userId: string,
): Promise<string[]> {
  const movimientos = await tx.stockMovimiento.findMany({
    where: { saleDocumentId: venta.id, tipo: { in: ["ACCESORIO_POS", "ANULACION_ACCESORIO_POS"] } },
  });
  if (movimientos.some((m) => m.tipo === "ANULACION_ACCESORIO_POS")) return [];

  const ubicacion: Ubicacion = venta.location === "ALMACEN" ? "ALMACEN" : "TIENDA";
  const productIds: string[] = [];

  for (const mov of movimientos) {
    const actualizado = await tx.product.update({
      where: { id: mov.productId },
      data: dataDe(ubicacion, mov.cantidad),
    });
    await tx.stockMovimiento.create({
      data: {
        productId: mov.productId,
        tipo: "ANULACION_ACCESORIO_POS",
        cantidad: mov.cantidad,
        stockAlmacenResultante: actualizado.stockAlmacen,
        stockTiendaResultante: actualizado.stockTienda,
        userId,
        saleDocumentId: venta.id,
        nota: `Vuelve de ${venta.fullNumber}`,
      },
    });
    productIds.push(mov.productId);
  }

  return productIds;
}
