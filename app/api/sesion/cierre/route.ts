import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CierreSchema = z.object({
  sessionId: z.string(),
  closingBalance: z.number().min(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const parsed = CierreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const posSession = await prisma.posSession.findUnique({
    where: { id: parsed.data.sessionId },
  });

  if (!posSession || posSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  if (posSession.status !== "OPEN") {
    return NextResponse.json({ error: "La sesión ya está cerrada" }, { status: 409 });
  }

  const closed = await prisma.posSession.update({
    where: { id: parsed.data.sessionId },
    data: {
      status: "CLOSED",
      closingBalance: parsed.data.closingBalance,
      closedAt: new Date(),
      notes: parsed.data.notes,
    },
  });

  return NextResponse.json({ session: closed });
}
