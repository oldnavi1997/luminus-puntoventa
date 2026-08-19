import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { formatCorrelativo } from "@/lib/sunat";
import { enqueueDocument } from "@/lib/queue";
import { emitirComprobante } from "@/lib/sunat/emitir";
import { DocumentType, DocumentStatus } from "@/app/generated/prisma/client";

const Schema = z.object({
  docType: z.enum(["BOLETA", "FACTURA"]),
  buyer: z.object({
    docType: z.string(),
    docNumber: z.string().min(1),
    name: z.string().min(1),
    address: z.string().optional(),
    email: z.string().optional(),
  }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { docType, buyer } = parsed.data;

  const original = await prisma.saleDocument.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!original) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  if (original.type !== DocumentType.NOTA_VENTA) {
    return NextResponse.json({ error: "Solo se pueden convertir Notas de Venta" }, { status: 400 });
  }

  const docTypeEnum = docType === "FACTURA" ? DocumentType.FACTURA : DocumentType.BOLETA;
  const serie = docType === "FACTURA" ? "F001" : "B001";

  const newDoc = await prisma.$transaction(async (tx) => {
    const [serieRow] = await tx.$queryRaw<[{ lastNumber: number }]>`
      SELECT "lastNumber" FROM "DocumentSerie"
      WHERE type = ${docTypeEnum}::"DocumentType" AND serie = ${serie}
      FOR UPDATE
    `;
    const nextNum = serieRow.lastNumber + 1;
    await tx.documentSerie.update({
      where: { type_serie: { type: docTypeEnum, serie } },
      data: { lastNumber: nextNum },
    });
    const fullNumber = formatCorrelativo(serie, nextNum);

    return tx.saleDocument.create({
      data: {
        type: docTypeEnum,
        serie,
        correlativo: nextNum,
        fullNumber,
        posSessionId: original.posSessionId,
        cashierId: original.cashierId,
        buyerDocType: buyer.docType,
        buyerDocNumber: buyer.docNumber,
        buyerName: buyer.name,
        buyerAddress: buyer.address ?? null,
        subtotal: original.subtotal,
        igv: original.igv,
        total: original.total,
        discount: original.discount,
        paymentMethod: original.paymentMethod,
        montoRecibido: original.montoRecibido,
        cambio: original.cambio,
        status: DocumentStatus.DRAFT,
        items: {
          create: original.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitCode: item.unitCode,
            unitPrice: item.unitPrice,
            igvAmount: item.igvAmount,
            lineTotal: item.lineTotal,
            lensType: item.lensType,
            lensSubType: item.lensSubType,
            lensVariant: item.lensVariant,
            lensPrice: item.lensPrice,
          })),
        },
      },
      include: { items: true },
    });
  });

  // Misma emisión que una venta nueva: el comprobante convertido no puede
  // salir por otro camino que el resto, o acabaríamos con unos documentos
  // firmados por nosotros y otros por el OSE.
  const emision = await emitirComprobante(newDoc.id);
  if (emision.reintentable) await enqueueDocument(newDoc.id);

  return NextResponse.json({
    id: newDoc.id,
    fullNumber: newDoc.fullNumber,
    status: emision.estadoDocumento,
    pdfUrl: null,
    sunat: {
      aceptado: emision.aceptado,
      codigo: emision.codigo,
      mensaje: emision.mensaje,
      observaciones: emision.observaciones,
    },
  });
}
