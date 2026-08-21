/**
 * Los rótulos legibles del comprobante impreso.
 *
 * `lib/sunat/catalogos.ts` tiene los códigos que exige SUNAT ("01", "NIU", "1")
 * pero ningún texto: el XML no necesita palabras. La impresa sí, y hasta ahora
 * el título se deducía del prefijo del `fullNumber` en el propio componente
 * (`Receipt.tsx`), de modo que una serie que empezara por "F" en una nota de
 * venta la habría impreso como factura.
 *
 * Los mapas son exhaustivos sobre los enums a propósito: añadir un valor nuevo
 * rompe el tipo y el test, en vez de imprimir `undefined` en un documento
 * tributario.
 */

import type { DocumentType, PaymentMethod } from "@/app/generated/prisma/client";
import { TIPO_DOC_IDENTIDAD } from "@/lib/sunat/catalogos";

export const TITULO_DOCUMENTO: Record<DocumentType, string> = {
  FACTURA: "FACTURA ELECTRÓNICA",
  BOLETA: "BOLETA DE VENTA ELECTRÓNICA",
  NOTA_VENTA: "NOTA DE VENTA",
};

/** Título del recibo con que se cobra el saldo de un adelanto. No es comprobante. */
export const TITULO_RECIBO_SALDO = "RECIBO DE COBRO DE SALDO";

export const METODO_PAGO: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  YAPE: "Yape",
  MIXTO: "Mixto",
};

/** Catálogo 06 al revés: del código de SUNAT al rótulo que se imprime. */
export const TIPO_DOC_ETIQUETA: Record<string, string> = {
  [TIPO_DOC_IDENTIDAD.SIN_RUC]: "Doc.",
  [TIPO_DOC_IDENTIDAD.DNI]: "DNI",
  [TIPO_DOC_IDENTIDAD.CE]: "C.E.",
  [TIPO_DOC_IDENTIDAD.RUC]: "RUC",
  [TIPO_DOC_IDENTIDAD.PASAPORTE]: "Pasaporte",
  [TIPO_DOC_IDENTIDAD.CEDULA_DIPLOMATICA]: "C. Diplomática",
};

/** Catálogo 03 (unidad de medida), sólo lo que emite este POS. */
export const UNIDAD_ETIQUETA: Record<string, string> = {
  NIU: "UND",
  ZZ: "SERV",
};

export function etiquetaUnidad(codigo: string): string {
  return UNIDAD_ETIQUETA[codigo] ?? codigo;
}

export function etiquetaTipoDoc(codigo: string | null): string {
  return codigo ? (TIPO_DOC_ETIQUETA[codigo] ?? "Doc.") : "Doc.";
}

/**
 * Las leyendas del pie. Se dicen sólo cosas comprobables: que es una
 * representación impresa, bajo qué sistema se emitió y dónde validarla. Nada de
 * afirmar una resolución que no se haya confirmado — para eso está
 * `SUNAT_RESOLUCION`, que por defecto no existe y entonces la línea no sale.
 */
export const LEYENDA_SEE = "Emitida mediante el Sistema de Emisión Electrónica del Contribuyente (SEE-DC).";
export const URL_CONSULTA_SUNAT = "https://ww1.sunat.gob.pe/ol-ti-itconsvalidcpe/ConsValidaCPE.htm";
export const LEYENDA_CONSULTA = `Consulte la validez de este comprobante en: ${URL_CONSULTA_SUNAT}`;

export function leyendaRepresentacion(titulo: string): string {
  return `Representación impresa de la ${titulo}.`;
}

/** Un documento que SUNAT no conoce no puede llamarse representación impresa de nada. */
export const LEYENDA_INTERNA = "DOCUMENTO INTERNO — NO ES COMPROBANTE DE PAGO ELECTRÓNICO";
export const LEYENDA_RECIBO_SALDO = "RECIBO DE COBRO DE SALDO — NO ES COMPROBANTE DE PAGO";
