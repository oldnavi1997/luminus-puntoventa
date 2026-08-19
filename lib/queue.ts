/**
 * Cola de reintentos de emisión.
 *
 * Sólo entra aquí lo TRANSITORIO: timeouts y caídas de red. Un rechazo del
 * validador o un dato incompleto del comprador se reintentarían igual de mal,
 * así que esos se quedan fuera y esperan corrección a mano.
 *
 * El reintento es seguro frente a duplicados porque `emitirComprobante`
 * comprueba primero si el documento ya tiene un envío aceptado.
 */

import { prisma } from "./prisma";
import { emitirComprobante } from "./sunat/emitir";

/** Tras 10 intentos deja de intentarse solo; requiere mirada humana. */
const MAX_INTENTOS = 10;

export async function enqueueDocument(documentId: string) {
  await prisma.documentQueue.upsert({
    where: { documentId },
    create: { documentId },
    update: { nextRetryAt: new Date() },
  });
}

export interface ResultadoCola {
  procesados: number;
  aceptados: number;
  errores: number;
  agotados: number;
}

/**
 * Drena la cola.
 *
 * Lo llama el endpoint `/api/queue/process`, que a su vez dispara un cron.
 * Antes nadie lo llamaba: los comprobantes entraban en la cola y se quedaban
 * ahí para siempre.
 */
export async function processQueue(limite = 10): Promise<ResultadoCola> {
  const pendientes = await prisma.documentQueue.findMany({
    where: { nextRetryAt: { lte: new Date() }, attempts: { lt: MAX_INTENTOS } },
    take: limite,
    orderBy: { nextRetryAt: "asc" },
  });

  const resultado: ResultadoCola = { procesados: 0, aceptados: 0, errores: 0, agotados: 0 };

  for (const entrada of pendientes) {
    const doc = await prisma.saleDocument.findUnique({
      where: { id: entrada.documentId },
      select: { id: true },
    });

    // El documento pudo anularse o borrarse mientras esperaba.
    if (!doc) {
      await prisma.documentQueue.delete({ where: { id: entrada.id } });
      continue;
    }

    try {
      const emision = await emitirComprobante(entrada.documentId);
      resultado.procesados++;

      if (emision.reintentable) {
        await reprogramar(entrada.id, entrada.attempts, emision.mensaje);
        resultado.errores++;
      } else {
        // Aceptado o rechazado, la cola ya no tiene nada que hacer: un rechazo
        // necesita corrección humana, no otro intento.
        await prisma.documentQueue.delete({ where: { id: entrada.id } });
        if (emision.aceptado) resultado.aceptados++;
        else resultado.agotados++;
      }
    } catch (err) {
      // Sólo llega aquí lo que `emitirComprobante` considera error de
      // programación (documento inexistente o nota de venta).
      await reprogramar(entrada.id, entrada.attempts, err instanceof Error ? err.message : String(err));
      resultado.errores++;
    }
  }

  return resultado;
}

/** Retroceso exponencial, con techo de una hora. */
async function reprogramar(id: string, intentosPrevios: number, error: string) {
  const intentos = intentosPrevios + 1;
  const segundos = Math.min(Math.pow(2, intentos) * 60, 3600);

  await prisma.documentQueue.update({
    where: { id },
    data: {
      attempts: intentos,
      lastError: error.slice(0, 500),
      nextRetryAt: new Date(Date.now() + segundos * 1000),
    },
  });
}
