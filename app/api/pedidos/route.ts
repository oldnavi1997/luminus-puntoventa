import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const since = searchParams.get("since");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 60);
  const skip = (page - 1) * limit;

  const where = {
    ...(status ? { orderStatus: status as any } : {}),
    ...(since ? { createdAt: { gt: new Date(since) } } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      shippingName: o.shippingName,
      total: Number(o.total),
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      itemsCount: o._count.items,
      createdAt: o.createdAt,
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
