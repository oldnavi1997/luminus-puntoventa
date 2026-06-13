import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { tipo, cantidad, nota } = body;

  if (tipo !== "INGRESO" && tipo !== "TRASLADO") {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }
  const cant = Number(cantidad);
  if (!Number.isInteger(cant) || cant <= 0) {
    return NextResponse.json({ error: "La cantidad debe ser un entero mayor a 0" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw { status: 404, message: "Producto no encontrado" };
      if (!product.trackInventory) throw { status: 400, message: "Este producto no controla inventario" };

      if (tipo === "TRASLADO" && product.stockAlmacen < cant) {
        throw { status: 422, message: `Stock insuficiente en almacén (disponible: ${product.stockAlmacen})` };
      }

      const updated = await tx.product.update({
        where: { id },
        data: tipo === "INGRESO"
          ? { stockAlmacen: { increment: cant }, stock: { increment: cant } }
          : { stockAlmacen: { decrement: cant }, stockTienda: { increment: cant } },
      });

      await tx.stockMovimiento.create({
        data: {
          productId: id,
          tipo,
          cantidad: cant,
          stockAlmacenResultante: updated.stockAlmacen,
          stockTiendaResultante: updated.stockTienda,
          userId: session.user.id,
          nota: typeof nota === "string" && nota.trim() ? nota.trim() : null,
        },
      });

      return updated;
    });

    return NextResponse.json({
      product: {
        ...result,
        price: Number(result.price),
        storePrice: result.storePrice != null ? Number(result.storePrice) : null,
      },
    });
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "No se pudo registrar el movimiento" }, { status: 500 });
  }
}
