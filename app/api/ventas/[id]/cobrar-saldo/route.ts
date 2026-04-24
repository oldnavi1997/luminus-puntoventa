import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { DocumentStatus } from "@/app/generated/prisma/client";

const CobrarSaldoSchema = z.object({
  paymentMethod: z.enum(["EFECTIVO", "TARJETA", "YAPE"]),
  montoRecibido: z.number().positive().optional(),
  posSessionId: z.string(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = CobrarSaldoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.saleDocument.findUnique({ where: { id } });
      if (!doc) throw new Error("Documento no encontrado");
      if (doc.status !== DocumentStatus.PARTIAL) throw new Error("El documento no está pendiente de saldo");

      const total = Number(doc.total);
      const adelanto = Number(doc.montoAdelanto ?? 0);
      const saldo = Math.round((total - adelanto) * 100) / 100;
      const cambio = data.montoRecibido ? Math.max(0, data.montoRecibido - saldo) : null;

      const updatedDoc = await tx.saleDocument.update({
        where: { id },
        data: {
          status: DocumentStatus.ACCEPTED,
          montoRecibido: total,
          cambio,
          saldoCobradoPorId: session.user.id,
        },
      });

      // Registrar el saldo en la sesión activa del día
      const sessionUpdate: Record<string, unknown> = {
        totalVentas: { increment: saldo },
        countVentas: { increment: 1 },
      };
      if (data.paymentMethod === "EFECTIVO") sessionUpdate.totalEfectivo = { increment: saldo };
      if (data.paymentMethod === "TARJETA") sessionUpdate.totalTarjeta = { increment: saldo };
      if (data.paymentMethod === "YAPE") sessionUpdate.totalYape = { increment: saldo };

      await tx.posSession.update({
        where: { id: data.posSessionId },
        data: sessionUpdate,
      });

      return { updatedDoc, saldo, cambio };
    });

    return NextResponse.json({
      id,
      status: "ACCEPTED",
      saldo: result.saldo,
      cambio: result.cambio ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cobrar saldo";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
