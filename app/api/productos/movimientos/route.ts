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

// Historial de movimientos. Mismo 403 que el POST: el módulo entero es de ADMIN.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const tipo = searchParams.get("tipo");
  const productId = searchParams.get("productId");

  // El historial crece sin borde, así que siempre va acotado.
  const pedido = Number(searchParams.get("limit") ?? 100);
  const limit = Math.min(Number.isFinite(pedido) && pedido > 0 ? pedido : 100, 300);

  const where: {
    tipo?: "INGRESO" | "TRASLADO" | "RETORNO";
    productId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = {};
  if (esTipoMovimiento(tipo)) where.tipo = tipo;
  if (productId) where.productId = productId;
  if (from || to) {
    // Las fechas llegan sueltas (YYYY-MM-DD) desde un input date y se
    // interpretan en Lima (-05:00), no en la zona del server: sin el offset
    // explícito el rango se corre 5 horas y arrastra parte del día anterior.
    // El `to` va al final del día o el filtro dejaría fuera todo ese día.
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000-05:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999-05:00`);
  }

  const movimientos = await prisma.stockMovimiento.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true, images: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ movimientos });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const { tipo, items, nota } = body;

  if (!esTipoMovimiento(tipo)) {
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
  if (new Set(parsed.map((p) => p.productId)).size !== parsed.length) {
    return NextResponse.json({ error: "Hay un producto repetido en el lote" }, { status: 400 });
  }
  // Ordenar por id hace que dos lotes simultáneos tomen los candados de fila en
  // el mismo orden, así no se traban entre sí.
  parsed.sort((a, b) => a.productId.localeCompare(b.productId));

  const notaTrim = typeof nota === "string" && nota.trim() ? nota.trim() : null;
  const origen = ORIGEN_DE[tipo];

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
        if (origen && product[origen] < item.cantidad) {
          throw {
            status: 422,
            message: `Stock insuficiente en ${ORIGEN_LABEL[origen]} para "${product.name}" (disponible: ${product[origen]})`,
          };
        }

        let updated;
        try {
          updated = await tx.product.update({
            where: whereConStock(item.productId, tipo, item.cantidad),
            data: dataDe(tipo, item.cantidad),
          });
        } catch (e: any) {
          // El where con la condición de stock no matcheó: otro movimiento se
          // llevó las unidades entre la lectura de arriba y este update.
          if (e?.code === "P2025" && origen) {
            throw {
              status: 409,
              message: `Otro movimiento tomó el stock de "${product.name}" mientras se registraba este. Volvé a intentar.`,
            };
          }
          throw e;
        }

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
