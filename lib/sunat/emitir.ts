/**
 * Orquestador de la emisión: XML → firma → ZIP → SUNAT → CDR → base de datos.
 *
 * Dos decisiones de orden que no son cosméticas:
 *
 * 1. El `SunatEnvio` se crea ANTES de enviar. Si la petición se corta a medias
 *    —timeout, caída de red— queda constancia de que ese XML salió, con su
 *    hash. Sin eso no habría forma de saber si SUNAT llegó a registrarlo, y
 *    reenviar a ciegas es como se duplica un comprobante.
 *
 * 2. Antes de firmar nada se comprueba si el documento YA tiene un envío
 *    aceptado. Reemitir sobre un comprobante aceptado es el error más caro de
 *    deshacer con SUNAT, así que se corta aquí y no en la ruta que llama.
 */

import { prisma } from "@/lib/prisma";
import {
  DocumentStatus,
  DocumentType,
  EstadoEnvioSunat,
  TipoEnvioSunat,
} from "@/app/generated/prisma/client";
import { getConfigSunat } from "./config";
import { cargarCertificado, verificarVigencia, type CertificadoCargado } from "./certificado";
import { calcularComprobante, type LineaEntrada } from "./calculo";
import { construirComprobante } from "./ubl/comprobante";
import { extraerDigest, firmarComprobante } from "./firma";
import { empaquetarXml, extraerCdr } from "./empaquetado";
import { sendBill } from "./cliente-soap";
import { errorDesdeCdr, leerCdr } from "./cdr";
import { archivoXml, archivoZip, nombreComprobante } from "./nombres";
import { TIPO_DOCUMENTO, UNIDAD_MEDIDA } from "./catalogos";
import { validarAdquirente } from "./validacion";
import { ErrorSunat } from "./errores";

export interface ResultadoEmision {
  /** `null` cuando se rechazó antes de firmar y no llegó a haber envío. */
  envioId: string | null;
  estado: EstadoEnvioSunat;
  aceptado: boolean;
  /** Código del CDR o del error de SUNAT. */
  codigo: string | null;
  mensaje: string;
  observaciones: string[];
  /** Estado en que queda el SaleDocument. */
  estadoDocumento: DocumentStatus;
  /** true si conviene volver a intentarlo tal cual (cola de reintentos). */
  reintentable: boolean;
}

/**
 * Abrir el PKCS#12 cuesta, y el certificado no cambia entre ventas.
 * Se memoriza tras la primera emisión del proceso.
 */
let certificadoMemorizado: CertificadoCargado | null = null;

function obtenerCertificado(): CertificadoCargado {
  if (!certificadoMemorizado) {
    const config = getConfigSunat();
    certificadoMemorizado = cargarCertificado(config.certificado.pfx, config.certificado.clave);
  }
  verificarVigencia(certificadoMemorizado);
  return certificadoMemorizado;
}

/** Sólo para las pruebas. */
export function _olvidarCertificado(): void {
  certificadoMemorizado = null;
}

const ESTADOS_ACEPTADOS: EstadoEnvioSunat[] = [
  EstadoEnvioSunat.ACEPTADO,
  EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES,
];

/** Estado del comprobante que corresponde a cada estado de envío. */
function estadoDocumentoPara(estado: EstadoEnvioSunat): DocumentStatus {
  switch (estado) {
    case EstadoEnvioSunat.ACEPTADO:
      return DocumentStatus.ACCEPTED;
    case EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES:
      return DocumentStatus.ACCEPTED_WITH_OBSERVATIONS;
    case EstadoEnvioSunat.RECHAZADO:
      return DocumentStatus.REJECTED;
    // Un fallo de transporte no dice nada del comprobante: queda PENDING para
    // que la cola lo recoja, no REJECTED.
    case EstadoEnvioSunat.ERROR_ENVIO:
      return DocumentStatus.PENDING;
    default:
      return DocumentStatus.PENDING;
  }
}

/**
 * Emite un comprobante ya creado en la base.
 *
 * No lanza por rechazo ni por fallo de red: devuelve el resultado para que
 * quien llame decida. Sí lanza si el documento no existe o no es emitible,
 * porque eso es un error de programación, no del envío.
 */
