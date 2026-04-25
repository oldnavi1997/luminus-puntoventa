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

  await prisma.cajaConfig.upsert({
    where: { id: configId },
    create: {
      id: configId,
      lastRetiroFondo: monto,
      ...(location === "TIENDA" && { nextOpeningOverride: monto }),
      updatedAt: new Date(),
    },
    update: {
      lastRetiroFondo: monto,
      ...(location === "TIENDA" && { nextOpeningOverride: monto }),
    },
  });

  return NextResponse.json({ ok: true, monto, location });
}
