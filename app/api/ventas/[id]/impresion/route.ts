import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cargarRepresentacion, DocumentoNoImprimible } from "@/lib/impresion/cargar";
import type { ClaseImpresion } from "@/lib/impresion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLASES: ClaseImpresion[] = ["COMPROBANTE", "NOTA_VENTA", "RECIBO_SALDO"];

/**
 * Todo lo que hace falta para imprimir una venta, ya armado.
 *
 * Existe porque no había forma de traer una venta concreta con lo que la
 * impresa necesita: `GET /api/ventas` no da `serie`, `correlativo`,
 * `buyerAddress` ni el desglose de pago, y `GET /api/comprobantes` no trae
 * líneas. El ticket lo consume tal cual y el PDF usa el mismo armado.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);

  const claseCruda = searchParams.get("clase");
  if (claseCruda && !CLASES.includes(claseCruda as ClaseImpresion)) {
    return NextResponse.json({ error: `Clase de impresión desconocida: ${claseCruda}` }, { status: 400 });
  }

  const recibidoCrudo = searchParams.get("recibido");
  const recibido = recibidoCrudo != null ? Number(recibidoCrudo) : undefined;
  if (recibido !== undefined && !Number.isFinite(recibido)) {
    return NextResponse.json({ error: "El monto recibido no es un número." }, { status: 400 });
  }

  try {
    const rep = await cargarRepresentacion(id, {
      clase: (claseCruda as ClaseImpresion | null) ?? undefined,
      recibido,
    });

    // El QR y el estado cambian —un comprobante se anula— así que no se cachea.
    return NextResponse.json(rep, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof DocumentoNoImprimible) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
