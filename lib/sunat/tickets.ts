/**
 * Sondeo de los tickets de anulación.
 *
 * Anular no es como emitir. `sendBill` devuelve el CDR en la misma llamada;
 * `sendSummary` devuelve sólo un ticket y el resultado se recoge después. Por
 * eso existe `VOID_PENDING`: la ventana entre pedir la baja y saber si SUNAT la
 * aceptó.
 *
 * Tres cosas comprobadas contra beta que mandan sobre el diseño de esto:
 *
 * 1. **Un ticket es de un solo uso.** El segundo `getStatus` sobre un ticket ya
 *    resuelto responde `0127` con algo que no es un ZIP. El CDR se guarda en la
 *    misma transacción en que se lee, porque no hay forma de volver a pedirlo.
 * 2. **El CDR trae una sola respuesta y su referencia es el ID de la RA/RC**, no
 *    el del comprobante anulado. Por eso se manda un documento por RA/RC: así la
 *    única respuesta es inequívocamente la suya.
 * 3. Lo normal es que resuelva en el primer sondeo, unos segundos después de
 *    enviar. El `98` existe y hay que tratarlo, pero no es el caso común.
 */

import { prisma } from "@/lib/prisma";
import {
  DocumentStatus,
  EstadoEnvioSunat,
  TipoEnvioSunat,
  type Prisma,
} from "@/app/generated/prisma/client";
import { documentoConElMovimiento, revertirStockYCaja } from "@/lib/reversion-venta";
import { reindexarEnEcommerce } from "@/lib/reindex-ecommerce";
import { getConfigSunat } from "./config";
import { getStatus, type EstadoTicket } from "./cliente-soap";
import { extraerCdr } from "./empaquetado";
import { leerCdr, type Cdr } from "./cdr";
import { estadoDocumentoPara, ESTADOS_ACEPTADOS } from "./estados";

/** Lo que responde SUNAT cuando el ticket ya se consultó y ya no tiene nada que dar. */
export const CODIGO_TICKET_CONSUMIDO = "0127";

/** Tras esto el ticket deja de sondearse solo y necesita que alguien lo mire. */
export const MAX_INTENTOS_TICKET = 20;

const ESPERA_BASE_MS = 30_000;
const ESPERA_TECHO_MS = 30 * 60_000;

export type Veredicto =
  | { clase: "EN_PROCESO" }
  | {
      clase: "ACEPTADO";
      codigo: string;
      descripcion: string;
      observaciones: string[];
      conObservaciones: boolean;
      cdrXml: string;
    }
  | { clase: "RECHAZADO"; codigo: string; descripcion: string; cdrXml: string | null }
  /** SUNAT ya no tiene el CDR y nosotros tampoco: hace falta mirarlo a mano. */
  | { clase: "PERDIDO"; codigo: string; mensaje: string }
  | { clase: "TRANSITORIO"; mensaje: string };

/**
 * Qué dice SUNAT sobre un ticket.
 *
 * `cdrXml` lo extrae quien llama, porque descomprimir es asíncrono y esto tiene
 * que poder probarse sin red ni base.
 */
