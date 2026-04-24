import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const { id } = await params;

  const posSession = await prisma.posSession.findUnique({ where: { id } });
  if (!posSession) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  if (posSession.status !== "OPEN") return NextResponse.json({ error: "La sesión ya está cerrada" }, { status: 409 });

  const closingBalance = Number(posSession.openingBalance) + Number(posSession.totalEfectivo);

  const closed = await prisma.posSession.update({
    where: { id },
    data: {
      status: "CLOSED",
      closingBalance,
      closedAt: new Date(),
      notes: "Cerrada por administrador",
    },
  });

  return NextResponse.json({ ok: true, session: closed });
}
