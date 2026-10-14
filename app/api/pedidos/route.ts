import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/app/generated/prisma/client";

const ORDER_STATUSES = [
  "PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED",
] as const satisfies readonly OrderStatus[];

function esOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const since = searchParams.get("since");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30") || 30, 60);
  const skip = (page - 1) * limit;

  const where = {
    ...(esOrderStatus(status) ? { orderStatus: status } : {}),
    ...(since ? { createdAt: { gt: new Date(since) } } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { items: true } },
        saleDocument: { select: { id: true, fullNumber: true, status: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      shippingName: o.shippingName,
      shippingPhone: o.shippingPhone,
      shippingCity: o.shippingCity,
      shippingProvince: o.shippingProvince,
      shippingCourier: o.shippingCourier,
      documentNumber: o.documentNumber,
      total: Number(o.total),
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      stockIssue: o.stockIssue,
      comprobanteId: o.saleDocument?.id ?? null,
      comprobante: o.saleDocument?.fullNumber ?? null,
      comprobanteStatus: o.saleDocument?.status ?? null,
      itemsCount: o._count.items,
      createdAt: o.createdAt,
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
