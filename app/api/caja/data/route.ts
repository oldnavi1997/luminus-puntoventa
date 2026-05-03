import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const hoyInicio = new Date(`${today}T00:00:00-05:00`);

  const [configTienda, configAlmacen] = await Promise.all([
    prisma.cajaConfig.findUnique({ where: { id: "tienda" } }),
    prisma.cajaConfig.findUnique({ where: { id: "almacen" } }),
  ]);

  const retiroTiendaAt = configTienda?.lastRetiroAt ?? null;
  const retiroAlmacenAt = configAlmacen?.lastRetiroAt ?? null;

  const [
    tEfectivo, tEfectivoPartial, tMixtoEfectivo, tSaldosPostRetiro,
    aEfectivo, aEfectivoPartial, aMixtoEfectivo, aSaldosPostRetiro,
    retirosTiendaRaw, retirosAlmacenRaw,
  ] = await Promise.all([
    prisma.saleDocument.aggregate({
      where: {
        location: "TIENDA",
        paymentMethod: "EFECTIVO",
        status: { notIn: ["VOIDED", "VOID_PENDING", "PARTIAL"] },
        ...(retiroTiendaAt ? { createdAt: { gt: retiroTiendaAt } } : {}),
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location: "TIENDA",
        paymentMethod: "EFECTIVO",
        status: "PARTIAL",
        ...(retiroTiendaAt ? { createdAt: { gt: retiroTiendaAt } } : {}),
      },
      _sum: { montoAdelanto: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location: "TIENDA",
        paymentMethod: "MIXTO",
        status: { notIn: ["VOIDED", "VOID_PENDING"] },
        ...(retiroTiendaAt ? { createdAt: { gt: retiroTiendaAt } } : {}),
      },
      _sum: { montoEfectivo: true },
    }),
    prisma.saleDocument.aggregate({
      where: retiroTiendaAt ? {
        location: "TIENDA",
        status: "ACCEPTED",
        montoAdelanto: { not: null },
        saldoPaymentMethod: "EFECTIVO",
        createdAt: { lte: retiroTiendaAt },
        saldoCobradoEn: { gt: retiroTiendaAt },
      } : { id: { equals: "" } },
      _sum: { total: true, montoAdelanto: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location: "ALMACEN",
        paymentMethod: "EFECTIVO",
        status: { notIn: ["VOIDED", "VOID_PENDING", "PARTIAL"] },
        ...(retiroAlmacenAt ? { createdAt: { gt: retiroAlmacenAt } } : {}),
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location: "ALMACEN",
        paymentMethod: "EFECTIVO",
        status: "PARTIAL",
        ...(retiroAlmacenAt ? { createdAt: { gt: retiroAlmacenAt } } : {}),
      },
      _sum: { montoAdelanto: true },
      _count: { id: true },
    }),
    prisma.saleDocument.aggregate({
      where: {
        location: "ALMACEN",
        paymentMethod: "MIXTO",
        status: { notIn: ["VOIDED", "VOID_PENDING"] },
        ...(retiroAlmacenAt ? { createdAt: { gt: retiroAlmacenAt } } : {}),
      },
      _sum: { montoEfectivo: true },
    }),
    prisma.saleDocument.aggregate({
      where: retiroAlmacenAt ? {
        location: "ALMACEN",
        status: "ACCEPTED",
        montoAdelanto: { not: null },
        saldoPaymentMethod: "EFECTIVO",
        createdAt: { lte: retiroAlmacenAt },
        saldoCobradoEn: { gt: retiroAlmacenAt },
      } : { id: { equals: "" } },
      _sum: { total: true, montoAdelanto: true },
    }),
    prisma.cajaRetiro.findMany({
      where: { createdAt: { gte: hoyInicio }, location: "TIENDA" },
      include: { registradoPor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cajaRetiro.findMany({
      where: { createdAt: { gte: hoyInicio }, location: "ALMACEN" },
      include: { registradoPor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const tiendaEfectivoVentas = Number(tEfectivo._sum.total ?? 0)
                             + Number(tEfectivoPartial._sum.montoAdelanto ?? 0)
                             + Number(tMixtoEfectivo._sum.montoEfectivo ?? 0)
                             + Number(tSaldosPostRetiro._sum.total ?? 0)
                             - Number(tSaldosPostRetiro._sum.montoAdelanto ?? 0);
  const tiendaCount = tEfectivo._count.id + tEfectivoPartial._count.id;

  const almacenEfectivoVentas = Number(aEfectivo._sum.total ?? 0)
                              + Number(aEfectivoPartial._sum.montoAdelanto ?? 0)
                              + Number(aMixtoEfectivo._sum.montoEfectivo ?? 0)
                              + Number(aSaldosPostRetiro._sum.total ?? 0)
                              - Number(aSaldosPostRetiro._sum.montoAdelanto ?? 0);
  const almacenCount = aEfectivo._count.id + aEfectivoPartial._count.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRetiro = (r: any) => ({
    id: r.id as string,
    montoRetirado: Number(r.montoRetirado),
    fondoQueQueda: Number(r.fondoQueQueda),
    location: r.location as string,
    createdAt: (r.createdAt as Date).toISOString(),
    registradoPor: r.registradoPor as { name: string | null; email: string },
  });

  return NextResponse.json({
    tienda: {
      efectivoVentas: tiendaEfectivoVentas,
      fondoActual: Number(configTienda?.lastRetiroFondo ?? 0),
      ultimoRetiroAt: configTienda?.lastRetiroAt?.toISOString() ?? null,
      nextOverride: configTienda?.nextOpeningOverride != null
        ? Number(configTienda.nextOpeningOverride)
        : null,
      countVentasEfectivo: tiendaCount,
      retiros: retirosTiendaRaw.map(mapRetiro),
    },
    almacen: {
      efectivoVentas: almacenEfectivoVentas,
      fondoActual: Number(configAlmacen?.lastRetiroFondo ?? 0),
      ultimoRetiroAt: configAlmacen?.lastRetiroAt?.toISOString() ?? null,
      nextOverride: null,
      countVentasEfectivo: almacenCount,
      retiros: retirosAlmacenRaw.map(mapRetiro),
    },
  });
}
