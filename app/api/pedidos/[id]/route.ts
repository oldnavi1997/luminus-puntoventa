import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });

  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  return NextResponse.json({
    order: {
      ...order,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      discount: Number(order.discount),
      total: Number(order.total),
      items: order.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.product?.name ?? "Producto",
        image: it.product?.images?.[0] ?? null,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        lensPrice: it.lensPrice != null ? Number(it.lensPrice) : null,
        total: Number(it.total),
        lensType: it.lensType,
        prescriptionUrl: it.prescriptionUrl,
      })),
    },
  });
}
