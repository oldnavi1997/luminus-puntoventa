import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus } from "@/app/generated/prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const docs = await prisma.saleDocument.findMany({
    where: { status: DocumentStatus.PARTIAL },
    orderBy: { createdAt: "desc" },
    include: {
      cashier: { select: { name: true } },
      items: {
        include: { product: { select: { sku: true } } },
      },
    },
  });

  const serialized = docs.map((d) => ({
    id: d.id,
    fullNumber: d.fullNumber,
    type: d.type,
    status: d.status,
    paymentMethod: d.paymentMethod,
    total: Number(d.total),
    montoAdelanto: d.montoAdelanto ? Number(d.montoAdelanto) : 0,
    saldoPendiente: Number(d.total) - (d.montoAdelanto ? Number(d.montoAdelanto) : 0),
    buyerName: d.buyerName,
    buyerDocNumber: d.buyerDocNumber,
    createdAt: d.createdAt.toISOString(),
    cashier: { name: d.cashier.name },
    items: d.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      sku: i.product.sku ?? null,
    })),
  }));

  return NextResponse.json({ docs: serialized });
}
