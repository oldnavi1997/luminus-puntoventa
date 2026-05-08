import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calcularEfectivoDisponible } from "@/lib/cash-flow";

const Schema = z.object({
  montoQueQueda: z.number().min(0),
  location: z.enum(["TIENDA", "ALMACEN"]),
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

  const { montoQueQueda, location } = parsed.data;
  const configId = location === "TIENDA" ? "tienda" : "almacen";
  const now = new Date();

  const config = await prisma.cajaConfig.findUnique({ where: { id: configId } });

  const { efectivoDisponible } = await calcularEfectivoDisponible({
    location,
    retiroAt: config?.lastRetiroAt ?? null,
    fondoAnterior: Number(config?.lastRetiroFondo ?? 0),
  });
  const montoRetirado = Math.max(0, efectivoDisponible - montoQueQueda);

  await prisma.$transaction(async (tx) => {
    await tx.cajaConfig.upsert({
      where: { id: configId },
      create: {
        id: configId,
        nextOpeningOverride: location === "TIENDA" ? montoQueQueda : null,
        lastRetiroAt: now,
        lastRetiroFondo: montoQueQueda,
      },
      update: {
        ...(location === "TIENDA" && { nextOpeningOverride: montoQueQueda }),
        lastRetiroAt: now,
        lastRetiroFondo: montoQueQueda,
      },
    });

    await tx.cajaRetiro.create({
      data: {
        montoRetirado,
        fondoQueQueda: montoQueQueda,
        location,
        registradoBy: session.user.id,
      },
    });

    // Solo el retiro TIENDA cierra sesiones de cajeros (no la del admin)
    if (location === "TIENDA") {
      const openSessions = await tx.posSession.findMany({
        where: { status: "OPEN", user: { role: { not: "ADMIN" } } },
        select: { id: true, openingBalance: true, totalEfectivo: true },
      });
      for (const s of openSessions) {
        await tx.posSession.update({
          where: { id: s.id },
          data: {
            status: "CLOSED",
            closedAt: now,
            closingBalance: Number(s.openingBalance) + Number(s.totalEfectivo),
            notes: "Cerrada por retiro de caja (Tienda)",
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true, montoQueQueda, location });
}
