import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propuestaDeEnvio } from "@/lib/envio";
import {
  esAgenciaShalom,
  MERCADERIA_POR_DEFECTO,
  MERCADERIAS,
  type Mercaderia,
} from "@/lib/shalom/catalogo";
import { generarPlantillaShalom, MAX_FILAS, type FilaShalom } from "@/lib/shalom/plantilla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EnvioShalomVista {
  documentId: string;
  fullNumber: string;
  channel: string;
  createdAt: string;
  nombre: string;
  documento: string | null;
  celular: string;
  destino: string;
  mercaderia: Mercaderia;
  /** La venta web que nadie ha revisado todavía: sus datos los propone el pedido. */
  propuesto: boolean;
  /** Por qué Shalom lo rechazaría; null si la fila está lista. */
  problema: string | null;
}

/**
 * El checkout de la web guarda el celular con prefijo (`+51953451061`); la
 * plantilla de Shalom lleva los 9 dígitos, como su ejemplo.
 */
function celularParaShalom(celular: string): string {
  const digitos = celular.replace(/\D/g, "");
  return digitos.length === 11 && digitos.startsWith("51") ? digitos.slice(2) : digitos || celular;
}

/**
 * Envíos por Shalom de un día, para la carga masiva de su web.
 *
 * Entran las ventas con etiqueta de Shalom y las ventas web cuyo pedido iba
 * por Shalom y aún no tienen etiqueta (con lo que propone el pedido). Las
 * anuladas no: ese paquete no sale.
 *
 * Sin `descargar` devuelve la vista previa (todas las filas, con lo que le
 * falta a cada una). Con `descargar=1` devuelve la plantilla de Shalom llena,
 * solo con las filas listas: una que Shalom rechazaría haría fallar la carga.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const fecha = params.get("fecha") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida (AAAA-MM-DD)" }, { status: 400 });
  }
  // Mismo rango que el historial de ventas: el día entero en hora de Lima.
  const start = new Date(`${fecha}T00:00:00-05:00`);
  const end = new Date(`${fecha}T23:59:59.999-05:00`);

  const docs = await prisma.saleDocument.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: { notIn: ["VOIDED", "VOID_PENDING"] },
      OR: [
        { datosEnvio: { courier: "SHALOM" } },
        {
          datosEnvio: { is: null },
          order: { shippingCourier: { equals: "shalom", mode: "insensitive" } },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fullNumber: true,
      channel: true,
      createdAt: true,
      buyerName: true,
      buyerDocType: true,
      buyerDocNumber: true,
      buyerPhone: true,
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
      datosEnvio: true,
    },
  });

  const filas: EnvioShalomVista[] = docs.map((d) => {
    const e = d.datosEnvio ?? propuestaDeEnvio(d);
    const mercaderia = (MERCADERIAS as readonly string[]).includes(e.mercaderia ?? "")
      ? (e.mercaderia as Mercaderia)
      : MERCADERIA_POR_DEFECTO;
    const problema = !e.numeroDocumento
      ? "Falta el DNI del destinatario"
      : !e.celular.trim()
        ? "Falta el celular"
        : !esAgenciaShalom(e.destino)
          ? "La agencia no está en la lista de Shalom"
          : null;
    return {
      documentId: d.id,
      fullNumber: d.fullNumber,
      channel: d.channel,
      createdAt: d.createdAt.toISOString(),
      nombre: e.nombre,
      documento: e.numeroDocumento,
      celular: celularParaShalom(e.celular),
      destino: e.destino,
      mercaderia,
      propuesto: d.datosEnvio === null,
      problema,
    };
  });

  if (params.get("descargar") !== "1") return NextResponse.json(filas);

  const listas: FilaShalom[] = filas
    .filter((f) => f.problema === null)
    .map((f) => ({
      documento: f.documento!,
      celular: f.celular,
      destino: f.destino,
      mercaderia: f.mercaderia,
      cantidad: 1,
    }));
  if (listas.length === 0) {
    return NextResponse.json({ error: "No hay envíos listos para exportar ese día" }, { status: 422 });
  }
  if (listas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Más de ${MAX_FILAS} envíos en un día` }, { status: 422 });
  }

  const xlsx = await generarPlantillaShalom(listas);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="shalom-${fecha}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
