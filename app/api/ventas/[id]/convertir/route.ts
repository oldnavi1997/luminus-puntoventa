import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { reservarCorrelativo } from "@/lib/document-serie";
import { marcaDeConversion, prefijoDeConversion } from "@/lib/conversion";
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

  // Una venta se declara UNA vez. Sin esta comprobación la misma nota se podía
  // convertir indefinidamente: NV001-00000251 llegó a tener cuatro comprobantes,
  // y el último aceptado por SUNAT.
  //
  // El rechazado es la excepción y el motivo de que esto no sea un simple "ya
  // se convirtió": ese comprobante no vale nada y la venta sigue necesitando uno
  // válido, así que volver a convertir es justo la salida.
  const previas = await prisma.saleDocument.findMany({
    where: { notes: { startsWith: prefijoDeConversion(original.fullNumber) } },
    select: { fullNumber: true, status: true },
  });
  const viva = previas.find((d) => d.status !== DocumentStatus.REJECTED);

  if (viva) {
    // Un SEND_ERROR o un PENDING conservan su correlativo, así que lo que toca
    // es reintentar ese comprobante. Convertir otra vez pediría un número nuevo
    // y dejaría el anterior quemado para nada.
    const recuperable =
      viva.status === DocumentStatus.PENDING ||
      viva.status === DocumentStatus.SEND_ERROR ||
      viva.status === DocumentStatus.DRAFT;

    return NextResponse.json(
      {
        error: recuperable
          ? `${original.fullNumber} ya tiene el comprobante ${viva.fullNumber}, pendiente de ` +
            "enviarse. Reintenta ese desde Comprobantes en vez de convertir otra vez: su " +
            "correlativo sigue siendo válido y crear uno nuevo lo quemaría."
          : `${original.fullNumber} ya se convirtió en ${viva.fullNumber}. Convertirla de nuevo ` +
            "declararía la misma venta dos veces ante SUNAT.",
        comprobante: viva.fullNumber,
      },
      { status: 409 },
    );
  }

  const docTypeEnum = docType === "FACTURA" ? DocumentType.FACTURA : DocumentType.BOLETA;
  const newDoc = await prisma.$transaction(async (tx) => {
    const { serie, correlativo: nextNum, fullNumber } = await reservarCorrelativo(
      tx,
      docTypeEnum,
    );

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
        // El stock y la caja ya los movió la nota de venta; la marca impide que
        // borrar este comprobante los revierta por segunda vez.
        notes: marcaDeConversion(original.fullNumber, original.notes),
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
