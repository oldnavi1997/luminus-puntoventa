import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";
import { origenDeConversion, prefijoDeConversion } from "@/lib/conversion";

/**
 * Notas de venta que todavía pueden convertirse en comprobante.
 *
 * La pantalla de Convertir listaba todas las notas aceptadas y las llamaba
 * "pendientes de conversión", incluidas las que ya tenían su boleta emitida y
 * aceptada por SUNAT. Filtrar aquí y no en `/api/comprobantes` deja ese endpoint
 * genérico como está: lo usan también Comprobantes y el dashboard.
 *
 * Una nota cuya única conversión fue RECHAZADA sí vuelve a aparecer: ese
 * comprobante no vale nada y la venta sigue necesitando uno válido.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200"), 500);

  const [notas, conversiones] = await Promise.all([
    prisma.saleDocument.findMany({
      where: { type: DocumentType.NOTA_VENTA, status: DocumentStatus.ACCEPTED },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        fullNumber: true,
        buyerName: true,
        buyerDocNumber: true,
        total: true,
        createdAt: true,
      },
    }),
    prisma.saleDocument.findMany({
      where: {
        notes: { startsWith: prefijoDeConversion("") },
        status: { not: DocumentStatus.REJECTED },
      },
      select: { notes: true },
    }),
  ]);

  const yaConvertidas = new Set(
    conversiones.map((c) => origenDeConversion(c.notes)).filter((o): o is string => o !== null),
  );

  return NextResponse.json({
    docs: notas
      .filter((n) => !yaConvertidas.has(n.fullNumber))
      .map((n) => ({
        id: n.id,
        fullNumber: n.fullNumber,
        buyerName: n.buyerName,
        buyerDocNumber: n.buyerDocNumber,
        total: Number(n.total),
        createdAt: n.createdAt.toISOString(),
      })),
  });
}
