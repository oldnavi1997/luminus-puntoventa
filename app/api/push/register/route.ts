import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = typeof body?.platform === "string" ? body.platform : null;

  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 400 });

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, platform, userId: session.user.id },
    update: { userId: session.user.id, platform },
  });

  return NextResponse.json({ ok: true });
}
