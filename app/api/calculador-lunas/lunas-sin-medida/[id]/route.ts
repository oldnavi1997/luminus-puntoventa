import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const EDIT_ROLES = ["ADMIN", "SUPERVISOR"];

const PatchSchema = z.object({
  precio: z.number().nonnegative().optional(),
  nombre: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!EDIT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updated = await prisma.lunaSinMedida.update({ where: { id }, data: parsed.data });

  return NextResponse.json({
    id: updated.id,
    nombre: updated.nombre,
    precio: Number(updated.precio),
    sortOrder: updated.sortOrder,
  });
}
