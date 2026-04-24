import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const start = new Date(`${date}T00:00:00-05:00`);
  const end   = new Date(`${date}T23:59:59.999-05:00`);

  const sesiones = await prisma.posSession.findMany({
    where: { status: "CLOSED", closedAt: { gte: start, lte: end } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { closedAt: "desc" },
  });

  return NextResponse.json({
    sesiones: sesiones.map((s) => ({
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
    })),
  });
}
