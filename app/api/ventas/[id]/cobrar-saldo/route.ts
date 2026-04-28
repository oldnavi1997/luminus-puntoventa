import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { DocumentStatus } from "@/app/generated/prisma/client";

const CobrarSaldoSchema = z.object({
  paymentMethod: z.enum(["EFECTIVO", "TARJETA", "YAPE", "MIXTO"]),
  montoRecibido: z.number().positive().optional(),
  // Pago mixto
  montoEfectivo: z.number().nonnegative().optional(),
  montoTarjeta:  z.number().nonnegative().optional(),
  montoYape:     z.number().nonnegative().optional(),
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

  // Validar que el mixto cuadre con el saldo (se verifica dentro de la tx una vez conocido saldo)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.saleDocument.findUnique({ where: { id } });
      if (!doc) throw new Error("Documento no encontrado");
      if (doc.status !== DocumentStatus.PARTIAL) throw new Error("El documento no está pendiente de saldo");

      const total   = Number(doc.total);
      const adelanto = Number(doc.montoAdelanto ?? 0);
      const saldo   = Math.round((total - adelanto) * 100) / 100;

      // Validación mixto
      if (data.paymentMethod === "MIXTO") {
        const sumMixto = Math.round(
          ((data.montoEfectivo ?? 0) + (data.montoTarjeta ?? 0) + (data.montoYape ?? 0)) * 100
        ) / 100;
        if (Math.abs(sumMixto - saldo) > 0.01) {
          throw new Error(`La suma del pago mixto (${sumMixto}) no coincide con el saldo (${saldo})`);
        }
      }

      const cambio = data.montoRecibido ? Math.max(0, data.montoRecibido - saldo) : null;

      await tx.saleDocument.update({
        where: { id },
        data: {
          status:           DocumentStatus.ACCEPTED,
          montoRecibido:    total,
          cambio,
          saldoCobradoPorId: session.user.id,
        },
      });

      // Sesión POS: acumular por método
      const sessionUpdate: Record<string, unknown> = {
        totalVentas: { increment: saldo },
        countVentas: { increment: 1 },
      };

      if (data.paymentMethod === "EFECTIVO") {
        sessionUpdate.totalEfectivo = { increment: saldo };
      } else if (data.paymentMethod === "TARJETA") {
        sessionUpdate.totalTarjeta = { increment: saldo };
      } else if (data.paymentMethod === "YAPE") {
        sessionUpdate.totalYape = { increment: saldo };
      } else if (data.paymentMethod === "MIXTO") {
        if ((data.montoEfectivo ?? 0) > 0) sessionUpdate.totalEfectivo = { increment: data.montoEfectivo };
        if ((data.montoTarjeta  ?? 0) > 0) sessionUpdate.totalTarjeta  = { increment: data.montoTarjeta  };
        if ((data.montoYape     ?? 0) > 0) sessionUpdate.totalYape      = { increment: data.montoYape     };
      }

      await tx.posSession.update({
        where: { id: data.posSessionId },
        data: sessionUpdate,
      });

      return { saldo, cambio };
    });

    return NextResponse.json({
      id,
      status: "ACCEPTED",
      saldo:  result.saldo,
      cambio: result.cambio ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cobrar saldo";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
