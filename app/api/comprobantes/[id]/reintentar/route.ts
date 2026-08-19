import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitirComprobante } from "@/lib/sunat/emitir";

/**
 * Reemite un comprobante que quedó en SEND_ERROR o PENDING.
 *
 * Existe para el caso que se da de verdad: algo del entorno estaba mal
 * —permisos del usuario SOL, una variable, el certificado—, se corrige, y el
 * comprobante debe salir con SU MISMO correlativo, sin quemar un número ni
 * inventar otro documento.
 *
 * No hay riesgo de duplicar: `emitirComprobante` comprueba primero si el
 * documento ya tiene un envío aceptado y en ese caso devuelve el existente sin
 * volver a mandar nada. Un REJECTED no se reintenta desde aquí a propósito: si
 * SUNAT evaluó y rechazó, hay que corregir el documento, no reenviarlo igual.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo el administrador puede reemitir" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.saleDocument.findUnique({
    where: { id },
    select: { id: true, type: true, status: true, fullNumber: true },
  });

  if (!doc) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });

  if (doc.type === "NOTA_VENTA") {
    return NextResponse.json(
      { error: "Las notas de venta son internas: no se envían a SUNAT." },
      { status: 400 },
    );
  }

  const reemitibles = ["SEND_ERROR", "PENDING", "DRAFT"];
  if (!reemitibles.includes(doc.status)) {
    return NextResponse.json(
      {
        error:
          doc.status === "REJECTED"
            ? "SUNAT rechazó este comprobante tras evaluarlo. Reenviarlo daría el mismo rechazo: hay que corregir los datos y emitir uno nuevo."
            : `El comprobante está en ${doc.status} y no necesita reemitirse.`,
      },
      { status: 409 },
    );
  }

  const emision = await emitirComprobante(id);

  // Si vuelve a fallar por algo transitorio, que la cola lo recoja.
  if (emision.reintentable) {
    const { enqueueDocument } = await import("@/lib/queue");
    await enqueueDocument(id);
  }

  return NextResponse.json({
    fullNumber: doc.fullNumber,
    estado: emision.estadoDocumento,
    aceptado: emision.aceptado,
    codigo: emision.codigo,
    mensaje: emision.mensaje,
    observaciones: emision.observaciones,
  });
}
