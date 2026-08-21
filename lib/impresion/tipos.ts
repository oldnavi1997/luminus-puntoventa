/**
 * La forma de una representación impresa, y la entrada con que se construye.
 *
 * `EntradaRepresentacion` es deliberadamente un objeto plano —sin `Decimal`, sin
 * tipos de Prisma— para que `armar.ts` pueda seguir siendo puro y testeable sin
 * base de datos. La conversión la hace `cargar.ts`, que es el único que habla
 * con Prisma.
 */

import type { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";

/**
 * Qué se está imprimiendo. No se deduce del prefijo de la serie: se deriva del
 * tipo del documento, salvo el recibo de saldo, que lo pide quien imprime.
 */
export type ClaseImpresion = "COMPROBANTE" | "NOTA_VENTA" | "RECIBO_SALDO";

export interface EmisorImpreso {
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  /** Dirección fiscal completa, ya compuesta en una línea. */
  domicilioFiscal: string;
  /** Datos del local que emite, según la serie. Cualquiera puede faltar. */
  sucursal: string | null;
  direccionSucursal: string | null;
  telefono: string | null;
  email: string | null;
  /** Resolución que designó al emisor. Vacía mientras no se confirme. */
  resolucion: string | null;
}

export interface ItemImpreso {
  numero: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  unidadEtiqueta: string;
  cantidad: number;
  /** Sin IGV. */
  valorUnitario: number;
  /** Con IGV: es el que se enseña en el impreso. */
  precioUnitario: number;
  igv: number;
  /** Con IGV. */
  importe: number;
}

export interface TotalesImpresos {
  opGravadas: number;
  igv: number;
  descuento: number;
  total: number;
  totalLetras: string;
}

export interface PagoImpreso {
  metodoEtiqueta: string;
  condicion: "CONTADO" | "CRÉDITO";
  /** Desglose de un pago mixto; vacío en el resto. */
  desglose: { etiqueta: string; monto: number }[];
  montoRecibido: number | null;
  cambio: number | null;
  adelanto: number | null;
  saldoPendiente: number | null;
}

export interface DatosSunatImpresos {
  /** El `DigestValue` de la firma. `null` si el envío no lo guardó. */
  hash: string | null;
  cadenaQr: string;
  /** PNG en data-URL, listo para un `<img>` o para embeber en el PDF. */
  qrDataUrl: string;
  leyendas: string[];
}

export interface RepresentacionImpresa {
  clase: ClaseImpresion;
  emisor: EmisorImpreso;
  documento: {
    id: string;
    titulo: string;
    /** Catálogo 01. `null` cuando no es un comprobante electrónico. */
    tipoSunat: string | null;
    serie: string;
    /** Con los ceros de relleno. */
    correlativo: string;
    fullNumber: string;
    fechaEmision: string;
    horaEmision: string;
    moneda: string;
    estado: DocumentStatus;
    anulado: boolean;
  };
  adquirente: {
    nombre: string;
    identificado: boolean;
    tipoDocCodigo: string | null;
    tipoDocEtiqueta: string;
    numeroDoc: string | null;
    direccion: string | null;
  };
  items: ItemImpreso[];
  totales: TotalesImpresos;
  pago: PagoImpreso;
  /** `null` en todo lo que SUNAT no conoce: sin QR, sin hash, sin leyenda legal. */
  sunat: DatosSunatImpresos | null;
  vendedor: string | null;
  /** Aviso que se pinta en grande cuando algo no cuadra. */
  aviso: string | null;
}

/** Lo que `armar.ts` necesita saber, sin un solo tipo de Prisma dentro. */
export interface EntradaRepresentacion {
  clase: ClaseImpresion;
  emisor: EmisorImpreso;
  documento: {
    id: string;
    type: DocumentType;
    serie: string;
    correlativo: number;
    fullNumber: string;
    status: DocumentStatus;
    /** Instante de emisión; se formatea en hora de Lima. */
    emitidoEn: Date;
  };
  adquirente: {
    nombre: string | null;
    docType: string | null;
    docNumber: string | null;
    direccion: string | null;
  };
  items: {
    descripcion: string;
    cantidad: number;
    /** Con IGV y sin el descuento global: igual que `lineTotal` en la base. */
    importeConIgv: number;
    unidad: string;
    codigo: string | null;
  }[];
  /** Total realmente cobrado. Es lo que prorratea el descuento global. */
  total: number;
  descuento: number;
  pago: {
    metodo: string;
    montoRecibido: number | null;
    cambio: number | null;
    adelanto: number | null;
    efectivo: number | null;
    tarjeta: number | null;
    yape: number | null;
  };
  vendedor: string | null;
  /** El del último envío aceptado. `null` si no hay. */
  hash?: string | null;
}
