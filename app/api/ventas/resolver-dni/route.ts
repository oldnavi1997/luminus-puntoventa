/**
 * Resuelve en lote el comprador de las ventas web.
 *
 * En una compra online el cliente escribe su DNI, pero el nombre que queda en el
 * comprobante es el del destinatario del envio. Esto consulta ese documento y deja
 * el nombre oficial, sellando `buyerResolvedAt` para no volver a tocarlo: asi una
 * correccion manual posterior (o un "revertir") sobrevive a la siguiente carga.
 *
 * Fail-soft: si el proveedor no responde no se sella nada y se reintenta luego.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolverDocumento } from "@/lib/consulta-documento";
import { esConsultable, tieneDocumento } from "@/lib/documento";

const BodySchema = z.object({
  ids: z.array(z.string()).min(1).max(60),
});

/** El proveedor tiene timeout de 5s; en tandas cortas para no encolar la vista. */
const CONCURRENCIA = 5;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const pendientes = await prisma.saleDocument.findMany({
    where: { id: { in: parsed.data.ids }, channel: "WEB", buyerResolvedAt: null },
    select: { id: true, buyerDocNumber: true },
  });

  // Un CE no lo acepta la API de consulta: no tiene sentido gastar la llamada.
  const objetivo = pendientes.filter(
    (d) => tieneDocumento(d.buyerDocNumber) && esConsultable(d.buyerDocNumber)
  );

  const resueltos: {
    id: string;
    buyerName: string;
    buyerDocType: string;
    buyerDocNumber: string;
    buyerResolvedAt: string;
  }[] = [];

  for (let i = 0; i < objetivo.length; i += CONCURRENCIA) {
    const tanda = objetivo.slice(i, i + CONCURRENCIA);
    await Promise.all(
      tanda.map(async (doc) => {
        const datos = await resolverDocumento(doc.buyerDocNumber!);
        if (!datos) return; // sin sellar: se reintenta en la proxima carga

        const updated = await prisma.saleDocument.update({
          where: { id: doc.id },
          data: {
            buyerName: datos.name,
            buyerDocType: datos.docType,
            buyerDocNumber: datos.docNumber,
            ...(datos.address ? { buyerAddress: datos.address } : {}),
            ...(datos.id ? { customerId: datos.id } : {}),
            buyerResolvedAt: new Date(),
          },
        });

        resueltos.push({
          id: updated.id,
          buyerName: updated.buyerName!,
          buyerDocType: updated.buyerDocType!,
          buyerDocNumber: updated.buyerDocNumber!,
          buyerResolvedAt: updated.buyerResolvedAt!.toISOString(),
        });
      })
    );
  }

  return NextResponse.json({ resueltos, pendientes: objetivo.length - resueltos.length });
}
