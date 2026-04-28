import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const inicio = new Date(`${date}T00:00:00-05:00`);
  const fin = new Date(`${date}T23:59:59.999-05:00`);

  const retiros = await prisma.cajaRetiro.findMany({
    where: { createdAt: { gte: inicio, lte: fin } },
    include: { registradoPor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    retiros: retiros.map((r) => ({
      id: r.id,
      montoRetirado: Number(r.montoRetirado),
      fondoQueQueda: Number(r.fondoQueQueda),
      location: r.location,
      createdAt: r.createdAt.toISOString(),
      registradoPor: r.registradoPor,
    })),
  });
}
