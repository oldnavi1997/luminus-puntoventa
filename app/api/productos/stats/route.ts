import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [products, inactiveCount] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { price: true, stock: true },
    }),
    // Lo desactivado no cuenta para el valor del inventario, pero saber cuántos
    // hay explica por qué el POS lista menos productos que el panel de la web.
    prisma.product.count({ where: { active: false } }),
  ]);

  const total = products.length;
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const totalValue = products.reduce((s, p) => s + Number(p.price) * p.stock, 0);
  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const outCount = products.filter((p) => p.stock === 0).length;

  return NextResponse.json({ total, totalUnits, totalValue, lowCount, outCount, inactiveCount });
}