export function interpretarTicket(estado: EstadoTicket, cdrXml: string | null): Veredicto {
  if (estado.enProceso) return { clase: "EN_PROCESO" };

  if (estado.codigo === CODIGO_TICKET_CONSUMIDO) {
    return {
      clase: "PERDIDO",
      codigo: estado.codigo,
      mensaje:
        `SUNAT respondió ${estado.codigo}: el ticket ya se consultó y no devuelve el CDR otra vez. ` +
        "Hay que comprobar en SEE-SOL si la baja llegó a aplicarse.",
    };
  }

  if (cdrXml) {
    // La palabra final la tiene el CDR, no el statusCode: un ticket `0` con una
    // línea 2033 es un rechazo, y darlo por bueno marcaría como anulado un
    // comprobante que sigue vivo.
    let cdr: Cdr;
    try {
      cdr = leerCdr(cdrXml);
    } catch (err) {
      return {
        clase: "TRANSITORIO",
        mensaje: `El CDR no se pudo leer: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (cdr.aceptado) {
      return {
        clase: "ACEPTADO",
        codigo: cdr.codigo,
        descripcion: cdr.descripcion,
        observaciones: cdr.observaciones,
        conObservaciones: cdr.conObservaciones,
        cdrXml,
      };
    }
    return { clase: "RECHAZADO", codigo: cdr.codigo, descripcion: cdr.descripcion, cdrXml };
  }

  // 99 = "procesado con errores": SUNAT evaluó y dijo que no. Sin contenido no
  // hay código accionable, pero sigue siendo un rechazo, no un fallo de envío.
  if (estado.codigo === "99") {
    return {
      clase: "RECHAZADO",
      codigo: estado.codigo,
      descripcion: estado.mensaje || "SUNAT procesó la anulación con errores.",
      cdrXml: null,
    };
  }

  // Cualquier otro código —incluido un `0` sin contenido— se vuelve a preguntar.
  // Declarar rechazo ante algo que no entendemos sería inventarse que SUNAT
  // dijo que no.
  return {
    clase: "TRANSITORIO",
    mensaje: `statusCode ${estado.codigo || "(vacío)"} sin CDR: ${estado.mensaje || "sin mensaje"}`,
  };
}

/**
 * Cuánto hay que esperar desde que se creó el ticket antes del intento N.
 *
 * El retroceso se ancla en `createdAt` y no en "el último intento" porque no hay
 * columna donde guardar ese instante — y de hecho sale mejor: es un horario
 * absoluto, inmune a que dos pasadas del sondeo se solapen.
 */
export function esperaAcumuladaMs(intentos: number): number {
  let total = 0;
  for (let i = 0; i < intentos; i++) {
    total += Math.min(ESPERA_BASE_MS * 2 ** i, ESPERA_TECHO_MS);
  }
  return total;
}

/** Si a este ticket le toca preguntar ya. */
export function tocaConsultar(
  ticket: { createdAt: Date; intentos: number },
  ahora: Date = new Date(),
): boolean {
  return ahora.getTime() - ticket.createdAt.getTime() >= esperaAcumuladaMs(ticket.intentos);
}

export interface ResultadoTickets {
  consultados: number;
  anulados: number;
  rechazados: number;
  enProceso: number;
  problemas: number;
}

/**
 * El estado al que vuelve un comprobante cuando SUNAT rechaza su baja.
 *
 * No hay columna que guarde "el estado anterior", pero no hace falta: se deriva
 * del envío de emisión, que es la verdad sobre cómo quedó el comprobante.
 */
async function estadoPrevio(documentId: string): Promise<DocumentStatus> {
  const emision = await prisma.sunatEnvio.findFirst({
    where: {
      documentId,
      tipoEnvio: TipoEnvioSunat.INDIVIDUAL,
      estado: { in: ESTADOS_ACEPTADOS },
    },
    orderBy: { createdAt: "desc" },
  });

  return emision ? estadoDocumentoPara(emision.estado) : DocumentStatus.ACCEPTED;
}

/**
 * Drena los tickets pendientes.
 *
 * Lo llama el intervalo de `instrumentation.ts` y el endpoint de la cola. Cada
 * ticket se resuelve por separado: que uno falle no puede dejar sin mirar a los
 * demás.
 */
export async function procesarTickets(limite = 10): Promise<ResultadoTickets> {
  const resultado: ResultadoTickets = {
    consultados: 0,
    anulados: 0,
    rechazados: 0,
    enProceso: 0,
    problemas: 0,
  };

  const pendientes = await prisma.sunatTicket.findMany({
    where: {
      estado: EstadoEnvioSunat.ENVIADO,
      ticket: { not: null },
      intentos: { lt: MAX_INTENTOS_TICKET },
    },
    orderBy: { createdAt: "asc" },
    take: limite,
    include: { envios: { select: { id: true, documentId: true } } },
  });

  const ahora = new Date();
  const config = getConfigSunat();

  for (const fila of pendientes.filter((t) => tocaConsultar(t, ahora))) {
    resultado.consultados++;

    let veredicto: Veredicto;
    try {
      const estado = await getStatus(config, fila.ticket as string);

      // Descomprimir puede fallar justo cuando SUNAT devuelve algo que no es un
      // ZIP (le pasa al ticket ya consumido), y eso no debe tumbar la pasada.
      let cdrXml: string | null = null;
      if (estado.cdrBase64) {
        try {
          cdrXml = (await extraerCdr(estado.cdrBase64)).xml;
        } catch {
          cdrXml = null;
        }
      }

      veredicto = interpretarTicket(estado, cdrXml);
    } catch (err) {
      veredicto = {
        clase: "TRANSITORIO",
        mensaje: err instanceof Error ? err.message : String(err),
      };
    }

    await aplicarVeredicto(fila, veredicto, resultado);
  }

  return resultado;
}

type TicketPendiente = {
  id: string;
  intentos: number;
  envios: { id: string; documentId: string }[];
};

async function aplicarVeredicto(
  fila: TicketPendiente,
  veredicto: Veredicto,
  resultado: ResultadoTickets,
): Promise<void> {
  if (veredicto.clase === "EN_PROCESO" || veredicto.clase === "TRANSITORIO") {
    if (veredicto.clase === "EN_PROCESO") resultado.enProceso++;
    else resultado.problemas++;

    await prisma.sunatTicket.update({
      where: { id: fila.id },
      data: {
        intentos: { increment: 1 },
        ...(veredicto.clase === "TRANSITORIO" && { ultimoError: veredicto.mensaje.slice(0, 500) }),
      },
    });
    return;
  }

  if (veredicto.clase === "PERDIDO") {
    resultado.problemas++;
    // No se marca ni anulado ni rechazado: nadie sabe qué pasó, y elegir uno de
    // los dos sería inventárselo. Queda a la vista para que alguien lo mire.
    await prisma.sunatTicket.update({
      where: { id: fila.id },
      data: {
        estado: EstadoEnvioSunat.ERROR_ENVIO,
        codigoRespuesta: veredicto.codigo,
        ultimoError: veredicto.mensaje.slice(0, 500),
        intentos: { increment: 1 },
        resueltoAt: new Date(),
      },
    });
    return;
  }

  const aceptado = veredicto.clase === "ACEPTADO";
  const estadoEnvio = aceptado
    ? veredicto.conObservaciones
      ? EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES
      : EstadoEnvioSunat.ACEPTADO
    : EstadoEnvioSunat.RECHAZADO;

  const documentIds = fila.envios.map((e) => e.documentId);
  const { cdrXml } = veredicto;
  /** Productos cuyo stock devuelve la anulación: hay que avisar al buscador web. */
  const productosDevueltos: string[] = [];

  // Todo junto: el ticket es de un solo uso, así que si el CDR no se guarda
  // ahora no hay forma de volver a pedirlo. Y la reversión va aquí dentro, no
  // después: dejar el stock devuelto con el comprobante todavía vigente sería
  // peor que no revertir.
  await prisma.$transaction(async (tx) => {
    await tx.sunatTicket.update({
      where: { id: fila.id },
      data: {
        estado: estadoEnvio,
        cdrXml,
        codigoRespuesta: veredicto.codigo,
        mensajeRespuesta: veredicto.descripcion,
        intentos: { increment: 1 },
        resueltoAt: new Date(),
      },
    });

    for (const envio of fila.envios) {
      await tx.sunatEnvio.update({
        where: { id: envio.id },
        data: {
          estado: estadoEnvio,
          cdrXml,
          codigoRespuesta: veredicto.codigo,
          mensajeRespuesta: veredicto.descripcion,
          observaciones: veredicto.clase === "ACEPTADO" ? veredicto.observaciones : [],
          respondidoAt: new Date(),
        },
      });
    }

    for (const documentId of documentIds) {
      if (aceptado) {
        productosDevueltos.push(...(await deshacerVenta(tx, documentId, veredicto.codigo)));
      } else {
        await tx.saleDocument.update({
          where: { id: documentId },
          data: {
            status: await estadoPrevio(documentId),
            sunatCdrDesc: `Baja rechazada (${veredicto.codigo}): ${veredicto.descripcion}`.slice(0, 500),
          },
        });
      }
    }
  });

  // Fuera de la transacción, y sólo cuando SUNAT confirmó: reindexar antes del
  // commit dejaría al ecommerce leyendo el stock de antes de la devolución.
  await reindexarEnEcommerce(productosDevueltos);

  if (aceptado) resultado.anulados += documentIds.length;
  else resultado.rechazados += documentIds.length;
}

/**
 * SUNAT aceptó la baja: se deshace la venta entera.
 *
 * Anular no es sólo marcar el comprobante. El stock vuelve y la caja se
 * descuenta, y si el comprobante nació de convertir una nota de venta, la nota
 * se anula con él: el movimiento era suyo, así que dejarla viva la haría
 * reclamar un stock que ya volvió y volvería a ofrecerla para convertir.
 */
async function deshacerVenta(
  tx: Prisma.TransactionClient,
  documentId: string,
  codigoCdr: string,
): Promise<string[]> {
  const comprobante = await tx.saleDocument.findUnique({
    where: { id: documentId },
    select: { id: true, notes: true, voidReason: true },
  });
  if (!comprobante) return [];

  /** Los productos a los que se les devolvió stock, para reindexar tras el commit. */
  const devueltos: string[] = [];

  const conMovimiento = await documentoConElMovimiento(tx, comprobante);

  if (conMovimiento) {
    const venta = await tx.saleDocument.findUnique({
      where: { id: conMovimiento.id },
      include: {
        items: {
          select: { productId: true, quantity: true, product: { select: { trackInventory: true } } },
        },
      },
    });

    if (venta) {
      const reversion = await revertirStockYCaja(tx, venta);
      if (reversion.stock) devueltos.push(...venta.items.map((i) => i.productId));

      if (conMovimiento.esOrigen) {
        await tx.saleDocument.update({
          where: { id: venta.id },
          data: {
            status: DocumentStatus.VOIDED,
            voidedAt: new Date(),
            voidReason: comprobante.voidReason,
          },
        });
      }
    }
  }

  await tx.saleDocument.update({
    where: { id: documentId },
    data: { status: DocumentStatus.VOIDED, voidedAt: new Date(), voidCdrCode: codigoCdr },
  });

  return devueltos;
}
