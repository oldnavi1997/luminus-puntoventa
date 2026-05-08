import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PatchSchema = z.object({
  poli: z.number().nonnegative().optional(),
  foto: z.number().nonnegative().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updated = await prisma.tarifaLuna.update({
    where: { id: numericId },
    data: parsed.data,
  });

  return NextResponse.json({
    id:     updated.id,
    esfMin: Number(updated.esfMin),
    esfMax: Number(updated.esfMax),
    cilMin: Number(updated.cilMin),
    cilMax: Number(updated.cilMax),
    poli:   Number(updated.poli),
    foto:   Number(updated.foto),
  });
}
