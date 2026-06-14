import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Día actual en hora de Perú (UTC-5), igual que el endpoint de ventas.
  // En Railway el servidor corre en UTC, así que calcular con setHours() local
  // dejaba fuera las ventas del día peruano. Lima no tiene horario de verano.
  const limaDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const today = new Date(`${limaDate}T00:00:00-05:00`);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  // Hora de Lima de una fecha (UTC-5 fijo)
  const limaHour = (dt: Date | string) => (new Date(dt).getUTCHours() + 24 - 5) % 24;

  const [todayDocs, yesterdayDocs, lowStock] = await Promise.all([
    prisma.saleDocument.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        status: { in: ["ACCEPTED", "PENDING", "PARTIAL"] },
      },
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
    prisma.saleDocument.findMany({
      where: {
        createdAt: { gte: yesterday, lt: today },
        status: { in: ["ACCEPTED", "PENDING", "PARTIAL"] },
      },
      select: { total: true, status: true, montoAdelanto: true },
    }),
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

  // Helper: monto efectivo de un doc (PARTIAL → solo el adelanto recibido)
  const montoEfectivo = (d: { status: string; total: { toString(): string }; montoAdelanto: { toString(): string } | null }) =>
    d.status === "PARTIAL" ? Number(d.montoAdelanto ?? 0) : Number(d.total);

  const totalVentas    = todayDocs.reduce((s, d) => s + montoEfectivo(d), 0);
  const countVentas    = todayDocs.length;
  const totalAyer      = yesterdayDocs.reduce((s, d) => s + montoEfectivo(d), 0);
  const deltaVentas    = totalAyer > 0 ? ((totalVentas - totalAyer) / totalAyer) * 100 : 0;
  const ticketPromedio = countVentas > 0 ? totalVentas / countVentas : 0;

  // Por ubicación
  const tiendaDocs  = todayDocs.filter((d) => d.location === "TIENDA");
  const almacenDocs = todayDocs.filter((d) => d.location === "ALMACEN");

  // Adelantos pendientes (PARTIAL)
  const partialDocs = todayDocs.filter((d) => d.status === "PARTIAL");

  // Métodos de pago
  const sumaMethod = (method: string) =>
    todayDocs.filter((d) => d.paymentMethod === method).reduce((s, d) => s + montoEfectivo(d), 0);

  // Hourly buckets (08-21)
  const hourly = Array.from({ length: 14 }, (_, i) => {
    const h = 8 + i;
    const bucket = todayDocs.filter((d) => limaHour(d.createdAt) === h);
    return {
      hour: `${String(h).padStart(2, "0")}`,
      total: bucket.reduce((s, d) => s + montoEfectivo(d), 0),
    };
  });

  return NextResponse.json({
    totalVentas,
    countVentas,
    ticketPromedio,
    margenEstimado: totalVentas * 0.28,
    deltaVentas,
    byType: {
      boletas:    todayDocs.filter((d) => d.type === "BOLETA").length,
      facturas:   todayDocs.filter((d) => d.type === "FACTURA").length,
      notasVenta: todayDocs.filter((d) => d.type === "NOTA_VENTA").length,
    },
    byMethod: {
      efectivo: sumaMethod("EFECTIVO"),
      tarjeta:  sumaMethod("TARJETA"),
      yape:     sumaMethod("YAPE"),
      mixto:    sumaMethod("MIXTO"),
    },
    byLocation: {
      tienda:  { total: tiendaDocs.reduce((s, d) => s + montoEfectivo(d), 0), count: tiendaDocs.length },
      almacen: { total: almacenDocs.reduce((s, d) => s + montoEfectivo(d), 0), count: almacenDocs.length },
    },
    adelantosPendientes: {
      count:         partialDocs.length,
      montoRecibido: partialDocs.reduce((s, d) => s + Number(d.montoAdelanto ?? 0), 0),
      montoTotal:    partialDocs.reduce((s, d) => s + Number(d.total), 0),
    },
    hourly,
    lowStock: lowStock.map((p) => ({
      id:           p.id,
      name:         p.name,
      sku:          p.sku ?? null,
      stock:        p.stock,
      stockTienda:  p.stockTienda,
      stockAlmacen: p.stockAlmacen,
      category:     p.categories[0]?.name ?? "-",
    })),
  });
}
