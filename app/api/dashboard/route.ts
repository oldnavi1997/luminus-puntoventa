import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  esFechaISO,
  esPeriodo,
  diasEntre,
  diaLima,
  etiquetaPeriodo,
  finLima,
  granularidadDe,
  hoyLima,
  horaLima,
  inicioLima,
  rangoAnterior,
  rangoDe,
  sumarDias,
  type Periodo,
  type Rango,
} from "@/lib/periodo";

// Estados que cuentan como venta: los mismos de siempre. Un PARTIAL (adelanto)
// suma sólo lo que el cliente ya pagó, no el total del pedido.
const ESTADOS = ["ACCEPTED", "PENDING", "PARTIAL"] as const;

// Tope defensivo: el rango libre lo elige el usuario y la consulta trae filas.
const MAX_DIAS = 366;

type DocConMonto = { status: string; total: unknown; montoAdelanto: unknown };

/** Monto realmente cobrado de un documento. */
function cobrado(d: DocConMonto): number {
  return d.status === "PARTIAL" ? Number(d.montoAdelanto ?? 0) : Number(d.total);
}

function variacion(actual: number, previo: number): number {
  return previo > 0 ? ((actual - previo) / previo) * 100 : 0;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (periodParam !== null && !esPeriodo(periodParam)) {
    return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });
  }
  for (const [nombre, valor] of [["from", fromParam], ["to", toParam]] as const) {
    if (valor !== null && !esFechaISO(valor)) {
      return NextResponse.json({ error: `Fecha ${nombre} inválida` }, { status: 400 });
    }
  }

  const periodo: Periodo = periodParam ?? "day";

  // El cliente manda el rango ya resuelto; sin él se cae al periodo en curso.
  let rango: Rango;
  if (esFechaISO(fromParam) && esFechaISO(toParam)) {
    rango = { from: fromParam, to: toParam };
  } else if (esFechaISO(fromParam)) {
    rango = rangoDe(periodo, fromParam);
  } else {
    rango = rangoDe(periodo, hoyLima());
  }

  if (rango.from > rango.to) {
    return NextResponse.json({ error: "El rango empieza después de terminar" }, { status: 400 });
  }
  if (diasEntre(rango) > MAX_DIAS) {
    return NextResponse.json(
      { error: `El rango no puede pasar de ${MAX_DIAS} días` },
      { status: 400 },
    );
  }

  const previo = rangoAnterior(periodo, rango);
  const desde = inicioLima(rango.from);
  const hasta = finLima(rango.to);
  const desdePrevio = inicioLima(previo.from);
  const hastaPrevio = finLima(previo.to);

  const whereDocs = { createdAt: { gte: desde, lte: hasta }, status: { in: [...ESTADOS] } };

  const [docs, docsPrevios, itemsPorProducto, lowStock] = await Promise.all([
    // El gráfico necesita el `createdAt` de cada venta, así que el periodo
    // activo sí se trae por filas; van acotadas por MAX_DIAS.
    prisma.saleDocument.findMany({
      where: whereDocs,
      select: {
        total: true,
        type: true,
        paymentMethod: true,
        createdAt: true,
        location: true,
        status: true,
        montoAdelanto: true,
        montoEfectivo: true,
        montoTarjeta: true,
        montoYape: true,
      },
    }),
    // El periodo anterior alimenta la comparativa y la silueta del gráfico, así
    // que también necesita el `createdAt`; va con el select mínimo.
    prisma.saleDocument.findMany({
      where: { createdAt: { gte: desdePrevio, lte: hastaPrevio }, status: { in: [...ESTADOS] } },
      select: { total: true, status: true, montoAdelanto: true, createdAt: true },
    }),
    // Ojo: los ítems miden mercadería vendida (lineTotal completo), no caja
    // cobrada — un adelanto pesa aquí por el pedido entero.
    prisma.saleDocumentItem.groupBy({
      by: ["productId"],
      where: { document: whereDocs },
      _sum: { quantity: true, lineTotal: true },
    }),
    // El stock bajo es estado de hoy, no del periodo: queda fuera del rango.
    prisma.product.findMany({
      where: { active: true, stock: { gt: 0, lte: 5 } },
      orderBy: { stock: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        stockTienda: true,
        stockAlmacen: true,
        categories: { select: { name: true }, take: 1 },
      },
    }),
  ]);

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalVentas = docs.reduce((s, d) => s + cobrado(d), 0);
  const countVentas = docs.length;
  const ticketPromedio = countVentas > 0 ? totalVentas / countVentas : 0;

  const totalPrevio = docsPrevios.reduce((s, d) => s + cobrado(d), 0);
  const countPrevio = docsPrevios.length;
  const ticketPrevio = countPrevio > 0 ? totalPrevio / countPrevio : 0;

  // ── Métodos de pago ────────────────────────────────────────────────────────
  // Un MIXTO se reparte entre sus componentes en vez de caer entero en un balde
  // aparte; si el documento no guardó el detalle, queda como mixto sin repartir.
  const byMethod = { efectivo: 0, tarjeta: 0, yape: 0, mixto: 0 };
  let mixtoOperaciones = 0;

  for (const d of docs) {
    const monto = cobrado(d);
    if (d.paymentMethod === "MIXTO") {
      mixtoOperaciones++;
      const ef = Number(d.montoEfectivo ?? 0);
      const ta = Number(d.montoTarjeta ?? 0);
      const ya = Number(d.montoYape ?? 0);
      const detalle = ef + ta + ya;
      if (detalle > 0) {
        // En un PARTIAL el detalle describe el total, así que se prorratea
        // sobre lo efectivamente cobrado.
        byMethod.efectivo += (monto * ef) / detalle;
        byMethod.tarjeta += (monto * ta) / detalle;
        byMethod.yape += (monto * ya) / detalle;
      } else {
        byMethod.mixto += monto;
      }
    } else if (d.paymentMethod === "EFECTIVO") byMethod.efectivo += monto;
    else if (d.paymentMethod === "TARJETA") byMethod.tarjeta += monto;
    else if (d.paymentMethod === "YAPE") byMethod.yape += monto;
    else byMethod.mixto += monto;
  }

  // ── Ubicaciones y adelantos ────────────────────────────────────────────────
  const porUbicacion = (loc: string) => {
    const bucket = docs.filter((d) => d.location === loc);
    return { total: bucket.reduce((s, d) => s + cobrado(d), 0), count: bucket.length };
  };
  const partialDocs = docs.filter((d) => d.status === "PARTIAL");

  // ── Tendencia ──────────────────────────────────────────────────────────────
  const granularity = granularidadDe(rango);

  type Fila = { createdAt: Date; status: string; total: unknown; montoAdelanto: unknown };
  const agrupar = (filas: Fila[], r: Rango) => {
    if (granularity === "hour") {
      return Array.from({ length: 14 }, (_, i) => {
        const h = 8 + i;
        return {
          key: String(h),
          label: String(h).padStart(2, "0"),
          total: filas.filter((d) => horaLima(d.createdAt) === h).reduce((s, d) => s + cobrado(d), 0),
        };
      });
    }
    const porDia = new Map<string, number>();
    for (let f = r.from; f <= r.to; f = sumarDias(f, 1)) porDia.set(f, 0);
    for (const d of filas) {
      const dia = diaLima(d.createdAt);
      if (porDia.has(dia)) porDia.set(dia, (porDia.get(dia) ?? 0) + cobrado(d));
    }
    return [...porDia.entries()].map(([fecha, total]) => ({
      key: fecha,
      label: String(Number(fecha.slice(8, 10))),
      total,
    }));
  };

  // La silueta del periodo anterior se alinea por posición: un mes de 30 días
  // contra uno de 31 deja la última barra sin par, y eso es correcto.
  const previos = agrupar(docsPrevios, previo);
  const buckets = agrupar(docs, rango).map((b, i) => ({ ...b, previo: previos[i]?.total ?? 0 }));

  const conVenta = buckets.filter((b) => b.total > 0).length;
  const promedio = conVenta > 0 ? totalVentas / conVenta : 0;

  // ── Top productos y categorías ─────────────────────────────────────────────
  const productos = await prisma.product.findMany({
    where: { id: { in: itemsPorProducto.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true, categories: { select: { name: true }, take: 1 } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const vendidos = itemsPorProducto
    .map((i) => {
      const p = porId.get(i.productId);
      return {
        id: i.productId,
        name: p?.name ?? "Producto retirado",
        sku: p?.sku ?? null,
        category: p?.categories[0]?.name ?? "Sin categoría",
        units: i._sum.quantity ?? 0,
        revenue: Number(i._sum.lineTotal ?? 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const porCategoria = new Map<string, number>();
  for (const v of vendidos) porCategoria.set(v.category, (porCategoria.get(v.category) ?? 0) + v.revenue);

  return NextResponse.json({
    periodo: {
      period: periodo,
      from: rango.from,
      to: rango.to,
      label: etiquetaPeriodo(periodo, rango),
      granularity,
    },
    anterior: {
      from: previo.from,
      to: previo.to,
      label: etiquetaPeriodo(periodo === "range" ? "range" : periodo, previo),
    },

    totalVentas,
    countVentas,
    ticketPromedio,
    previo: { totalVentas: totalPrevio, countVentas: countPrevio, ticketPromedio: ticketPrevio },
    delta: {
      ventas: variacion(totalVentas, totalPrevio),
      transacciones: variacion(countVentas, countPrevio),
      ticket: variacion(ticketPromedio, ticketPrevio),
    },

    byType: {
      boletas: docs.filter((d) => d.type === "BOLETA").length,
      facturas: docs.filter((d) => d.type === "FACTURA").length,
      notasVenta: docs.filter((d) => d.type === "NOTA_VENTA").length,
    },
    byMethod: { ...byMethod, mixtoOperaciones },
    byLocation: {
      tienda: porUbicacion("TIENDA"),
      almacen: porUbicacion("ALMACEN"),
      web: porUbicacion("WEB"),
    },
    adelantosPendientes: {
      count: partialDocs.length,
      montoRecibido: partialDocs.reduce((s, d) => s + Number(d.montoAdelanto ?? 0), 0),
      montoTotal: partialDocs.reduce((s, d) => s + Number(d.total), 0),
    },

    trend: { granularity, buckets, promedio },

    topProductos: vendidos.slice(0, 6),
    byCategory: [...porCategoria.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),

    lowStock: lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      stock: p.stock,
      stockTienda: p.stockTienda,
      stockAlmacen: p.stockAlmacen,
      category: p.categories[0]?.name ?? "-",
    })),
  });
}
