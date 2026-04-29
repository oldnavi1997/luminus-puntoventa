import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calcularIGV, buildApiSunatPayload, buildApiSunatItems } from "@/lib/sunat";
import { emitirDocumento } from "@/lib/apisunat";
import { enqueueDocument } from "@/lib/queue";
import { getLensLabel } from "@/lib/lens-tree";
import { DocumentType, DocumentStatus } from "@/app/generated/prisma/client";
import { formatCorrelativo } from "@/lib/sunat";

// ─── GET: historial de ventas por fecha ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const allHistory = req.nextUrl.searchParams.get("all") === "true" && session.user.role === "ADMIN";
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00-05:00`);
  const end   = new Date(`${date}T23:59:59.999-05:00`);

  const docs = await prisma.saleDocument.findMany({
    where: allHistory ? undefined : { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: "desc" },
    include: {
      cashier: { select: { name: true } },
      saldoCobradoPor: { select: { name: true } },
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
    subtotal: Number(d.subtotal),
    igv: Number(d.igv),
    total: Number(d.total),
    discount: Number(d.discount),
    buyerName: d.buyerName,
    buyerPhone: d.buyerPhone ?? null,
    montoAdelanto: d.montoAdelanto ? Number(d.montoAdelanto) : null,
    location: d.location,
    notes: d.notes ?? null,
    prescription: d.prescription ?? null,
    createdAt: d.createdAt.toISOString(),
    cashier: { name: d.cashier.name },
    saldoCobradoPor: d.saldoCobradoPor ? { name: d.saldoCobradoPor.name } : null,
    saldoCobradoEn:  d.saldoCobradoEn ? d.saldoCobradoEn.toISOString() : null,
    items: d.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      sku: i.product.sku ?? null,
    })),
  }));

  const totalVentas = serialized.reduce((s, d) => s + d.total, 0);
  const countVentas = serialized.length;
  const ticketPromedio = countVentas > 0 ? totalVentas / countVentas : 0;

  return NextResponse.json({
    docs: serialized,
    stats: { totalVentas, countVentas, ticketPromedio },
  });
}

// ─── POST: registrar venta ────────────────────────────────────────────────────

const ItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive().optional(),
  lensType: z.string().optional(),
  lensSubType: z.string().optional(),
  lensVariant: z.string().optional(),
  lensPrice: z.number().optional(),
  lensPriceRange: z.string().optional(),
});

const VentaSchema = z.object({
  posSessionId: z.string(),
  items: z.array(ItemSchema).min(1),
  paymentMethod: z.enum(["EFECTIVO", "TARJETA", "YAPE", "MIXTO"]),
  paymentSplit: z.object({
    efectivo: z.number().min(0).default(0),
    tarjeta:  z.number().min(0).default(0),
    yape:     z.number().min(0).default(0),
  }).optional(),
  montoRecibido: z.number().optional(),
  discount: z.number().min(0).max(100).default(0),
  docType: z.enum(["BOLETA", "FACTURA", "NOTA_VENTA"]).default("NOTA_VENTA"),
  stockSource: z.enum(["TIENDA", "ALMACEN"]).default("TIENDA"),
  esAdelanto: z.boolean().default(false),
  montoAdelanto: z.number().positive().optional(),
  buyer: z.object({
    docType: z.string().default("DNI"),
    docNumber: z.string().default("00000000"),
    name: z.string().default("CLIENTE VARIOS"),
    address: z.string().optional(),
    email: z.string().optional(),
    customerId: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const parsed = VentaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;
  const isNotaVenta = data.docType === "NOTA_VENTA";
  const esAdelanto = data.esAdelanto && isNotaVenta;

  // Solo ADMIN puede descontar del almacén
  const stockSource = session.user.role === "ADMIN" ? data.stockSource : "TIENDA";

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar y decrementar stock
      const productIds = data.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, active: true },
      });

      for (const item of data.items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) throw new Error(`Producto ${item.productId} no encontrado`);
        if (product.trackInventory) {
          if (stockSource === "ALMACEN") {
            if (product.stockAlmacen < item.quantity) {
              throw new Error(`Stock insuficiente en almacén para "${product.name}" (disponible: ${product.stockAlmacen})`);
            }
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockAlmacen: { decrement: item.quantity },
                stock:        { decrement: item.quantity },
              },
            });
          } else {
            if (product.stockTienda < item.quantity) {
              throw new Error(`Stock insuficiente en tienda para "${product.name}" (disponible: ${product.stockTienda})`);
            }
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockTienda: { decrement: item.quantity },
                stock:       { decrement: item.quantity },
              },
            });
          }
        }
      }

      // 2. Calcular totales
      let subtotalBruto = 0;
      const itemsData = data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId)!;
        const unitPrice = item.unitPrice != null
          ? item.unitPrice
          : Number(product.storePrice ?? product.price);
        const lensPrice = item.lensPrice ?? 0;
        const lineTotal = (unitPrice + lensPrice) * item.quantity;
        subtotalBruto += lineTotal;

        const lensLabel = item.lensType
          ? getLensLabel(item.lensType, item.lensSubType, item.lensVariant)
          : null;

        const description = lensLabel
          ? `${product.name} · ${lensLabel}`
          : product.name;

        return { item, product, unitPrice, lensPrice, lineTotal, description };
      });

      const discountAmt = Math.round((subtotalBruto * data.discount) / 100 * 100) / 100;
      const totalConIGV = Math.round((subtotalBruto - discountAmt) * 100) / 100;
      const { baseImponible, igv } = calcularIGV(totalConIGV);
      const montoParaSesion = esAdelanto ? (data.montoAdelanto ?? 0) : totalConIGV;
      const cambio = data.montoRecibido ? Math.max(0, data.montoRecibido - totalConIGV) : null;

      // 3. Obtener correlativo (SELECT FOR UPDATE)
      const docTypeEnum = data.docType === "FACTURA"
        ? DocumentType.FACTURA
        : data.docType === "NOTA_VENTA"
          ? DocumentType.NOTA_VENTA
          : DocumentType.BOLETA;
      const serie = data.docType === "FACTURA" ? "F001"
        : data.docType === "NOTA_VENTA" ? "NV001"
        : "B001";

      const [serieRow] = await tx.$queryRaw<[{ lastNumber: number }]>`
        SELECT "lastNumber" FROM "DocumentSerie"
        WHERE type = ${docTypeEnum}::"DocumentType" AND serie = ${serie}
        FOR UPDATE
      `;

      const nextNum = serieRow.lastNumber + 1;
      await tx.documentSerie.update({
        where: { type_serie: { type: docTypeEnum, serie } },
        data: { lastNumber: nextNum },
      });

      const fullNumber = formatCorrelativo(serie, nextNum);

      // 4. Crear SaleDocument
      const buyer = data.buyer ?? { docType: "DNI", docNumber: "00000000", name: "CLIENTE VARIOS" };

      const document = await tx.saleDocument.create({
        data: {
          type: docTypeEnum,
          serie,
          correlativo: nextNum,
          fullNumber,
          posSessionId: data.posSessionId,
          cashierId: session.user.id,
          customerId: buyer.customerId ?? null,
          buyerDocType: buyer.docType,
          buyerDocNumber: buyer.docNumber,
          buyerName: buyer.name,
          buyerAddress: buyer.address ?? null,
          subtotal: baseImponible,
          igv,
          total: totalConIGV,
          discount: discountAmt,
          paymentMethod: data.paymentMethod,
          montoRecibido: esAdelanto ? (data.montoAdelanto ?? null) : (data.montoRecibido ?? null),
          cambio: esAdelanto ? null : cambio,
          montoAdelanto: esAdelanto ? (data.montoAdelanto ?? null) : null,
          montoEfectivo: data.paymentMethod === "MIXTO" ? (data.paymentSplit?.efectivo || null) : null,
          montoTarjeta:  data.paymentMethod === "MIXTO" ? (data.paymentSplit?.tarjeta  || null) : null,
          montoYape:     data.paymentMethod === "MIXTO" ? (data.paymentSplit?.yape     || null) : null,
          location: stockSource,
          status: esAdelanto ? DocumentStatus.PARTIAL : (isNotaVenta ? DocumentStatus.ACCEPTED : DocumentStatus.DRAFT),
          items: {
            create: itemsData.map(({ item, product, unitPrice, lensPrice, lineTotal, description }) => {
              const lineIgv = calcularIGV(lineTotal);
              return {
                productId: item.productId,
                description,
                quantity: item.quantity,
                unitPrice: (unitPrice + lensPrice) / 1.18,
                igvAmount: lineIgv.igv * item.quantity,
                lineTotal,
                lensType: item.lensType ?? null,
                lensSubType: item.lensSubType ?? null,
                lensVariant: item.lensVariant ?? null,
                lensPrice: lensPrice > 0 ? lensPrice : null,
              };
            }),
          },
        },
        include: { items: { include: { product: true } } },
      });

      // 5. Actualizar totales de sesión
      const sessionUpdate: Record<string, unknown> = {
        totalVentas: { increment: montoParaSesion },
        countVentas: { increment: 1 },
      };
      if (data.paymentMethod === "MIXTO" && data.paymentSplit) {
        const split = data.paymentSplit;
        if (split.efectivo > 0) sessionUpdate.totalEfectivo = { increment: split.efectivo };
        if (split.tarjeta  > 0) sessionUpdate.totalTarjeta  = { increment: split.tarjeta  };
        if (split.yape     > 0) sessionUpdate.totalYape     = { increment: split.yape     };
      } else {
        if (data.paymentMethod === "EFECTIVO") sessionUpdate.totalEfectivo = { increment: montoParaSesion };
        if (data.paymentMethod === "TARJETA")  sessionUpdate.totalTarjeta  = { increment: montoParaSesion };
        if (data.paymentMethod === "YAPE")     sessionUpdate.totalYape     = { increment: montoParaSesion };
      }

      await tx.posSession.update({
        where: { id: data.posSessionId },
        data: sessionUpdate,
      });

      return { document, buyer };
    });

    const doc = result.document;

    // Para Nota de Venta: no enviar a SUNAT
    if (isNotaVenta) {
      return NextResponse.json({
        id: doc.id,
        fullNumber: doc.fullNumber,
        total: Number(doc.total),
        cambio: Number(doc.cambio ?? 0),
        montoAdelanto: doc.montoAdelanto ? Number(doc.montoAdelanto) : null,
        status: esAdelanto ? "PARTIAL" : "ACCEPTED",
        pdfUrl: null,
        qrCode: null,
      });
    }

    // Para BOLETA/FACTURA: intentar emisión a ApiSunat (fuera de la transacción)
    try {
      const apisunatItems = buildApiSunatItems(
        doc.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotal: Number(i.lineTotal) })),
        Number(doc.total),
      );

      const payload = buildApiSunatPayload({
        tipo: doc.type === DocumentType.FACTURA ? 1 : 2,
        serie: doc.serie,
        numero: doc.correlativo,
        cliente: {
          docType: result.buyer.docType,
          docNumber: result.buyer.docNumber,
          name: result.buyer.name,
          address: result.buyer.address ?? undefined,
          email: result.buyer.email ?? undefined,
        },
        items: apisunatItems,
        totalConIGV: Number(doc.total),
      });

      const apisunatResult = await emitirDocumento(payload);
      const isAccepted = apisunatResult.success && apisunatResult.payload.estado === "ACEPTADO";

      await prisma.saleDocument.update({
        where: { id: doc.id },
        data: {
          status: isAccepted ? DocumentStatus.ACCEPTED : DocumentStatus.REJECTED,
          nubefactId: apisunatResult.payload.hash,
          nubefactResponse: apisunatResult as object,
          pdfUrl: apisunatResult.payload.pdf.a4,
          xmlUrl: apisunatResult.payload.xml,
          qrCode: null,
          sunatCdrCode: apisunatResult.payload.estado,
          sunatCdrDesc: apisunatResult.message,
          submittedAt: new Date(),
        },
      });

      return NextResponse.json({
        id: doc.id,
        fullNumber: doc.fullNumber,
        total: Number(doc.total),
        cambio: Number(doc.cambio ?? 0),
        status: isAccepted ? "ACCEPTED" : "REJECTED",
        pdfUrl: apisunatResult.payload.pdf.a4,
        qrCode: null,
      });

    } catch {
      await prisma.saleDocument.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.PENDING },
      });
      await enqueueDocument(doc.id);

      return NextResponse.json({
        id: doc.id,
        fullNumber: doc.fullNumber,
        total: Number(doc.total),
        cambio: Number(doc.cambio ?? 0),
        status: "PENDING",
        pdfUrl: null,
        qrCode: null,
      });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar la venta";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
