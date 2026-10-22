import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsearStockMinimo } from "@/lib/stock-minimo";
import { leerStockMinimoGeneral } from "@/lib/stock-minimo-config";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  return NextResponse.json({ stockMinimo: await leerStockMinimoGeneral() });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // El general no puede ser null: es el que rige cuando el producto no tiene uno.
  const stockMinimo = parsearStockMinimo(body.stockMinimo);
  if (stockMinimo == null) {
    return NextResponse.json({ error: "El stock mínimo tiene que ser un número entero desde 0" }, { status: 400 });
  }

  await prisma.posConfig.upsert({
    where:  { id: "main" },
    create: { id: "main", stockMinimo },
    update: { stockMinimo },
  });

  return NextResponse.json({ stockMinimo });
}
