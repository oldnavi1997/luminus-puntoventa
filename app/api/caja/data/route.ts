import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularEfectivoDisponible } from "@/lib/cash-flow";

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

  const [
    tiendaCash, almacenCash,
    retirosTiendaRaw, retirosAlmacenRaw,
  ] = await Promise.all([
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
