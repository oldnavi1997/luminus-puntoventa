import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cargarRepresentacion, DocumentoNoImprimible } from "@/lib/impresion/cargar";
import { generarPdfA4 } from "@/lib/impresion/pdf/documento";
import { nombreComprobante } from "@/lib/sunat/nombres";
import { formatCorrelativo } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El PDF A4 del comprobante.
 *
 * Va bajo `/api/ventas/[id]` y no bajo `/api/comprobantes/[id]` porque las tres
 * pantallas que lo ofrecen tienen a mano el id del `SaleDocument`, y porque una
 * nota de venta no es un comprobante pero también quiere su PDF.
 *
 * Detrás de la sesión: nadie ve un comprobante ajeno adivinando una URL. Para
 * mandarlo por WhatsApp se descarga con `?descargar=1` y se adjunta.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const descargar = new URL(req.url).searchParams.get("descargar") === "1";

  try {
    const rep = await cargarRepresentacion(id);
    const pdf = await generarPdfA4(rep);

    // El mismo nombre que llevó el ZIP a SUNAT, para que un comprobante se
    // pueda cruzar con su XML sin adivinar.
    const nombre = rep.documento.tipoSunat
      ? nombreComprobante(
          rep.emisor.ruc,
          rep.documento.tipoSunat,
          rep.documento.serie,
          Number(rep.documento.correlativo),
        )
      : `${rep.documento.serie}-${formatCorrelativo(Number(rep.documento.correlativo))}`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}.pdf"`,
        // El estado cambia —un comprobante se anula— así que no se cachea.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof DocumentoNoImprimible) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
