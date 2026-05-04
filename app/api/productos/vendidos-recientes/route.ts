import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const days     = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
  const location = req.nextUrl.searchParams.get("location") ?? "TIENDA";

  const since = new Date();
  since.setDate(since.getDate() - days);

  const items = await prisma.saleDocumentItem.findMany({
    where: {
      document: {
        status: { in: ["ACCEPTED", "PENDING", "PARTIAL"] },
        location,
        createdAt: { gte: since },
      },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          brand: true,
          price: true,
          storePrice: true,
          stockTienda: true,
          stockAlmacen: true,
          stock: true,
          trackInventory: true,
          active: true,
          images: true,
          color: true,
          categories: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const map = new Map<string, { product: (typeof items)[0]["product"]; totalVendido: number }>();
  for (const item of items) {
    const existing = map.get(item.productId);
    if (existing) {
      existing.totalVendido += item.quantity;
    } else {
      map.set(item.productId, { product: item.product, totalVendido: item.quantity });
    }
  }

  const products = [...map.values()]
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .map(({ product: p, totalVendido }) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      brand: p.brand,
      price: Number(p.price),
      storePrice: p.storePrice != null ? Number(p.storePrice) : null,
      stockTienda: p.stockTienda,
      stockAlmacen: p.stockAlmacen,
      stock: p.stock,
      trackInventory: p.trackInventory,
      active: p.active,
      images: p.images,
      color: p.color,
      categories: p.categories,
      totalVendido,
    }));

  return NextResponse.json({ products, total: products.length });
}
