/**
 * Trae de la base todo lo que necesita una representación impresa.
 *
 * Es la única pieza del módulo que habla con Prisma. Lee, normaliza a un objeto
 * plano, se lo pasa a `construirRepresentacion` —que es puro— y rasteriza el QR.
 *
 * El `select` **no trae `prescription`**: la receta óptica no se imprime, y no
 * traerla es más barato que acordarse de no pintarla.
 */

import { prisma } from "@/lib/prisma";
import { DocumentType, TipoEnvioSunat } from "@/app/generated/prisma/client";
import { extraerDigest } from "@/lib/sunat/firma";
import { importesDelXml } from "@/lib/sunat/ubl/leer-comprobante";
import { ESTADOS_ACEPTADOS } from "@/lib/sunat/estados";
import { construirRepresentacion } from "./armar";
import { datosEmisor } from "./emisor";
import { qrDataUrl } from "./qr-imagen";
import type { ClaseImpresion, EntradaRepresentacion, RepresentacionImpresa } from "./tipos";

export interface OpcionesImpresion {
  /** Sólo hace falta para el recibo de saldo; el resto se deriva del tipo. */
  clase?: ClaseImpresion;
  /**
   * Efectivo entregado al cobrar un saldo. No se persiste en ningún sitio
   * (`cobrar-saldo` guarda el importe pero no el recibido), así que si se quiere
   * la línea de vuelto hay que pasarlo.
   */
  recibido?: number;
}

export class DocumentoNoImprimible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DocumentoNoImprimible";
  }
}

const n = (v: unknown): number => Number(v ?? 0);
const nOpc = (v: unknown): number | null => (v == null ? null : Number(v));

export async function cargarRepresentacion(
  documentId: string,
  opciones: OpcionesImpresion = {},
): Promise<RepresentacionImpresa> {
  const doc = await prisma.saleDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      serie: true,
      correlativo: true,
      fullNumber: true,
      status: true,
      createdAt: true,
      buyerName: true,
      buyerDocType: true,
      buyerDocNumber: true,
      buyerAddress: true,
      total: true,
      discount: true,
      paymentMethod: true,
      montoRecibido: true,
      cambio: true,
      montoAdelanto: true,
      montoEfectivo: true,
      montoTarjeta: true,
      montoYape: true,
      cashier: { select: { name: true } },
      items: {
        select: {
          description: true,
          quantity: true,
          lineTotal: true,
          unitCode: true,
          product: { select: { sku: true } },
        },
      },
      sunatEnvios: {
        where: { tipoEnvio: TipoEnvioSunat.INDIVIDUAL, estado: { in: ESTADOS_ACEPTADOS } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { hashXml: true, xmlFirmado: true },
      },
    },
  });

  if (!doc) throw new DocumentoNoImprimible("El documento no existe.");
  if (doc.items.length === 0) {
    throw new DocumentoNoImprimible(`${doc.fullNumber} no tiene líneas: no hay nada que imprimir.`);
  }

  const clase: ClaseImpresion =
    opciones.clase ?? (doc.type === DocumentType.NOTA_VENTA ? "NOTA_VENTA" : "COMPROBANTE");

  const emision = doc.sunatEnvios[0];
  // Las filas antiguas pueden no tener `hashXml`; el XML firmado siempre lo lleva.
  const hash = emision ? (emision.hashXml ?? extraerDigest(emision.xmlFirmado)) : null;

  const entrada: EntradaRepresentacion = {
    clase,
    emisor: datosEmisor(doc.serie),
    documento: {
      id: doc.id,
      type: doc.type,
      serie: doc.serie,
      correlativo: doc.correlativo,
      fullNumber: doc.fullNumber,
      status: doc.status,
      emitidoEn: doc.createdAt,
    },
    adquirente: {
      nombre: doc.buyerName,
      docType: doc.buyerDocType,
      docNumber: doc.buyerDocNumber,
      direccion: doc.buyerAddress,
    },
    items: doc.items.map((i) => ({
      descripcion: i.description,
      cantidad: i.quantity,
      importeConIgv: n(i.lineTotal),
      unidad: i.unitCode || "NIU",
      codigo: i.product?.sku ?? null,
    })),
    total: n(doc.total),
    descuento: n(doc.discount),
    pago: {
      metodo: doc.paymentMethod,
      montoRecibido: opciones.recibido ?? nOpc(doc.montoRecibido),
      cambio: nOpc(doc.cambio),
      adelanto: nOpc(doc.montoAdelanto),
      efectivo: nOpc(doc.montoEfectivo),
      tarjeta: nOpc(doc.montoTarjeta),
      yape: nOpc(doc.montoYape),
    },
    vendedor: doc.cashier?.name ?? null,
    hash,
  };

  const rep = construirRepresentacion(entrada);

  // Contraste con lo que de verdad viajó a SUNAT. No bloquea la impresión —un
  // comprobante que existe hay que poder imprimirlo— pero deja constancia y lo
  // dice en el papel, que es mejor que un descuadre silencioso.
  if (emision?.xmlFirmado) {
    try {
      const declarado = importesDelXml(emision.xmlFirmado);
      const difiere =
        Math.abs(declarado.total - rep.totales.total) > 0.01 ||
        Math.abs(declarado.igv - rep.totales.igv) > 0.01;

      if (difiere) {
        console.error(
          `[impresion] ${doc.fullNumber}: lo impreso no cuadra con el XML declarado. ` +
            `XML total=${declarado.total} igv=${declarado.igv}; ` +
            `impreso total=${rep.totales.total} igv=${rep.totales.igv}`,
        );
        rep.aviso = rep.aviso ?? "IMPORTES NO COINCIDEN CON LO DECLARADO";
      }
    } catch (err) {
      console.error(`[impresion] ${doc.fullNumber}: no se pudo leer el XML firmado.`, err);
    }
  }

  if (rep.sunat) {
    rep.sunat.qrDataUrl = await qrDataUrl(rep.sunat.cadenaQr);
  }

  return rep;
}
