import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { buildApiSunatItems, buildApiSunatPayload, formatCorrelativo } from "@/lib/sunat";
import { emitirDocumento } from "@/lib/apisunat";
import { enqueueDocument } from "@/lib/queue";
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

  try {
    const apisunatItems = buildApiSunatItems(
      newDoc.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotal: Number(i.lineTotal) })),
      Number(newDoc.total),
    );
    const payload = buildApiSunatPayload({
      tipo: docTypeEnum === DocumentType.FACTURA ? 1 : 2,
      serie: newDoc.serie,
      numero: newDoc.correlativo,
      cliente: {
        docType: buyer.docType,
        docNumber: buyer.docNumber,
        name: buyer.name,
        address: buyer.address,
        email: buyer.email,
      },
      items: apisunatItems,
      totalConIGV: Number(newDoc.total),
    });
    const apisunatResult = await emitirDocumento(payload);
    const isAccepted = apisunatResult.success && apisunatResult.payload.estado === "ACEPTADO";
    await prisma.saleDocument.update({
      where: { id: newDoc.id },
      data: {
        status: isAccepted ? DocumentStatus.ACCEPTED : DocumentStatus.REJECTED,
        nubefactId: apisunatResult.payload.hash,
        nubefactResponse: apisunatResult as object,
        pdfUrl: apisunatResult.payload.pdf.a4,
        xmlUrl: apisunatResult.payload.xml,
        qrCode: null,
        sunatCdrCode: apisunatResult.payload.estado,
        sunatCdrDesc: apisunatResult.message,
        submittedAt: new Date(),
      },
    });
    return NextResponse.json({
      id: newDoc.id,
      fullNumber: newDoc.fullNumber,
      status: isAccepted ? "ACCEPTED" : "REJECTED",
      pdfUrl: apisunatResult.payload.pdf.a4,
    });
  } catch {
    await prisma.saleDocument.update({
      where: { id: newDoc.id },
      data: { status: DocumentStatus.PENDING },
    });
    await enqueueDocument(newDoc.id);
    return NextResponse.json({
      id: newDoc.id,
      fullNumber: newDoc.fullNumber,
      status: "PENDING",
      pdfUrl: null,
    });
  }
}
