import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  montoQueQueda: z.number().min(0),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const now = new Date();

  // Calcular monto retirado: efectivo disponible - fondo que queda
  const config = await prisma.cajaConfig.findUnique({ where: { id: "main" } });
  const retiroAt = config?.lastRetiroAt ?? null;
  const fondoAnterior = Number(config?.lastRetiroFondo ?? 0);

  const ventasEfectivo = await prisma.saleDocument.aggregate({
    where: {
      paymentMethod: "EFECTIVO",
      status: { notIn: ["VOIDED", "VOID_PENDING"] },
      ...(retiroAt ? { createdAt: { gt: retiroAt } } : {}),
    },
    _sum: { total: true },
  });

  const efectivoDisponible = fondoAnterior + Number(ventasEfectivo._sum.total ?? 0);
  const montoRetirado = Math.max(0, efectivoDisponible - parsed.data.montoQueQueda);

  await prisma.$transaction([
    prisma.cajaConfig.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        nextOpeningOverride: parsed.data.montoQueQueda,
        lastRetiroAt: now,
        lastRetiroFondo: parsed.data.montoQueQueda,
      },
      update: {
        nextOpeningOverride: parsed.data.montoQueQueda,
        lastRetiroAt: now,
        lastRetiroFondo: parsed.data.montoQueQueda,
      },
    }),
    prisma.cajaRetiro.create({
      data: {
        montoRetirado,
        fondoQueQueda: parsed.data.montoQueQueda,
        registradoBy: session.user.id,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, montoQueQueda: parsed.data.montoQueQueda });

}
