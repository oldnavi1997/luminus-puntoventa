import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";
import { origenDeConversion, prefijoDeConversion } from "@/lib/conversion";
import { MAX_RESULTADOS, esBusqueda, hoyEnLima, rangoDelDia, whereBusquedaVentas } from "@/lib/busqueda-ventas";

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
 *
 * Por defecto lista sólo las notas del día (`date`, hoy en Lima si no viene).
 * Con `q` busca en todo el historial e ignora la fecha, igual que el Historial
 * de ventas y con el mismo filtro (`whereBusquedaVentas`).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const buscando = esBusqueda(q);
  const fecha = params.get("date");
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyEnLima();

  // Las convertidas se excluyen en la consulta y no después: con `take`, filtrar
  // en memoria dejaría fuera notas convertibles detrás de otras ya convertidas.
  const conversiones = await prisma.saleDocument.findMany({
    where: {
      notes: { startsWith: prefijoDeConversion("") },
      status: { not: DocumentStatus.REJECTED },
    },
    select: { notes: true },
  });
  const yaConvertidas = [
    ...new Set(
      conversiones.map((c) => origenDeConversion(c.notes)).filter((o): o is string => o !== null),
    ),
  ];

  const notas = await prisma.saleDocument.findMany({
    where: {
      type: DocumentType.NOTA_VENTA,
      status: DocumentStatus.ACCEPTED,
      ...(yaConvertidas.length > 0 ? { fullNumber: { notIn: yaConvertidas } } : {}),
      ...(buscando ? whereBusquedaVentas(q) : { createdAt: rangoDelDia(date) }),
    },
    orderBy: { createdAt: "desc" },
    take: buscando ? MAX_RESULTADOS : 500,
    select: {
      id: true,
      fullNumber: true,
      buyerName: true,
      buyerDocNumber: true,
      total: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    docs: notas.map((n) => ({
      id: n.id,
      fullNumber: n.fullNumber,
      buyerName: n.buyerName,
      buyerDocNumber: n.buyerDocNumber,
      total: Number(n.total),
      createdAt: n.createdAt.toISOString(),
    })),
    limite: buscando ? MAX_RESULTADOS : null,
  });
}
