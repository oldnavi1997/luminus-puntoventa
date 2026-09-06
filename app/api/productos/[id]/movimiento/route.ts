import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reindexarTrasResponder } from "@/lib/reindex-ecommerce";
import {
  esTipoMovimiento,
  dataDe,
  whereConStock,
  ORIGEN_DE,
  ORIGEN_LABEL,
  esCarreraDeStock,
  esFalloDeMovimiento,
  movimientoGemeloReciente,
  haceSegundos,
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
  const { tipo, cantidad, nota, forzar } = body;

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

      // Antes de sumar nada: si ya hay uno igual recién hecho, esto huele a
      // reintento de algo que sí se guardó (ver VENTANA_DUPLICADO_MS). Se
      // devuelve para que el cliente pregunte, en vez de duplicar el stock.
      if (forzar !== true) {
        const gemelo = await movimientoGemeloReciente(
          tx,
          { productId: id, tipo, cantidad: cant, userId: session.user.id }
        );
        if (gemelo) {
          throw {
            status: 409,
            duplicadoProbable: true,
            message:
              `Hace ${haceSegundos(gemelo.createdAt)} s ya registraste este mismo movimiento ` +
              `(${cant} unidades de "${product.name}"). Si el anterior te dio error, igual se guardó.`,
          };
        }
      }

      let updated;
      try {
        // La condición de stock viaja dentro del where (ver lib/stock-movimiento):
        // el chequeo de arriba da el mensaje lindo, este evita el negativo.
        updated = await tx.product.update({
          where: whereConStock(id, tipo, cant),
          data: dataDe(tipo, cant),
        });
      } catch (e) {
        if (esCarreraDeStock(e) && origen) {
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

    // Después de responder: el aviso al buscador tarda hasta 5 s y el stock ya
    // está escrito. Esperarlo aquí era la ventana en la que el celular cortaba
    // por timeout y el cajero reintentaba un movimiento ya hecho.
    await reindexarTrasResponder([id]);

    return NextResponse.json({
      product: {
        ...result,
        price: Number(result.price),
        storePrice: result.storePrice != null ? Number(result.storePrice) : null,
      },
    });
  } catch (e) {
    if (esFalloDeMovimiento(e)) {
      return NextResponse.json(
        { error: e.message, ...(e.duplicadoProbable && { duplicadoProbable: true }) },
        { status: e.status }
      );
    }
    console.error("[movimiento] fallo no previsto", e);
    return NextResponse.json({ error: "No se pudo registrar el movimiento" }, { status: 500 });
  }
}
