/**
 * Orquestador de la anulación: XML → firma → ZIP → SUNAT → ticket → base.
 *
 * Es el gemelo de `emitir.ts` y sigue sus mismas dos reglas de orden: el
 * registro se crea ANTES de enviar, y se comprueba antes de firmar nada que el
 * documento pueda anularse. Pero termina distinto: `sendSummary` no devuelve un
 * CDR sino un ticket, así que esto acaba con el comprobante en `VOID_PENDING` y
 * es `tickets.ts` quien lo lleva a `VOIDED`.
 *
 * Lo que NO hace: mover stock ni caja. Eso sólo ocurre cuando SUNAT confirma,
 * porque revertir aquí y que la baja se rechazara obligaría a deshacer la
 * reversión con otra escritura que también puede fallar.
 */

import { prisma } from "@/lib/prisma";
import {
  DocumentStatus,
  DocumentType,
  EstadoEnvioSunat,
  TipoEnvioSunat,
} from "@/app/generated/prisma/client";
import { getConfigSunat } from "./config";
import { obtenerCertificado } from "./certificado-memo";
import { firmarComprobante, extraerDigest } from "./firma";
import { empaquetarXml } from "./empaquetado";
import { sendSummary } from "./cliente-soap";
import { construirComunicacionBaja, MAX_MOTIVO } from "./ubl/baja";
import { CONDICION, construirResumenAnulacion } from "./ubl/resumen";
import { importesDelXml } from "./ubl/leer-comprobante";
import { archivoXml, archivoZip, nombreResumen } from "./nombres";
import { codigoTipoDocIdentidad, TIPO_DOCUMENTO } from "./catalogos";
import { fechaLima } from "./ubl/comun";
import { crearTicketConCorrelativo, diaLima, type TipoTicket } from "./correlativo-resumen";
import { plazoDeBaja } from "./plazos";
import { ESTADOS_ACEPTADOS } from "./estados";
import { ErrorSunat } from "./errores";

export interface ResultadoAnulacion {
  ticketId: string;
  /** El ticket de SUNAT. `null` si el envío falló antes de obtenerlo. */
  ticket: string | null;
  nombreArchivo: string;
  estadoDocumento: DocumentStatus;
  mensaje: string;
}

/** Motivos por los que un comprobante no se puede anular, ya redactados. */
export class ErrorAnulacion extends Error {
  readonly codigo = "NO_ANULABLE";
  constructor(
    mensaje: string,
    /** El status HTTP que le corresponde a la ruta. */
    readonly status: number,
  ) {
    super(mensaje);
    this.name = "ErrorAnulacion";
  }
}

type DocumentoAAnular = Awaited<ReturnType<typeof cargarDocumento>>;

