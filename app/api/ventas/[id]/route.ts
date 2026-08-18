import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { z } from "zod";

const PatchSchema = z.object({
  buyerName: z.string().min(1).optional(),
  buyerPhone: z.string().optional(),
  notes: z.string().optional(),
  prescription: z.object({
    od: z.object({ sphere: z.string(), cylinder: z.string(), axis: z.string() }),
    oi: z.object({ sphere: z.string(), cylinder: z.string(), axis: z.string() }),
    add: z.string().optional(),
    pd:  z.string().optional(),
  }).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const doc = await prisma.saleDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  const updated = await prisma.saleDocument.update({
    where: { id },
    data: {
      ...(parsed.data.buyerName !== undefined && { buyerName: parsed.data.buyerName }),
      ...(parsed.data.buyerPhone !== undefined && { buyerPhone: parsed.data.buyerPhone }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes || null }),
      ...(parsed.data.prescription !== undefined && {
        prescription: parsed.data.prescription === null ? Prisma.JsonNull : parsed.data.prescription,
      }),
    },
  });

  return NextResponse.json({
    buyerName:    updated.buyerName,
    buyerPhone:   updated.buyerPhone,
    notes:        updated.notes,
    prescription: updated.prescription,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { id } = await params;

  const doc = await prisma.saleDocument.findUnique({
    where: { id },
    include: {
      items: { select: { productId: true, quantity: true, product: { select: { trackInventory: true } } } },
    },
  });
  if (!doc) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  // Una venta web salió de almacén y/o tienda según el desglose guardado en la
  // orden; esta reversión no lo conoce y devolvería todo a tienda. El ecommerce
  // es el único dueño de ese flujo.
  if (doc.channel === "WEB") {
    return NextResponse.json(
      { error: "Las ventas web se anulan desde el panel del ecommerce (Pedidos → Cancelar)." },
      { status: 422 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Restaurar stock
    for (const item of doc.items) {
      if (!item.product.trackInventory) continue;
      if (doc.location === "ALMACEN") {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockAlmacen: { increment: item.quantity }, stock: { increment: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockTienda: { increment: item.quantity }, stock: { increment: item.quantity } },
        });
      }
    }

    // Revertir totales de la sesión si el documento está vinculado a una
    if (doc.posSessionId) {
      // Para ventas con adelanto (PARTIAL): solo se registró el adelanto en sesión
      // Para el resto: se registró el total completo
      const montoRegistrado = doc.montoAdelanto != null
        ? Number(doc.montoAdelanto)
        : Number(doc.total);

      const sessionDecrement: Record<string, unknown> = {
        totalVentas: { decrement: montoRegistrado },
        countVentas: { decrement: 1 },
      };
      if (doc.paymentMethod === "MIXTO") {
        if (Number(doc.montoEfectivo) > 0) sessionDecrement.totalEfectivo = { decrement: Number(doc.montoEfectivo) };
        if (Number(doc.montoTarjeta)  > 0) sessionDecrement.totalTarjeta  = { decrement: Number(doc.montoTarjeta)  };
        if (Number(doc.montoYape)     > 0) sessionDecrement.totalYape     = { decrement: Number(doc.montoYape)     };
      } else {
        if (doc.paymentMethod === "EFECTIVO") sessionDecrement.totalEfectivo = { decrement: montoRegistrado };
        if (doc.paymentMethod === "TARJETA")  sessionDecrement.totalTarjeta  = { decrement: montoRegistrado };
        if (doc.paymentMethod === "YAPE")     sessionDecrement.totalYape     = { decrement: montoRegistrado };
      }

      await tx.posSession.update({
        where: { id: doc.posSessionId },
        data: sessionDecrement,
      });
    }

    await tx.saleDocument.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
