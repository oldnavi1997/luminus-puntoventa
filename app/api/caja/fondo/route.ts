import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  location: z.enum(["TIENDA", "ALMACEN"]),
  monto: z.number().min(0),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { location, monto } = parsed.data;
  const configId = location === "TIENDA" ? "tienda" : "almacen";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.cajaConfig.upsert({
      where: { id: configId },
      create: {
        id: configId,
        lastRetiroFondo: monto,
        ...(location === "TIENDA" && { nextOpeningOverride: monto }),
        updatedAt: now,
      },
      update: {
        lastRetiroFondo: monto,
        ...(location === "TIENDA" && { nextOpeningOverride: monto }),
      },
    });

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
            notes: "Cerrada por ajuste de fondo",
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true, monto, location });
}
