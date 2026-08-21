import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { anularDocumento } from "@/lib/apisunat";
import { DocumentType, TipoEnvioSunat } from "@/app/generated/prisma/client";
import { anularComprobante, ErrorAnulacion } from "@/lib/sunat/anular";
import { ESTADOS_ACEPTADOS } from "@/lib/sunat/estados";
import { MAX_MOTIVO } from "@/lib/sunat/ubl/baja";
import { ErrorSunat } from "@/lib/sunat/errores";

const Schema = z.object({
  motivo: z
    .string()
    .min(5, "El motivo debe tener al menos 5 caracteres")
    .max(MAX_MOTIVO, `El motivo no puede pasar de ${MAX_MOTIVO} caracteres`),
});

/**
 * Anula un comprobante.
 *
 * Dos caminos, según quién lo emitió:
 *
 * - **Lo emitimos nosotros** (SEE Del Contribuyente): se pide la baja a SUNAT
 *   con una comunicación de baja o un resumen de anulación. Es asíncrono, así
 *   que responde **202**: el comprobante queda en `VOID_PENDING` y lo cierra el
 *   sondeo de `tickets.ts` cuando SUNAT contesta.
 * - **Lo emitió el proveedor anterior** (sin `SunatEnvio` de emisión): sigue
 *   yendo por ApiSunat, que es quien lo conoce. Este ramal se puede borrar en
 *   cuanto no quede ninguno dentro de plazo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo el administrador puede anular comprobantes" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const doc = await prisma.saleDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  // Si tiene una emisión aceptada nuestra, SUNAT lo conoce por nuestro
  // certificado y la baja sale por el mismo camino.
  const emisionPropia = await prisma.sunatEnvio.findFirst({
    where: {
      documentId: id,
      tipoEnvio: TipoEnvioSunat.INDIVIDUAL,
      estado: { in: ESTADOS_ACEPTADOS },
    },
    select: { id: true },
  });

  if (emisionPropia) {
    try {
      const resultado = await anularComprobante(id, {
        motivo: parsed.data.motivo,
        usuarioId: session.user.id,
      });

      // 202 y no 200: cuando esta respuesta vuelve, SUNAT todavía no ha dicho
      // nada. Devolver 200 haría creer a la interfaz que ya está anulado.
      return NextResponse.json(
        {
          estado: resultado.estadoDocumento,
          ticket: resultado.ticket,
          nombreArchivo: resultado.nombreArchivo,
          mensaje: resultado.mensaje,
        },
        { status: 202 },
      );
    } catch (err) {
      if (err instanceof ErrorAnulacion) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ErrorSunat) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      throw err;
    }
  }

  // ── Camino heredado: comprobantes del proveedor anterior ───────────────────
  if (doc.type === DocumentType.NOTA_VENTA) {
    return NextResponse.json({ error: "Las Notas de Venta no se anulan por SUNAT" }, { status: 400 });
  }
  if (doc.status !== "ACCEPTED" && doc.status !== "ACCEPTED_WITH_OBSERVATIONS") {
    return NextResponse.json(
      { error: "Solo se pueden anular documentos aceptados por SUNAT" },
      { status: 400 },
    );
  }

  const estadoPrevio = doc.status;
  await prisma.saleDocument.update({ where: { id }, data: { status: "VOID_PENDING" } });

  try {
    const result = await anularDocumento({
      tipo: doc.type === DocumentType.FACTURA ? 1 : 2,
      serie: doc.serie,
      correlativo: doc.correlativo,
      motivo: parsed.data.motivo,
    });

    if (!result.success) {
      await prisma.saleDocument.update({ where: { id }, data: { status: estadoPrevio } });
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

    return NextResponse.json({ ok: true, estado: "VOIDED" });
  } catch (err) {
    await prisma.saleDocument.update({ where: { id }, data: { status: estadoPrevio } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al anular" },
      { status: 502 },
    );
  }
}
