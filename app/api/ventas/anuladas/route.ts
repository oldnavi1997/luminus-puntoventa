import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";
import { esFechaISO, finLima, hoyLima, inicioLima } from "@/lib/periodo";
import { naceDeConversion, origenDeConversion } from "@/lib/conversion";

/**
 * Historial de ventas anuladas.
 *
 * Anular no borra: el correlativo está gastado y el XML firmado es la prueba de
 * lo que se declaró. Esto es donde queda todo eso a la vista —quién anuló, por
 * qué, cuándo y con qué código respondió SUNAT— sin tener que ir filtrando en
 * Comprobantes.
 *
 * Sólo lista los comprobantes, no las notas de venta que se anularon con ellos:
 * la nota arrastrada es la misma venta, y contarla aparte duplicaría los
 * importes del periodo.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  const from = esFechaISO(desde) ? desde : hoyLima();
  const to = esFechaISO(hasta) ? hasta : from;

  // Se filtra por `voidedAt`, no por `createdAt`: lo que interesa aquí es
  // cuándo se anuló, no cuándo se había vendido.
  const docs = await prisma.saleDocument.findMany({
    where: {
      status: DocumentStatus.VOIDED,
      type: { in: [DocumentType.BOLETA, DocumentType.FACTURA] },
      voidedAt: { gte: inicioLima(from), lte: finLima(to) },
    },
    orderBy: { voidedAt: "desc" },
    select: {
      id: true,
      fullNumber: true,
      type: true,
      total: true,
      buyerName: true,
      buyerDocNumber: true,
      createdAt: true,
      voidedAt: true,
      voidReason: true,
      voidCdrCode: true,
      notes: true,
      cashier: { select: { name: true } },
      sunatEnvios: {
        where: { tipoEnvio: { in: ["COMUNICACION_BAJA", "RESUMEN_DIARIO"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { nombreArchivo: true, ticket: { select: { ticket: true } } },
      },
    },
  });

  return NextResponse.json({
    docs: docs.map((d) => {
      const baja = d.sunatEnvios[0];

      return {
        id: d.id,
        fullNumber: d.fullNumber,
        type: d.type,
        total: Number(d.total),
        buyerName: d.buyerName,
        buyerDocNumber: d.buyerDocNumber,
        emitidoEn: d.createdAt.toISOString(),
        anuladoEn: d.voidedAt ? d.voidedAt.toISOString() : null,
        motivo: d.voidReason,
        codigoSunat: d.voidCdrCode,
        cajero: d.cashier?.name ?? null,
        // La nota de venta que se anuló con él, si el comprobante salió de una
        // conversión: es la otra mitad de la misma venta deshecha.
        notaDeOrigen: naceDeConversion(d.notes) ? origenDeConversion(d.notes) : null,
        documentoBaja: baja?.nombreArchivo ?? null,
        ticket: baja?.ticket?.ticket ?? null,
      };
    }),
    rango: { desde: from, hasta: to },
    totales: {
      cantidad: docs.length,
      importe: docs.reduce((s, d) => s + Number(d.total), 0),
    },
  });
}
