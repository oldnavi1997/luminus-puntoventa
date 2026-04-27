import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const EDIT_ROLES = ["ADMIN", "SUPERVISOR"];

const PatchSchema = z.object({
  nombre:    z.string().min(1).optional(),
  nota:      z.string().nullable().optional(),
  ar16:      z.number().nullable().optional(),
  arsy:      z.number().nullable().optional(),
  arshapire: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
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

  const updated = await prisma.lensCatalog.update({ where: { id }, data: parsed.data });

  return NextResponse.json({
    id: updated.id,
    nombre: updated.nombre,
    nota: updated.nota,
    ar16:      updated.ar16      == null ? null : Number(updated.ar16),
    arsy:      updated.arsy      == null ? null : Number(updated.arsy),
    arshapire: updated.arshapire == null ? null : Number(updated.arshapire),
    sortOrder: updated.sortOrder,
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!EDIT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const { id } = await ctx.params;
  await prisma.lensCatalog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
