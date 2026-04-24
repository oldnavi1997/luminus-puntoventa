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

    // 1º obtener config para saber desde cuándo acumular (último retiro)
    const config = await prisma.cajaConfig.findUnique({ where: { id: "main" } });
    const retiroAt = config?.lastRetiroAt ?? null;
    const fondoActual = Number(config?.lastRetiroFondo ?? 0);

    const [sesionesAbiertas, sesionesCerradasRaw, ventasEfectivo, retirosRaw] = await Promise.all([
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
      prisma.saleDocument.aggregate({
        where: {
          paymentMethod: "EFECTIVO",
          status: { notIn: ["VOIDED", "VOID_PENDING"] },
          ...(retiroAt ? { createdAt: { gt: retiroAt } } : {}),
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.cajaRetiro.findMany({
        where: { createdAt: { gte: hoyInicio } },
        include: { registradoPor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

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

    const nextOverride = config?.nextOpeningOverride != null
      ? Number(config.nextOpeningOverride)
      : null;

    const retiros = retirosRaw.map((r) => ({
      id: r.id,
      montoRetirado: Number(r.montoRetirado),
      fondoQueQueda: Number(r.fondoQueQueda),
      createdAt: r.createdAt.toISOString(),
      registradoPor: r.registradoPor,
    }));

    return (
      <CajaAdminView
        sesiones={sesiones}
        sesionesCerradas={sesionesCerradas}
        nextOverride={nextOverride}
        efectivoVentas={Number(ventasEfectivo._sum.total ?? 0)}
        countVentasEfectivo={ventasEfectivo._count.id}
        fondoActual={fondoActual}
        ultimoRetiroAt={retiroAt?.toISOString() ?? null}
        retiros={retiros}
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
