import { prisma } from "./prisma";
import { emitirDocumento } from "./apisunat";
import { buildApiSunatPayload, buildApiSunatItems } from "./sunat";
import { DocumentType } from "@/app/generated/prisma/client";

export async function enqueueDocument(documentId: string) {
  await prisma.documentQueue.upsert({
    where: { documentId },
    create: { documentId },
    update: { nextRetryAt: new Date() },
  });
}

export async function processQueue(): Promise<{ processed: number; errors: number }> {
  const pending = await prisma.documentQueue.findMany({
    where: { nextRetryAt: { lte: new Date() }, attempts: { lt: 10 } },
    take: 10,
    orderBy: { nextRetryAt: "asc" },
  });

  let processed = 0;
  let errors = 0;

  for (const entry of pending) {
    try {
      const doc = await prisma.saleDocument.findUnique({
        where: { id: entry.documentId },
        include: { items: { include: { product: true } }, customer: true },
      });

      if (!doc) {
        await prisma.documentQueue.delete({ where: { id: entry.id } });
        continue;
      }

      const items = buildApiSunatItems(
        doc.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotal: Number(i.lineTotal) })),
        Number(doc.total),
      );

      const payload = buildApiSunatPayload({
        tipo: doc.type === DocumentType.FACTURA ? 1 : 2,
        serie: doc.serie,
        numero: doc.correlativo,
        cliente: {
          docType: doc.buyerDocType ?? "DNI",
          docNumber: doc.buyerDocNumber ?? "00000000",
          name: doc.buyerName ?? "CLIENTE VARIOS",
          address: doc.buyerAddress ?? undefined,
        },
        items,
        totalConIGV: Number(doc.total),
      });

      const result = await emitirDocumento(payload);
      const isAccepted = result.success && result.payload.estado === "ACEPTADO";

      await prisma.saleDocument.update({
        where: { id: doc.id },
        data: {
          status: isAccepted ? "ACCEPTED" : "REJECTED",
          nubefactId: result.payload.hash,
          nubefactResponse: result as object,
          pdfUrl: result.payload.pdf.a4,
          xmlUrl: result.payload.xml,
          qrCode: null,
          sunatCdrCode: result.payload.estado,
          sunatCdrDesc: result.message,
          submittedAt: new Date(),
        },
      });

      await prisma.documentQueue.delete({ where: { id: entry.id } });
      processed++;
    } catch (err) {
      const attempts = entry.attempts + 1;
      const backoffSeconds = Math.min(Math.pow(2, attempts) * 60, 3600);
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

      await prisma.documentQueue.update({
        where: { id: entry.id },
        data: {
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          nextRetryAt,
        },
      });
      errors++;
    }
  }

  return { processed, errors };
}
