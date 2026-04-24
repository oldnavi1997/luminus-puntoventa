import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const AperturaSchema = z.object({
  openingBalance: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const activeSession = await prisma.posSession.findFirst({
    where: { userId: session.user.id, status: "OPEN" },
  });

  return NextResponse.json({ session: activeSession });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Solo una sesión activa por cajero
  const existing = await prisma.posSession.findFirst({
    where: { userId: session.user.id, status: "OPEN" },
  });
  if (existing) {
    return NextResponse.json({ error: "Ya tienes una sesión activa", session: existing }, { status: 409 });
  }

  const body = await req.json();
  const parsed = AperturaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const newSession = await prisma.posSession.create({
    data: {
      userId: session.user.id,
      openingBalance: parsed.data.openingBalance,
      notes: parsed.data.notes,
    },
  });

  // Limpiar override de retiro al abrir nueva sesión
  await prisma.cajaConfig.updateMany({
    where: { id: "main", nextOpeningOverride: { not: null } },
    data: { nextOpeningOverride: null },
  });

  return NextResponse.json({ session: newSession }, { status: 201 });
}