async function cargarDocumento(documentId: string) {
  const doc = await prisma.saleDocument.findUnique({
    where: { id: documentId },
    include: {
      sunatEnvios: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doc) throw new ErrorAnulacion("El comprobante no existe.", 404);
  return doc;
}

/**
 * Todo lo que impide anular, comprobado ANTES de escribir o firmar nada.
 *
 * El orden importa: se corta en el primero que falle para que el mensaje sea el
 * que de verdad describe el problema.
 */
export function validarAnulable(doc: DocumentoAAnular, motivo: string, ahora = new Date()): void {
  if (doc.type === DocumentType.NOTA_VENTA) {
    throw new ErrorAnulacion(
      "Las notas de venta son internas y SUNAT no las conoce. Para deshacerla, elimínala desde Ventas.",
      400,
    );
  }

  if (doc.status === DocumentStatus.VOIDED) {
    throw new ErrorAnulacion(`${doc.fullNumber} ya está anulado.`, 409);
  }

  if (doc.status === DocumentStatus.VOID_PENDING) {
    throw new ErrorAnulacion(
      `${doc.fullNumber} ya tiene una baja en curso, esperando la respuesta de SUNAT. ` +
        "Si lleva demasiado, revísalo en Comprobantes antes de volver a intentarlo.",
      409,
    );
  }

  if (
    doc.status !== DocumentStatus.ACCEPTED &&
    doc.status !== DocumentStatus.ACCEPTED_WITH_OBSERVATIONS
  ) {
    throw new ErrorAnulacion(
      `${doc.fullNumber} está en ${doc.status}: SUNAT sólo puede dar de baja lo que aceptó. ` +
        "Si nunca llegó a aceptarse, no hay nada que anular.",
      400,
    );
  }

  const emitido = doc.sunatEnvios.find(
    (e) => e.tipoEnvio === TipoEnvioSunat.INDIVIDUAL && ESTADOS_ACEPTADOS.includes(e.estado),
  );
  if (!emitido) {
    throw new ErrorAnulacion(
      `No hay constancia de que ${doc.fullNumber} llegara a SUNAT desde este POS, así que no se ` +
        "puede dar de baja desde aquí.",
      409,
    );
  }

  const plazo = plazoDeBaja(doc.createdAt, ahora);
  if (plazo.vencido) {
    throw new ErrorAnulacion(
      `El plazo para dar de baja ${doc.fullNumber} venció el ${fechaLima(plazo.limite)}. ` +
        "Pasado ese plazo la única corrección válida es una nota de crédito, que este POS " +
        "todavía no emite: hazla a mano desde SUNAT Operaciones en Línea (SEE-SOL).",
      422,
    );
  }

  const limpio = motivo.trim();
  if (limpio.length < 5) {
    throw new ErrorAnulacion("El motivo de la anulación debe tener al menos 5 caracteres.", 400);
  }
  if (limpio.length > MAX_MOTIVO) {
    throw new ErrorAnulacion(
      `El motivo no puede pasar de ${MAX_MOTIVO} caracteres; llegó con ${limpio.length}.`,
      400,
    );
  }
}

/**
 * Pide a SUNAT la baja de un comprobante.
 *
 * Deja el documento en `VOID_PENDING` y devuelve el ticket. No espera la
 * respuesta: la recoge después `procesarTickets`.
 */
export async function anularComprobante(
  documentId: string,
  opciones: { motivo: string; usuarioId: string },
): Promise<ResultadoAnulacion> {
  const doc = await cargarDocumento(documentId);
  validarAnulable(doc, opciones.motivo);

  const motivo = opciones.motivo.trim();
  const config = getConfigSunat();
  const certificado = obtenerCertificado();

  const esFactura = doc.type === DocumentType.FACTURA;
  const tipoTicket: TipoTicket = esFactura ? "RA" : "RC";
  const generadoEn = new Date();
  const dia = diaLima(generadoEn);

  const emitido = doc.sunatEnvios.find(
    (e) => e.tipoEnvio === TipoEnvioSunat.INDIVIDUAL && ESTADOS_ACEPTADOS.includes(e.estado),
  );

  // Los importes de la RC salen del XML con que SUNAT registró la boleta, no de
  // las columnas de la venta: es lo único que garantiza que cuadran al céntimo.
  const importes = esFactura ? null : importesDelXml(emitido!.xmlFirmado);

  // El correlativo va dentro del XML firmado, así que construir y firmar tiene
  // que ocurrir DENTRO del bucle que lo reserva: si hay colisión, se re-firma.
  const ticketFila = await crearTicketConCorrelativo(
    {
      async ultimoCorrelativo(tipo, fecha) {
        const ultimo = await prisma.sunatTicket.findFirst({
          where: { tipo, fechaReferencia: fecha },
          orderBy: { correlativo: "desc" },
          select: { correlativo: true },
        });
        return ultimo?.correlativo ?? null;
      },
      async crear(datos) {
        return prisma.sunatTicket.create({
          data: { ...datos, estado: EstadoEnvioSunat.GENERADO },
        });
      },
    },
    tipoTicket,
    dia,
    (correlativo) => {
      const xml = esFactura
        ? construirComunicacionBaja({
            correlativo,
            generadoEn,
            fechaEmision: doc.createdAt,
            lineas: [
              {
                tipoDocumento: TIPO_DOCUMENTO.FACTURA,
                serie: doc.serie,
                correlativo: doc.correlativo,
                motivo,
              },
            ],
            config,
          })
        : construirResumenAnulacion({
            correlativo,
            generadoEn,
            fechaEmision: doc.createdAt,
            lineas: [
              {
                tipoDocumento: TIPO_DOCUMENTO.BOLETA,
                serie: doc.serie,
                correlativo: doc.correlativo,
                condicion: CONDICION.ANULAR,
                adquirente: doc.buyerDocNumber
                  ? {
                      tipoDoc: codigoTipoDocIdentidad(doc.buyerDocType ?? "DNI"),
                      numeroDoc: doc.buyerDocNumber,
                    }
                  : null,
                ...importes!,
              },
            ],
            config,
          });

      return {
        nombreArchivo: nombreResumen(
          config.ruc,
          esFactura ? TIPO_DOCUMENTO.COMUNICACION_BAJA : TIPO_DOCUMENTO.RESUMEN_DIARIO,
          fechaLima(generadoEn),
          correlativo,
        ),
        xmlFirmado: firmarComprobante(xml, certificado),
      };
    },
  );

  // El envío y el VOID_PENDING van juntos: es la constancia de que esta baja
  // salió, antes de que salga. Si el proceso muere en el siguiente paso, queda
  // el XML firmado y el comprobante visiblemente "anulándose".
  const envio = await prisma.$transaction(async (tx) => {
    const creado = await tx.sunatEnvio.create({
      data: {
        documentId,
        ticketId: ticketFila.id,
        tipoEnvio: esFactura ? TipoEnvioSunat.COMUNICACION_BAJA : TipoEnvioSunat.RESUMEN_DIARIO,
        estado: EstadoEnvioSunat.GENERADO,
        nombreArchivo: ticketFila.nombreArchivo,
        xmlFirmado: ticketFila.xmlFirmado,
        hashXml: extraerDigest(ticketFila.xmlFirmado),
        // Quien anula es el administrador, no el cajero que vendió.
        emitidoPorId: opciones.usuarioId,
      },
    });

    await tx.saleDocument.update({
      where: { id: documentId },
      // `voidedAt` y `voidCdrCode` NO se escriben aquí: serían mentira si SUNAT
      // rechaza la baja.
      data: { status: DocumentStatus.VOID_PENDING, voidReason: motivo },
    });

    return creado;
  });

  const zipB64 = await empaquetarXml(
    archivoXml(ticketFila.nombreArchivo),
    ticketFila.xmlFirmado,
  );

  try {
    const ticket = await sendSummary(config, archivoZip(ticketFila.nombreArchivo), zipB64);

    await prisma.$transaction([
      prisma.sunatTicket.update({
        where: { id: ticketFila.id },
        // `intentos` del ticket cuenta CONSULTAS, no envíos: subirlo aquí
        // retrasaría el primer sondeo media hora larga cuando SUNAT suele
        // resolver en segundos. El intento de envío se cuenta en el SunatEnvio.
        data: { ticket, estado: EstadoEnvioSunat.ENVIADO },
      }),
      prisma.sunatEnvio.update({
        where: { id: envio.id },
        data: { estado: EstadoEnvioSunat.ENVIADO, enviadoAt: new Date(), intentos: { increment: 1 } },
      }),
    ]);

    return {
      ticketId: ticketFila.id,
      ticket,
      nombreArchivo: ticketFila.nombreArchivo,
      estadoDocumento: DocumentStatus.VOID_PENDING,
      mensaje:
        `Baja enviada a SUNAT (ticket ${ticket}). ${doc.fullNumber} quedará anulado cuando ` +
        "SUNAT confirme, normalmente en unos segundos.",
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);

    // SUNAT no llegó a darnos ticket, así que no hay nada que sondear. El
    // comprobante vuelve donde estaba en vez de quedarse "anulándose" para
    // siempre. No se reenvía solo: el mismo cbc:ID chocaría si SUNAT sí llegó a
    // registrarlo, y con uno nuevo se daría de baja dos veces.
    await prisma.$transaction([
      prisma.sunatTicket.update({
        where: { id: ticketFila.id },
        data: { estado: EstadoEnvioSunat.ERROR_ENVIO, ultimoError: mensaje.slice(0, 500) },
      }),
      prisma.sunatEnvio.update({
        where: { id: envio.id },
        data: { estado: EstadoEnvioSunat.ERROR_ENVIO, ultimoError: mensaje.slice(0, 500) },
      }),
      prisma.saleDocument.update({
        where: { id: documentId },
        data: { status: doc.status },
      }),
    ]);

    throw new ErrorSunat(
      err instanceof ErrorSunat ? err.codigo : "DESCONOCIDO",
      `No se pudo enviar la baja de ${doc.fullNumber}: ${mensaje}. El comprobante sigue vigente.`,
      err instanceof ErrorSunat ? err.detalle : {},
      err,
    );
  }
}
