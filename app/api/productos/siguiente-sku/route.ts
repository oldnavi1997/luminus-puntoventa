import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siguienteSku } from "@/lib/orden-productos";

/**
 * Propone el SKU del próximo producto para el formulario de alta. Es sólo una
 * sugerencia editable: la unicidad la sigue decidiendo el POST de /api/productos.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  // Sin filtrar por `active`: un producto desactivado no libera su SKU.
  const filas = await prisma.product.findMany({
    where: { NOT: { sku: null } },
    select: { sku: true },
  });

  return NextResponse.json({ sku: siguienteSku(filas.map((f) => f.sku)) });
}
