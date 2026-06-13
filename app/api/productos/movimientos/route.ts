import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const { tipo, items, nota } = body;

  if (tipo !== "INGRESO" && tipo !== "TRASLADO") {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Agregá al menos un producto" }, { status: 400 });
  }
  const parsed: { productId: string; cantidad: number }[] = [];
  for (const it of items) {
    const cant = Number(it?.cantidad);
    if (!it?.productId || !Number.isInteger(cant) || cant <= 0) {
      return NextResponse.json({ error: "Cada producto debe tener una cantidad entera mayor a 0" }, { status: 400 });
    }
    parsed.push({ productId: String(it.productId), cantidad: cant });
  }

  const notaTrim = typeof nota === "string" && nota.trim() ? nota.trim() : null;

  try {
    await prisma.$transaction(async (tx) => {
      const ids = parsed.map((p) => p.productId);
      const products = await tx.product.findMany({ where: { id: { in: ids } } });

      for (const item of parsed) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) throw { status: 404, message: "Producto no encontrado" };
        if (!product.trackInventory) {
          throw { status: 400, message: `"${product.name}" no controla inventario` };
        }
        if (tipo === "TRASLADO" && product.stockAlmacen < item.cantidad) {
          throw { status: 422, message: `Stock insuficiente en almacén para "${product.name}" (disponible: ${product.stockAlmacen})` };
        }

        const updated = await tx.product.update({
          where: { id: item.productId },
          data: tipo === "INGRESO"
            ? { stockAlmacen: { increment: item.cantidad }, stock: { increment: item.cantidad } }
            : { stockAlmacen: { decrement: item.cantidad }, stockTienda: { increment: item.cantidad } },
        });

        await tx.stockMovimiento.create({
          data: {
            productId: item.productId,
            tipo,
            cantidad: item.cantidad,
            stockAlmacenResultante: updated.stockAlmacen,
            stockTiendaResultante: updated.stockTienda,
            userId: session.user.id,
            nota: notaTrim,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, count: parsed.length });
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "No se pudo registrar el movimiento" }, { status: 500 });
  }
}
