import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reindexarTrasResponder } from "@/lib/reindex-ecommerce";

/** Código de error de Prisma, para separar el "no existe" del fallo de verdad. */
function codigoPrisma(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const { name, sku, brand, price, storePrice, stock, stockTienda, stockAlmacen, trackInventory, active } = body;

  try {
    const skuTrim = sku?.trim();
    if (skuTrim) {
      const dup = await prisma.product.findFirst({ where: { sku: skuTrim, NOT: { id } } });
      if (dup) return NextResponse.json({ error: "Ya existe un producto con ese SKU" }, { status: 409 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name         !== undefined && { name }),
        ...(sku          !== undefined && { sku: sku || null }),
        ...(brand        !== undefined && { brand: brand || null }),
        ...(price        !== undefined && { price: Number(price) }),
        ...(storePrice   !== undefined && { storePrice: storePrice !== "" && storePrice !== null ? Number(storePrice) : null }),
        ...(stock        !== undefined && { stock: Number(stock) }),
        ...(stockTienda  !== undefined && { stockTienda: Number(stockTienda) }),
        ...(stockAlmacen !== undefined && { stockAlmacen: Number(stockAlmacen) }),
        ...(trackInventory !== undefined && { trackInventory: Boolean(trackInventory) }),
        ...(active       !== undefined && { active: Boolean(active) }),
      },
    });

    // Después de responder: esperar el aviso al buscador dejaba al cliente
    // colgado hasta 5 s con el producto ya guardado (ver reindex-ecommerce).
    await reindexarTrasResponder([id]);

    return NextResponse.json({
      product: {
        ...product,
        price:      Number(product.price),
        storePrice: product.storePrice != null ? Number(product.storePrice) : null,
      },
    });
  } catch (e) {
    // Sin este catch, cualquier fallo salía como un 500 sin cuerpo y el cliente
    // solo podía mostrar "No se pudo guardar", sin decir por qué.
    const code = codigoPrisma(e);
    if (code === "P2025") return NextResponse.json({ error: "El producto ya no existe" }, { status: 404 });
    if (code === "P2002") return NextResponse.json({ error: "Ya existe un producto con ese SKU" }, { status: 409 });
    console.error("[productos PATCH] fallo no previsto", e);
    return NextResponse.json({ error: "No se pudo guardar el producto" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  // Da igual cuál de los dos caminos se tome: el ecommerce mira el id en la base
  // y, si ya no está o quedó inactivo, lo saca de su buscador. Sin esto el
  // producto seguía apareciendo allí, con precio viejo y llevando a un 404.
  try {
    await prisma.product.delete({ where: { id } });
    await reindexarTrasResponder([id]);
    return NextResponse.json({ ok: true });
  } catch {
    // Tiene ventas asociadas → soft delete
    try {
      await prisma.product.update({ where: { id }, data: { active: false } });
      await reindexarTrasResponder([id]);
      return NextResponse.json({ ok: true, softDeleted: true });
    } catch (e) {
      if (codigoPrisma(e) === "P2025") return NextResponse.json({ error: "El producto ya no existe" }, { status: 404 });
      console.error("[productos DELETE] fallo no previsto", e);
      return NextResponse.json({ error: "No se pudo eliminar el producto" }, { status: 500 });
    }
  }
}
