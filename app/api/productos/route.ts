import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reindexarTrasResponder } from "@/lib/reindex-ecommerce";
import { compararProductos } from "@/lib/orden-productos";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const { name, sku, brand, price, storePrice, stockTienda, stockAlmacen, trackInventory, categoryId, incluyeEstuche, incluyeLiquido } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const skuTrim = sku?.trim() || null;
  if (skuTrim) {
    const dup = await prisma.product.findFirst({ where: { sku: skuTrim } });
    if (dup) return NextResponse.json({ error: "Ya existe un producto con ese SKU" }, { status: 409 });
  }

  const base   = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  const slug   = `${base}-${suffix}`;

  const tienda  = Number(stockTienda)  || 0;
  const almacen = Number(stockAlmacen) || 0;
  const track   = trackInventory !== false;

  const product = await prisma.product.create({
    data: {
      name:           name.trim(),
      slug,
      sku:            skuTrim,
      brand:          brand?.trim() || null,
      price:          price ? Number(price) : 0,
      storePrice:     storePrice ? Number(storePrice) : null,
      stockTienda:    tienda,
      stockAlmacen:   almacen,
      stock:          track ? tienda + almacen : 0,
      trackInventory: track,
      // Mismo criterio que el backfill: lo que lleva inventario es montura y
      // sale con estuche; una luna o un servicio, no.
      incluyeEstuche: incluyeEstuche !== undefined ? Boolean(incluyeEstuche) : track,
      incluyeLiquido: Boolean(incluyeLiquido),
      active:         true,
      ...(categoryId && {
        categories:       { connect: { id: categoryId } },
        primaryCategoryId: categoryId,
      }),
    },
    include: { categories: { select: { id: true, name: true } } },
  });

  await reindexarTrasResponder([product.id]);

  return NextResponse.json({
    product: {
      ...product,
      price:      Number(product.price),
      storePrice: product.storePrice != null ? Number(product.storePrice) : null,
    },
  }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? "";
  const stockFilter = searchParams.get("stockFilter") ?? "";
  // "activos" por defecto: /pos y /movimientos no mandan el parámetro y no deben
  // ver nunca lo desactivado. "inactivos" es la papelera del inventario —
  // borrar un producto con ventas no lo borra, lo desactiva (ver DELETE), y sin
  // esto no había forma de volver a verlo ni de reactivarlo desde el POS.
  const estado = searchParams.get("estado") ?? "activos";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "48"), 96);
  const skip = (page - 1) * limit;

  // Para SKU: también buscar sin ceros al inicio (ej: "0632" → "632")
  const qStripped = q.replace(/^0+/, "") || q;

  const where = {
    ...(estado === "todos" ? {} : { active: estado !== "inactivos" }),
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

  // El orden es por SKU descendente (ver lib/orden-productos.ts): lo último que
  // entró arriba. No se puede pedir en el `orderBy` — los SKU son numéricos sin
  // relleno de ceros, así que el orden de texto los mezcla — de modo que se
  // traen las claves de orden de todo lo que matchea, se ordena y se corta la
  // página acá. Ese primer findMany reemplaza al count: siguen siendo dos
  // consultas, y son tres columnas sin joins sobre un catálogo de cientos.
  const claves = await prisma.product.findMany({
    where,
    select: { id: true, sku: true, name: true },
  });
  claves.sort(compararProductos);

  const idsPagina = claves.slice(skip, skip + limit).map((c) => c.id);
  const filas = idsPagina.length
    ? await prisma.product.findMany({
        where: { id: { in: idsPagina } },
        include: {
          categories: {
            select: { id: true, name: true, requiresLensSelection: true },
          },
        },
      })
    : [];

  // Prisma no respeta el orden del `in`.
  const porId = new Map(filas.map((p) => [p.id, p]));
  const products = idsPagina.map((id) => porId.get(id)!).filter(Boolean);
  const total = claves.length;

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
