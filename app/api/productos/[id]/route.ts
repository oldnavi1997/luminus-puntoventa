import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const { name, sku, brand, price, storePrice, stock, stockTienda, stockAlmacen, trackInventory, active } = body;

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

  return NextResponse.json({
    product: {
      ...product,
      price:      Number(product.price),
      storePrice: product.storePrice != null ? Number(product.storePrice) : null,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    // Tiene ventas asociadas → soft delete
    await prisma.product.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true, softDeleted: true });
  }
}
