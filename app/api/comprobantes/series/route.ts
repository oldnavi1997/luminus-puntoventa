import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seriesActivas } from "@/lib/document-serie";

/**
 * La serie activa de cada tipo de documento.
 *
 * Existe para que la interfaz muestre la serie que el comprobante va a llevar
 * de verdad. Estaba escrita a mano en el modal, así que el día que se cambia de
 * serie —lo que pasa cuando SUNAT ya tiene números en la vieja— la pantalla
 * seguiría anunciando una serie que ya no se emite.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  return NextResponse.json(await seriesActivas(prisma));
}
