import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TipoEnvioSunat } from "@/app/generated/prisma/client";
import { ESTADOS_ACEPTADOS } from "@/lib/sunat/estados";
import { archivoCdr, archivoXml } from "@/lib/sunat/nombres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El XML firmado del comprobante, o su CDR con `?cdr=1`.
 *
 * En Perú al cliente se le entrega el PDF y el XML, y el contador pide el CDR
 * de aceptación. Los tres datos ya estaban guardados en `SunatEnvio` desde que
 * se emite; lo único que faltaba era servirlos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const quiereCdr = new URL(req.url).searchParams.get("cdr") === "1";

  const envio = await prisma.sunatEnvio.findFirst({
    where: {
      documentId: id,
      tipoEnvio: TipoEnvioSunat.INDIVIDUAL,
      estado: { in: ESTADOS_ACEPTADOS },
    },
    orderBy: { createdAt: "desc" },
    select: { nombreArchivo: true, xmlFirmado: true, cdrXml: true },
  });

  if (!envio) {
    return NextResponse.json(
      { error: "Este documento no tiene un envío aceptado por SUNAT: no hay XML que descargar." },
      { status: 404 },
    );
  }

  const contenido = quiereCdr ? envio.cdrXml : envio.xmlFirmado;
  if (!contenido) {
    return NextResponse.json({ error: "El CDR no está guardado para este envío." }, { status: 404 });
  }

  // El mismo nombre con que viajó a SUNAT: el XML se llama igual que el ZIP y
  // el CDR lleva el prefijo "R-".
  const nombre = quiereCdr ? archivoCdr(envio.nombreArchivo).replace(/\.zip$/, ".xml") : archivoXml(envio.nombreArchivo);

  return new NextResponse(contenido, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
