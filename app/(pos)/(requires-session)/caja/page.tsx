import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CajaView } from "@/components/caja/CajaView";
import { CajaAdminView } from "@/components/caja/CajaAdminView";
import { calcularEfectivoDisponible } from "@/lib/cash-flow";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Admin y Supervisor: vista global de todas las sesiones
  if (session.user.role === "ADMIN") {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const hoyInicio = new Date(`${today}T00:00:00-05:00`);

    // 1. Obtener configs por ubicación
    const [configTienda, configAlmacen] = await Promise.all([
      prisma.cajaConfig.findUnique({ where: { id: "tienda" } }),
      prisma.cajaConfig.findUnique({ where: { id: "almacen" } }),
    ]);

    // 2. Datos en paralelo
    const [
      sesionesAbiertas,
      sesionesCerradasRaw,
      tiendaCash,
      almacenCash,
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
      calcularEfectivoDisponible({
        location: "TIENDA",
        retiroAt: configTienda?.lastRetiroAt ?? null,
        fondoAnterior: Number(configTienda?.lastRetiroFondo ?? 0),
      }),
      calcularEfectivoDisponible({
        location: "ALMACEN",
        retiroAt: configAlmacen?.lastRetiroAt ?? null,
        fondoAnterior: Number(configAlmacen?.lastRetiroFondo ?? 0),
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

    const tiendaEfectivoVentas = tiendaCash.efectivoVentas;
    const tiendaCount = tiendaCash.countVentasEfectivo;
    const almacenEfectivoVentas = almacenCash.efectivoVentas;
    const almacenCount = almacenCash.countVentasEfectivo;

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
