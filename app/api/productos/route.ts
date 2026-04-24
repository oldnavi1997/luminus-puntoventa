import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? "";
  const stockFilter = searchParams.get("stockFilter") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "48"), 96);
  const skip = (page - 1) * limit;

  // Para SKU: también buscar sin ceros al inicio (ej: "0632" → "632")
  const qStripped = q.replace(/^0+/, "") || q;

  const where = {
    active: true,
    ...(q && {
      OR: [
        { name:  { contains: q, mode: "insensitive" as const } },
        { brand: { contains: q, mode: "insensitive" as const } },
        { sku:   { contains: q, mode: "insensitive" as const } },
        ...(qStripped !== q
          ? [{ sku: { contains: qStripped, mode: "insensitive" as const } }]
          : []),
      ],
    }),
    ...(categoryId && {
      categories: { some: { id: categoryId } },
    }),
    ...(stockFilter === "low" && { stock: { gt: 0, lte: 5 } }),
    ...(stockFilter === "out" && { stock: { equals: 0 } }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        categories: {
          select: { id: true, name: true, requiresLensSelection: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      price: Number(p.price),
      storePrice: p.storePrice != null ? Number(p.storePrice) : null,
      requiresLensSelection: p.categories.some((c) => c.requiresLensSelection),
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
