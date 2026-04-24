import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CajaView } from "@/components/caja/CajaView";
import { CajaAdminView } from "@/components/caja/CajaAdminView";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Admin y Supervisor: vista global de todas las sesiones
  if (session.user.role === "ADMIN" || session.user.role === "SUPERVISOR") {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const hoyInicio = new Date(`${today}T00:00:00-05:00`);

    // 1. Obtener configs por ubicación
    const [configTienda, configAlmacen] = await Promise.all([
      prisma.cajaConfig.findUnique({ where: { id: "tienda" } }),
      prisma.cajaConfig.findUnique({ where: { id: "almacen" } }),
    ]);

    const retiroTiendaAt  = configTienda?.lastRetiroAt  ?? null;
    const retiroAlmacenAt = configAlmacen?.lastRetiroAt ?? null;

    // 2. Datos en paralelo
    const [
      sesionesAbiertas,
      sesionesCerradasRaw,
      tEfectivo,
      tEfectivoPartial,
      tMixtoEfectivo,
      aEfectivo,
      aEfectivoPartial,
      aMixtoEfectivo,
      retirosTiendaRaw,
      retirosAlmacenRaw,
    ] = await Promise.all([
      prisma.posSession.findMany({
        where: { status: "OPEN" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { openedAt: "asc" },
      }),
      prisma.posSession.findMany({
        where: { status: "CLOSED", closedAt: { gte: hoyInicio } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { closedAt: "desc" },
      }),
      // TIENDA: efectivo ventas completas
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
      // TIENDA: adelantos PARTIAL
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
      // TIENDA: porción efectivo MIXTO
      prisma.saleDocument.aggregate({
        where: {
          location: "TIENDA",
          paymentMethod: "MIXTO",
          status: { notIn: ["VOIDED", "VOID_PENDING"] },
          ...(retiroTiendaAt ? { createdAt: { gt: retiroTiendaAt } } : {}),
        },
        _sum: { montoEfectivo: true },
      }),
      // ALMACEN: efectivo ventas completas
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
      // ALMACEN: adelantos PARTIAL
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
      // ALMACEN: porción efectivo MIXTO
      prisma.saleDocument.aggregate({
        where: {
          location: "ALMACEN",
          paymentMethod: "MIXTO",
          status: { notIn: ["VOIDED", "VOID_PENDING"] },
          ...(retiroAlmacenAt ? { createdAt: { gt: retiroAlmacenAt } } : {}),
        },
        _sum: { montoEfectivo: true },
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
                               + Number(tMixtoEfectivo._sum.montoEfectivo ?? 0);
    const tiendaCount = tEfectivo._count.id + tEfectivoPartial._count.id;

    const almacenEfectivoVentas = Number(aEfectivo._sum.total ?? 0)
                                + Number(aEfectivoPartial._sum.montoAdelanto ?? 0)
                                + Number(aMixtoEfectivo._sum.montoEfectivo ?? 0);
    const almacenCount = aEfectivo._count.id + aEfectivoPartial._count.id;

    const sesiones = sesionesAbiertas.map((s) => ({
      id: s.id,
      status: "OPEN" as const,
      openedAt: s.openedAt.toISOString(),
      openingBalance: Number(s.openingBalance),
      totalEfectivo: Number(s.totalEfectivo),
      totalTarjeta: Number(s.totalTarjeta),
      totalYape: Number(s.totalYape),
      totalVentas: Number(s.totalVentas),
      countVentas: s.countVentas,
      user: s.user,
    }));

    const sesionesCerradas = sesionesCerradasRaw.map((s) => ({
      id: s.id,
      status: "CLOSED" as const,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt!.toISOString(),
      openingBalance: Number(s.openingBalance),
      closingBalance: Number(s.closingBalance),
      totalEfectivo: Number(s.totalEfectivo),
      totalTarjeta: Number(s.totalTarjeta),
      totalYape: Number(s.totalYape),
      totalVentas: Number(s.totalVentas),
      countVentas: s.countVentas,
      user: s.user,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapRetiro = (r: any) => ({
      id: r.id as string,
      montoRetirado: Number(r.montoRetirado),
      fondoQueQueda: Number(r.fondoQueQueda),
      location: r.location as string,
      createdAt: (r.createdAt as Date).toISOString(),
      registradoPor: r.registradoPor as { name: string | null; email: string },
    });

    return (
      <CajaAdminView
        sesiones={sesiones}
        sesionesCerradas={sesionesCerradas}
        tienda={{
          efectivoVentas: tiendaEfectivoVentas,
          fondoActual: Number(configTienda?.lastRetiroFondo ?? 0),
          ultimoRetiroAt: configTienda?.lastRetiroAt?.toISOString() ?? null,
          nextOverride: configTienda?.nextOpeningOverride != null
            ? Number(configTienda.nextOpeningOverride)
            : null,
          countVentasEfectivo: tiendaCount,
          retiros: retirosTiendaRaw.map(mapRetiro),
        }}
        almacen={{
          efectivoVentas: almacenEfectivoVentas,
          fondoActual: Number(configAlmacen?.lastRetiroFondo ?? 0),
          ultimoRetiroAt: configAlmacen?.lastRetiroAt?.toISOString() ?? null,
          countVentasEfectivo: almacenCount,
          retiros: retirosAlmacenRaw.map(mapRetiro),
        }}
      />
    );
  }

  // Cajero/Supervisor: arqueo de su propia sesión
  const posSession = session.user.posSessionId
    ? await prisma.posSession.findUnique({
        where: { id: session.user.posSessionId },
        include: { user: { select: { name: true } } },
      })
    : null;

  const sessionData = posSession
    ? {
        id:             posSession.id,
        openedAt:       posSession.openedAt.toISOString(),
        openingBalance: Number(posSession.openingBalance),
        totalEfectivo:  Number(posSession.totalEfectivo),
        totalTarjeta:   Number(posSession.totalTarjeta),
        totalYape:      Number(posSession.totalYape),
        totalVentas:    Number(posSession.totalVentas),
        countVentas:    posSession.countVentas,
        cashierName:    posSession.user.name ?? session.user.email,
      }
    : null;

  return <CajaView session={sessionData} />;
}