export async function emitirComprobante(documentId: string): Promise<ResultadoEmision> {
  const doc = await prisma.saleDocument.findUnique({
    where: { id: documentId },
    include: { items: { include: { product: { select: { sku: true } } } } },
  });

  if (!doc) throw new Error(`No existe el documento ${documentId}`);
  if (doc.type === DocumentType.NOTA_VENTA) {
    throw new Error("Las notas de venta son internas: no se envían a SUNAT.");
  }

  // ── Guarda contra reemisión ───────────────────────────────────────────────
  const yaAceptado = await prisma.sunatEnvio.findFirst({
    where: { documentId, estado: { in: ESTADOS_ACEPTADOS } },
    orderBy: { createdAt: "desc" },
  });

  if (yaAceptado) {
    return {
      envioId: yaAceptado.id,
      estado: yaAceptado.estado,
      aceptado: true,
      codigo: yaAceptado.codigoRespuesta,
      mensaje: yaAceptado.mensajeRespuesta ?? "El comprobante ya estaba aceptado por SUNAT.",
      observaciones: yaAceptado.observaciones,
      estadoDocumento: estadoDocumentoPara(yaAceptado.estado),
      reintentable: false,
    };
  }

  // Configuración y certificado antes que nada.
  //
  // Si faltan variables de entorno o el certificado no abre, eso NO puede
  // tumbar la venta: el stock ya se descontó y el correlativo ya se asignó.
  // Tampoco se encola, porque ningún reintento arregla una variable que no
  // existe: el comprobante queda en SEND_ERROR con el motivo a la vista y se
  // reemite en cuanto el entorno esté bien.
  let config: ReturnType<typeof getConfigSunat>;
  let certificado: CertificadoCargado;
  try {
    config = getConfigSunat();
    certificado = obtenerCertificado();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await prisma.saleDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.SEND_ERROR, sunatCdrDesc: mensaje.slice(0, 500) },
    });
    return {
      envioId: null,
      estado: EstadoEnvioSunat.ERROR_ENVIO,
      aceptado: false,
      codigo: null,
      mensaje: `No se pudo emitir: ${mensaje}`,
      observaciones: [],
      estadoDocumento: DocumentStatus.SEND_ERROR,
      reintentable: false,
    };
  }

  const tipo = doc.type === DocumentType.FACTURA ? "FACTURA" : "BOLETA";
  const total = Number(doc.total);

  const adquirente = {
    docType: doc.buyerDocType ?? "DNI",
    docNumber: doc.buyerDocNumber ?? "",
    name: doc.buyerName ?? "",
    address: doc.buyerAddress,
  };

  // Se valida antes de firmar: así un dato incompleto no gasta una llamada a
  // SUNAT ni deja un envío a medias en la base.
  //
  // El documento ya existe con su correlativo asignado, así que no basta con
  // lanzar: hay que dejarlo en SEND_ERROR para que aparezca en Comprobantes
  // como "hay que corregir esto", y NO en PENDING, que haría que la cola lo
  // reintentara indefinidamente contra el mismo dato malo.
  try {
    validarAdquirente(tipo, adquirente, total);
  } catch (err) {
    if (!(err instanceof ErrorSunat)) throw err;
    await prisma.saleDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.SEND_ERROR, sunatCdrDesc: err.message },
    });
    return {
      envioId: null,
      estado: EstadoEnvioSunat.ERROR_ENVIO,
      aceptado: false,
      codigo: null,
      mensaje: err.message,
      observaciones: [],
      estadoDocumento: DocumentStatus.SEND_ERROR,
      reintentable: false,
    };
  }

  const lineas: LineaEntrada[] = doc.items.map((i) => ({
    descripcion: i.description,
    cantidad: i.quantity,
    // `lineTotal` ya viene con IGV y SIN el descuento global; el prorrateo lo
    // hace `calcularComprobante` contra el total realmente cobrado.
    importeConIgv: Number(i.lineTotal),
    unidadMedida: i.unitCode || UNIDAD_MEDIDA.UNIDAD,
    codigoProducto: i.product?.sku ?? null,
  }));

  const calculo = calcularComprobante(lineas, total);

  const xml = construirComprobante({
    tipo,
    serie: doc.serie,
    correlativo: doc.correlativo,
    emitidoEn: doc.createdAt,
    adquirente,
    calculo,
    config,
  });

  const firmado = firmarComprobante(xml, certificado);
  const raiz = nombreComprobante(
    config.ruc,
    tipo === "FACTURA" ? TIPO_DOCUMENTO.FACTURA : TIPO_DOCUMENTO.BOLETA,
    doc.serie,
    doc.correlativo,
  );

  // Constancia previa al envío: si la llamada se corta, esto es lo único que
  // permitirá saber después qué se mandó.
  const envio = await prisma.sunatEnvio.create({
    data: {
      documentId,
      tipoEnvio: TipoEnvioSunat.INDIVIDUAL,
      estado: EstadoEnvioSunat.GENERADO,
      nombreArchivo: raiz,
      xmlFirmado: firmado,
      hashXml: extraerDigest(firmado),
      emitidoPorId: doc.cashierId,
    },
  });

  const zipB64 = await empaquetarXml(archivoXml(raiz), firmado);

  try {
    await prisma.sunatEnvio.update({
      where: { id: envio.id },
      data: { estado: EstadoEnvioSunat.ENVIADO, enviadoAt: new Date(), intentos: { increment: 1 } },
    });

    const cdrB64 = await sendBill(config, archivoZip(raiz), zipB64);
    const { xml: cdrXml } = await extraerCdr(cdrB64);
    const cdr = leerCdr(cdrXml);

    const estado = !cdr.aceptado
      ? EstadoEnvioSunat.RECHAZADO
      : cdr.conObservaciones
        ? EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES
        : EstadoEnvioSunat.ACEPTADO;

    const estadoDocumento = estadoDocumentoPara(estado);

    await prisma.$transaction([
      prisma.sunatEnvio.update({
        where: { id: envio.id },
        data: {
          estado,
          cdrXml,
          codigoRespuesta: cdr.codigo,
          mensajeRespuesta: cdr.descripcion,
          observaciones: cdr.observaciones,
          respondidoAt: new Date(),
        },
      }),
      prisma.saleDocument.update({
        where: { id: documentId },
        data: {
          status: estadoDocumento,
          sunatCdrCode: cdr.codigo,
          sunatCdrDesc: cdr.descripcion,
          submittedAt: new Date(),
        },
      }),
    ]);

    const rechazo = errorDesdeCdr(cdr);

    return {
      envioId: envio.id,
      estado,
      aceptado: cdr.aceptado,
      codigo: cdr.codigo,
      mensaje: rechazo?.message ?? cdr.descripcion,
      observaciones: cdr.observaciones,
      estadoDocumento,
      reintentable: false,
    };
  } catch (err) {
    const error =
      err instanceof ErrorSunat
        ? err
        : new ErrorSunat("DESCONOCIDO", err instanceof Error ? err.message : String(err), {}, err);

    // Sólo el validador de SUNAT dicta un rechazo. Todo lo demás —credenciales
    // mal puestas, certificado que no abre, red caída, sobre mal armado—
    // significa que SUNAT no llegó a registrar nada, y entonces el comprobante
    // se puede reemitir con el MISMO correlativo en cuanto se corrija.
    //
    // Marcar eso como REJECTED seria dar por quemado un numero que sigue vivo,
    // y ademas mentiria: nadie evaluo el documento. Por eso va a SEND_ERROR,
    // que es "hay algo que arreglar", y no a REJECTED.
    const esRechazoDeSunat = error.codigo === "RECHAZADO";
    const estado = esRechazoDeSunat ? EstadoEnvioSunat.RECHAZADO : EstadoEnvioSunat.ERROR_ENVIO;
    const estadoDocumento = esRechazoDeSunat
      ? DocumentStatus.REJECTED
      : error.reintentable
        ? DocumentStatus.PENDING
        : DocumentStatus.SEND_ERROR;

    await prisma.$transaction([
      prisma.sunatEnvio.update({
        where: { id: envio.id },
        data: {
          estado,
          codigoRespuesta: error.detalle.codigoSunat ?? null,
          mensajeRespuesta: error.detalle.mensajeSunat ?? null,
          ultimoError: error.message,
          respondidoAt: new Date(),
        },
      }),
      prisma.saleDocument.update({
        where: { id: documentId },
        data: {
          status: estadoDocumento,
          sunatCdrCode: error.detalle.codigoSunat ?? null,
          sunatCdrDesc: error.detalle.mensajeSunat ?? error.message,
        },
      }),
    ]);

    return {
      envioId: envio.id,
      estado,
      aceptado: false,
      codigo: error.detalle.codigoSunat ?? null,
      mensaje: error.message,
      observaciones: [],
      estadoDocumento,
      reintentable: error.reintentable,
    };
  }
}
