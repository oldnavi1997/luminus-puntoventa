import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const openSessions = await prisma.posSession.findMany({
    where: { status: "OPEN" },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { openedAt: "asc" },
  });

  return NextResponse.json({
    open: openSessions.map((s) => ({
      id: s.id,
      userName: s.user.name ?? s.user.email,
      userEmail: s.user.email,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString(),
      openingBalance: Number(s.openingBalance),
      closingBalance: s.closingBalance ? Number(s.closingBalance) : undefined,
      totalEfectivo: Number(s.totalEfectivo),
      totalTarjeta: Number(s.totalTarjeta),
      totalYape: Number(s.totalYape),
      countVentas: s.countVentas,
      status: s.status,
    })),
  });
}
