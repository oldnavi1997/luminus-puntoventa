/**
 * Devolver el stock y descontar la caja de una venta que se deshace.
 *
 * Vivía dentro del `DELETE` de `/api/ventas/[id]`, y la anulación necesita
 * exactamente lo mismo. Duplicarlo habría dejado dos copias de unas reglas que
 * ya están probadas en producción y que es fácil desincronizar; extraerlo hace
 * imposible que los dos caminos hagan cosas distintas.
 *
 * Esto NO decide *qué* documento se revierte, sólo lo revierte. Quién tiene el
 * movimiento —el comprobante o la nota de venta de la que salió— lo resuelve
 * `documentoConElMovimiento`, porque la respuesta es distinta al borrar que al
 * anular.
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { naceDeConversion, origenDeConversion } from "@/lib/conversion";
import { devolverAccesorios } from "@/lib/accesorios-venta";

export interface VentaAReverir {
  id: string;
  fullNumber: string;
  cashierId: string;
  channel: string;
  location: string;
  posSessionId: string | null;
  paymentMethod: string;
  total: Prisma.Decimal | number;
  montoAdelanto: Prisma.Decimal | number | null;
  montoEfectivo: Prisma.Decimal | number | null;
  montoTarjeta: Prisma.Decimal | number | null;
  montoYape: Prisma.Decimal | number | null;
  items: { productId: string; quantity: number; product: { trackInventory: boolean } }[];
}

export interface ResultadoReversion {
  stock: boolean;
  caja: boolean;
  /** Estuches/líquidos devueltos: también hay que avisar al buscador web. */
  accesorios: string[];
  /** Por qué se dejó algo sin revertir, para poder decirlo en vez de callarlo. */
  motivos: string[];
}

/**
 * Devuelve el stock a su sitio y descuenta la venta de la sesión de caja.
 *
 * Se llama dentro de una transacción de quien la usa: al anular tiene que ir en
 * el mismo `$transaction` que marca el documento como anulado, o un fallo a
 * medias dejaría el stock devuelto y el comprobante todavía vigente.
 *
 * `userId` firma el reingreso de los accesorios; sin él (la anulación la cierra
 * el poller de tickets, sin nadie detrás) queda a nombre de quien cobró.
 */
export async function revertirStockYCaja(
  tx: Prisma.TransactionClient,
  doc: VentaAReverir,
  userId: string = doc.cashierId,
): Promise<ResultadoReversion> {
  const motivos: string[] = [];
  let accesorios: string[] = [];

  // Una venta web salió de almacén y/o tienda según el desglose que guarda la
  // orden; aquí no se conoce y devolverlo todo a tienda descuadraría las dos
  // ubicaciones. El ecommerce es el único dueño de ese flujo.
  const esWeb = doc.channel === "WEB";
  if (esWeb) {
    motivos.push("Es una venta web: el stock se ajusta desde el panel del ecommerce.");
  }

  if (!esWeb) {
    for (const item of doc.items) {
      if (!item.product.trackInventory) continue;

      if (doc.location === "ALMACEN") {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockAlmacen: { increment: item.quantity }, stock: { increment: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockTienda: { increment: item.quantity }, stock: { increment: item.quantity } },
        });
      }
    }

    accesorios = await devolverAccesorios(tx, doc, userId);
  }

  if (!doc.posSessionId) {
    return { stock: !esWeb, caja: false, accesorios, motivos };
  }

  // En una venta con adelanto (PARTIAL) sólo se registró el adelanto en la
  // sesión; en el resto, el total.
  const montoRegistrado =
    doc.montoAdelanto != null ? Number(doc.montoAdelanto) : Number(doc.total);

  const decremento: Record<string, unknown> = {
    totalVentas: { decrement: montoRegistrado },
    countVentas: { decrement: 1 },
  };

  if (doc.paymentMethod === "MIXTO") {
    if (Number(doc.montoEfectivo) > 0) decremento.totalEfectivo = { decrement: Number(doc.montoEfectivo) };
    if (Number(doc.montoTarjeta) > 0) decremento.totalTarjeta = { decrement: Number(doc.montoTarjeta) };
    if (Number(doc.montoYape) > 0) decremento.totalYape = { decrement: Number(doc.montoYape) };
  } else {
    if (doc.paymentMethod === "EFECTIVO") decremento.totalEfectivo = { decrement: montoRegistrado };
    if (doc.paymentMethod === "TARJETA") decremento.totalTarjeta = { decrement: montoRegistrado };
    if (doc.paymentMethod === "YAPE") decremento.totalYape = { decrement: montoRegistrado };
  }

  await tx.posSession.update({ where: { id: doc.posSessionId }, data: decremento });

  return { stock: !esWeb, caja: true, accesorios, motivos };
}

/** Lo que hace falta para saber dónde vive el movimiento de una venta. */
export interface DocumentoConOrigen {
  id: string;
  notes: string | null;
}

/**
 * El documento que de verdad movió el stock y la caja.
 *
 * En el flujo habitual del POS —cobrar como nota de venta y convertirla— el
 * movimiento pertenece a la NOTA, no al comprobante: la conversión no descuenta
 * nada. Así que anular el comprobante y revertir contra él no devolvería nada,
 * y revertir sin tocar la nota dejaría a la nota reclamando un stock que ya
 * volvió. Por eso se busca el origen.
 *
 * Devuelve `null` si la nota de origen no aparece, que no debería pasar pero
 * tampoco puede tumbar la anulación: la baja ante SUNAT vale por sí sola.
 */
export async function documentoConElMovimiento(
  tx: Prisma.TransactionClient,
  doc: DocumentoConOrigen,
): Promise<{ id: string; esOrigen: boolean } | null> {
  if (!naceDeConversion(doc.notes)) return { id: doc.id, esOrigen: false };

  const fullNumberOrigen = origenDeConversion(doc.notes);
  if (!fullNumberOrigen) return null;

  const origen = await tx.saleDocument.findFirst({
    where: { fullNumber: fullNumberOrigen },
    select: { id: true },
  });

  return origen ? { id: origen.id, esOrigen: true } : null;
}
