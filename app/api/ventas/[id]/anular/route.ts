import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { anularDocumento } from "@/lib/apisunat";
import { DocumentType } from "@/app/generated/prisma/client";

const Schema = z.object({
  motivo: z.string().min(5, "El motivo debe tener al menos 5 caracteres"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo el administrador puede anular comprobantes" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const doc = await prisma.saleDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  if (doc.type === DocumentType.NOTA_VENTA)
    return NextResponse.json({ error: "Las Notas de Venta no se anulan por SUNAT" }, { status: 400 });
  if (doc.status !== "ACCEPTED" && doc.status !== "ACCEPTED_WITH_OBSERVATIONS")
    return NextResponse.json({ error: "Solo se pueden anular documentos aceptados por SUNAT" }, { status: 400 });

  // Los comprobantes que emitimos nosotros (SEE Del Contribuyente) el OSE no
  // los conoce: pedirle la baja a ApiSunat no anularía nada ante SUNAT, pero sí
  // dejaría el documento marcado como VOIDED en nuestra base. Eso es peor que
  // no poder anular, así que se corta aquí hasta que estén implementadas la
  // comunicación de baja (facturas) y el resumen de anulación (boletas).
  const emitidoPorNosotros = await prisma.sunatEnvio.findFirst({
    where: { documentId: id },
    select: { id: true },
  });

  if (emitidoPorNosotros) {
    return NextResponse.json(
      {
        error:
          "Este comprobante se emitió directamente a SUNAT y su anulación todavía no está implementada. " +
          "Anúlalo desde SUNAT Operaciones en Línea mientras tanto.",
      },
      { status: 501 },
    );
  }

  await prisma.saleDocument.update({ where: { id }, data: { status: "VOID_PENDING" } });

  try {
    const result = await anularDocumento({
      tipo: doc.type === DocumentType.FACTURA ? 1 : 2,
      serie: doc.serie,
      correlativo: doc.correlativo,
      motivo: parsed.data.motivo,
    });

    if (!result.success) {
      await prisma.saleDocument.update({ where: { id }, data: { status: "ACCEPTED" } });
      return NextResponse.json(
        { error: `ApiSunat rechazó la anulación: ${result.message}` },
        { status: 422 },
      );
    }

    await prisma.saleDocument.update({
      where: { id },
      data: {
        status: "VOIDED",
        voidReason: parsed.data.motivo,
        voidedAt: new Date(),
        voidCdrCode: result.payload?.estado ?? null,
      },
    });

    return NextResponse.json({ ok: true, status: "VOIDED" });
  } catch (err) {
    await prisma.saleDocument.update({ where: { id }, data: { status: "ACCEPTED" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al anular" },
      { status: 502 },
    );
  }
}
