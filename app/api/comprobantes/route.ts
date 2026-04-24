import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type");
  const status = searchParams.get("status");
  const date   = searchParams.get("date"); // YYYY-MM-DD
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (type   && type   !== "all") where.type   = type;
  if (status && status !== "all") where.status = status;
  if (date) {
    const d    = new Date(date + "T00:00:00Z");
    const next = new Date(date + "T00:00:00Z");
    next.setDate(next.getDate() + 1);
    where.createdAt = { gte: d, lt: next };
  }

  const docs = await prisma.saleDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fullNumber: true,
      serie: true,
      correlativo: true,
      type: true,
      status: true,
      total: true,
      buyerName: true,
      buyerDocNumber: true,
      paymentMethod: true,
      createdAt: true,
      pdfUrl: true,
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayDocs, notasHoy] = await Promise.all([
    prisma.saleDocument.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        type: { in: ["BOLETA", "FACTURA"] },
      },
      select: { total: true, status: true },
    }),
    prisma.saleDocument.count({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        type: "NOTA_VENTA",
      },
    }),
  ]);

  const totalAccepted = todayDocs
    .filter((d) => d.status === "ACCEPTED")
    .reduce((s, d) => s + Number(d.total), 0);

  return NextResponse.json({
    docs: docs.map((d) => ({
      ...d,
      total: Number(d.total),
      createdAt: d.createdAt.toISOString(),
    })),
    stats: {
      emitidosHoy: todayDocs.length,
      totalAceptado: totalAccepted,
      pendientes: todayDocs.filter((d) => d.status === "PENDING").length,
      rechazados: todayDocs.filter((d) => d.status === "REJECTED").length,
      notasHoy,
    },
  });
}
