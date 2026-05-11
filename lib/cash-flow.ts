import { prisma } from "@/lib/prisma";

export interface CashFlowResult {
  efectivoVentas: number;
  efectivoDisponible: number;
  countVentasEfectivo: number;
}

/**
 * Calcula el efectivo físico esperado en caja para una ubicación dada,
 * considerando ventas en efectivo, adelantos en efectivo y saldos cobrados
 * en efectivo desde el último retiro.
 *
 * Reglas:
 *  - Venta EFECTIVO sin adelanto, ACCEPTED, creada después del retiro: suma `total`.
 *  - Venta EFECTIVO con adelanto (PARTIAL o ACCEPTED), creada después del retiro: suma `montoAdelanto`.
 *  - Cualquier venta con saldo cobrado en EFECTIVO después del retiro: suma `total - montoAdelanto`.
 *  - Cualquier venta con saldo cobrado en MIXTO después del retiro: suma `saldoMontoEfectivo`.
 *  - Venta MIXTO no anulada, creada después del retiro: suma `montoEfectivo`.
 *  - Excluye estados VOIDED y VOID_PENDING.
 */
export async function calcularEfectivoDisponible(opts: {
  location: "TIENDA" | "ALMACEN";
  retiroAt: Date | null;
  fondoAnterior: number;
}): Promise<CashFlowResult> {
  const { location, retiroAt, fondoAnterior } = opts;
  const since = retiroAt ? { createdAt: { gt: retiroAt } } : {};

  const [
    ventasEfectivoSinAdelanto,
    ventasEfectivoConAdelanto,
    ventasMixto,
    saldosCobradosEnEfectivo,
    saldosCobradosEnMixto,
  ] = await Promise.all([
    prisma.saleDocument.aggregate({
      where: {
        location,
        paymentMethod: "EFECTIVO",
        montoAdelanto: null,
        status: { notIn: ["VOIDED", "VOID_PENDING", "PARTIAL"] },
        ...since,
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location,
        paymentMethod: "EFECTIVO",
        montoAdelanto: { not: null },
        status: { notIn: ["VOIDED", "VOID_PENDING"] },
        ...since,
      },
      _sum: { montoAdelanto: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location,
        paymentMethod: "MIXTO",
        status: { notIn: ["VOIDED", "VOID_PENDING"] },
        ...since,
      },
      _sum: { montoEfectivo: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location,
        status: "ACCEPTED",
        saldoPaymentMethod: "EFECTIVO",
        ...(retiroAt ? { saldoCobradoEn: { gt: retiroAt } } : {}),
      },
      _sum: { total: true, montoAdelanto: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location,
        status: "ACCEPTED",
        saldoPaymentMethod: "MIXTO",
        ...(retiroAt ? { saldoCobradoEn: { gt: retiroAt } } : {}),
      },
      _sum: { saldoMontoEfectivo: true },
    }),
  ]);

  const efectivoVentas =
    Number(ventasEfectivoSinAdelanto._sum.total ?? 0) +
    Number(ventasEfectivoConAdelanto._sum.montoAdelanto ?? 0) +
    Number(ventasMixto._sum.montoEfectivo ?? 0) +
    Number(saldosCobradosEnEfectivo._sum.total ?? 0) -
    Number(saldosCobradosEnEfectivo._sum.montoAdelanto ?? 0) +
    Number(saldosCobradosEnMixto._sum.saldoMontoEfectivo ?? 0);

  const countVentasEfectivo =
    ventasEfectivoSinAdelanto._count.id + ventasEfectivoConAdelanto._count.id;

  return {
    efectivoVentas,
    efectivoDisponible: fondoAnterior + efectivoVentas,
    countVentasEfectivo,
  };
}
