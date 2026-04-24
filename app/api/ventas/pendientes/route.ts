import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";
import { calcularIGV, formatCorrelativo } from "@/lib/sunat";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const docs = await prisma.saleDocument.findMany({
    where: { status: DocumentStatus.PARTIAL },
    orderBy: { createdAt: "desc" },
    include: {
      cashier: { select: { name: true } },
      items: {
        include: { product: { select: { sku: true } } },
      },
    },
  });

  const serialized = docs.map((d) => ({
    id: d.id,
    fullNumber: d.fullNumber,
    type: d.type,
    status: d.status,
    paymentMethod: d.paymentMethod,
    total: Number(d.total),
    montoAdelanto: d.montoAdelanto ? Number(d.montoAdelanto) : 0,
    saldoPendiente: Number(d.total) - (d.montoAdelanto ? Number(d.montoAdelanto) : 0),
    buyerName: d.buyerName,
    buyerDocNumber: d.buyerDocNumber,
    createdAt: d.createdAt.toISOString(),
    cashier: { name: d.cashier.name },
    items: d.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      sku: i.product.sku ?? null,
    })),
  }));

  return NextResponse.json({ docs: serialized });
}

// ─── POST: crear pendiente manual (solo ADMIN) ────────────────────────────────

const NuevoPendienteSchema = z.object({
  buyerName:     z.string().min(1, "Nombre requerido"),
  buyerPhone:    z.string().optional(),
  total:         z.number().positive("El total debe ser mayor a 0"),
  montoAdelanto: z.number().positive("El adelanto debe ser mayor a 0"),
  paymentMethod: z.enum(["EFECTIVO", "TARJETA", "YAPE"]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json();
  const parsed = NuevoPendienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const data = parsed.data;

  if (data.montoAdelanto >= data.total) {
    return NextResponse.json({ error: "El adelanto debe ser menor al total" }, { status: 400 });
  }

  const { baseImponible, igv } = calcularIGV(data.total);

  const doc = await prisma.$transaction(async (tx) => {
    const [serieRow] = await tx.$queryRaw<[{ lastNumber: number }]>`
      SELECT "lastNumber" FROM "DocumentSerie"
      WHERE type = 'NOTA_VENTA'::"DocumentType" AND serie = 'NV001'
      FOR UPDATE
    `;
    const nextNum = serieRow.lastNumber + 1;
    await tx.documentSerie.update({
      where: { type_serie: { type: DocumentType.NOTA_VENTA, serie: "NV001" } },
      data: { lastNumber: nextNum },
    });

    const created = await tx.saleDocument.create({
      data: {
        type:          DocumentType.NOTA_VENTA,
        serie:         "NV001",
        correlativo:   nextNum,
        fullNumber:    formatCorrelativo("NV001", nextNum),
        status:        DocumentStatus.PARTIAL,
        cashierId:     session.user.id,
        posSessionId:  session.user.posSessionId ?? null,
        buyerDocType:  "DNI",
        buyerDocNumber: "00000000",
        buyerName:     data.buyerName,
        buyerPhone:    data.buyerPhone ?? null,
        subtotal:      baseImponible,
        igv,
        total:         data.total,
        discount:      0,
        paymentMethod: data.paymentMethod,
        montoAdelanto: data.montoAdelanto,
        montoRecibido: data.montoAdelanto,
        location:      "ALMACEN",
      },
    });

    if (session.user.posSessionId) {
      const sessionUpdate: Record<string, unknown> = {
        totalVentas: { increment: data.montoAdelanto },
        countVentas: { increment: 1 },
      };
      if (data.paymentMethod === "EFECTIVO") sessionUpdate.totalEfectivo = { increment: data.montoAdelanto };
      if (data.paymentMethod === "TARJETA")  sessionUpdate.totalTarjeta  = { increment: data.montoAdelanto };
      if (data.paymentMethod === "YAPE")     sessionUpdate.totalYape     = { increment: data.montoAdelanto };

      await tx.posSession.update({
        where: { id: session.user.posSessionId },
        data: sessionUpdate,
      });
    }

    return created;
  });

  return NextResponse.json({ ok: true, id: doc.id, fullNumber: doc.fullNumber });
}
