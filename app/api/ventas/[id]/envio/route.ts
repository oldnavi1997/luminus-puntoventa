import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envioSchema, normalizarEnvio, propuestaDeEnvio } from "@/lib/envio";

const SELECT_ENVIO = {
  nombre: true,
  tipoDocumento: true,
  numeroDocumento: true,
  celular: true,
  ciudad: true,
  courier: true,
  modalidad: true,
  destino: true,
  mercaderia: true,
} as const;

/**
 * La etiqueta de envío de una venta: la guardada, o la que se propone para
 * crearla (del pedido si es web, del comprador si es de mostrador).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.saleDocument.findUnique({
    where: { id },
    select: {
      buyerName: true,
      buyerDocType: true,
      buyerDocNumber: true,
      buyerPhone: true,
      customer: { select: { phone: true } },
      order: {
        select: {
          shippingName: true,
          shippingPhone: true,
          shippingAddress: true,
          shippingCity: true,
          shippingCourier: true,
          documentType: true,
          documentNumber: true,
        },
      },
      datosEnvio: { select: SELECT_ENVIO },
    },
  });
  if (!doc) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  return NextResponse.json({ guardado: doc.datosEnvio, propuesta: propuestaDeEnvio(doc) });
}

/**
 * Pone o corrige la etiqueta de envío de una venta ya cobrada. No toca la
 * venta: solo su fila de `sale_document_envios`, así que vale también para un
 * comprobante ya aceptado por SUNAT.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = envioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existe = await prisma.saleDocument.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  const datos = normalizarEnvio(parsed.data);
  const envio = await prisma.saleDocumentEnvio.upsert({
    where: { saleDocumentId: id },
    create: { saleDocumentId: id, ...datos },
    update: datos,
    select: SELECT_ENVIO,
  });

  return NextResponse.json(envio);
}
