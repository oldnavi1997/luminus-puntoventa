import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  esTipoMovimiento,
  dataDe,
  whereConStock,
  ORIGEN_DE,
  ORIGEN_LABEL,
} from "@/lib/stock-movimiento";

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

  if (!esTipoMovimiento(tipo)) {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }
  const cant = Number(cantidad);
  if (!Number.isInteger(cant) || cant <= 0) {
    return NextResponse.json({ error: "La cantidad debe ser un entero mayor a 0" }, { status: 400 });
  }

  const origen = ORIGEN_DE[tipo];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw { status: 404, message: "Producto no encontrado" };
      if (!product.trackInventory) throw { status: 400, message: "Este producto no controla inventario" };

      if (origen && product[origen] < cant) {
        throw {
          status: 422,
          message: `Stock insuficiente en ${ORIGEN_LABEL[origen]} (disponible: ${product[origen]})`,
        };
      }

      let updated;
      try {
        // La condición de stock viaja dentro del where (ver lib/stock-movimiento):
        // el chequeo de arriba da el mensaje lindo, este evita el negativo.
        updated = await tx.product.update({
          where: whereConStock(id, tipo, cant),
          data: dataDe(tipo, cant),
        });
      } catch (e: any) {
        if (e?.code === "P2025" && origen) {
          throw {
            status: 409,
            message: "Otro movimiento tomó el stock mientras se registraba este. Volvé a intentar.",
          };
        }
        throw e;
      }

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
