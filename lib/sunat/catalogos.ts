/**
 * Catálogos de SUNAT (Anexo N° 8, RS 097-2012 y modificatorias).
 *
 * Sólo están los códigos que este POS necesita. Cada constante lleva el número
 * de catálogo porque los `schemeURI` del XML lo referencian literalmente, y
 * SUNAT rechaza el comprobante si el URI no corresponde.
 *
 * Ojo con una rareza documentada de SUNAT: el tipo de operación toma sus
 * valores del catálogo 51, pero el `schemeURI` que exige apunta a `catalogo17`.
 * Está así en la guía oficial; no es una errata nuestra.
 */

const BASE_URI = "urn:pe:gob:sunat:cpe:see:gem:catalogos";

export const URI = {
  /** Catálogo 01 — tipo de comprobante. */
  tipoDocumento: `${BASE_URI}:catalogo01`,
  /** Catálogo 06 — tipo de documento de identidad. */
  tipoDocIdentidad: `${BASE_URI}:catalogo06`,
  /** Catálogo 07 — tipo de afectación del IGV. */
  afectacionIgv: `${BASE_URI}:catalogo07`,
  /** Catálogo 09 — motivos de nota de crédito. */
  motivoNotaCredito: `${BASE_URI}:catalogo09`,
  /** Catálogo 10 — motivos de nota de débito. */
  motivoNotaDebito: `${BASE_URI}:catalogo10`,
  /** Catálogo 16 — tipo de precio unitario. */
  tipoPrecio: `${BASE_URI}:catalogo16`,
  /** Tipo de operación: valores del catálogo 51, URI de catalogo17 (así lo pide SUNAT). */
  tipoOperacion: `${BASE_URI}:catalogo17`,
  /** Catálogo 52 — códigos de leyenda. */
  leyenda: `${BASE_URI}:catalogo52`,
} as const;

/** Catálogo 01 — tipo de comprobante. */
export const TIPO_DOCUMENTO = {
  FACTURA: "01",
  BOLETA: "03",
  NOTA_CREDITO: "07",
  NOTA_DEBITO: "08",
  /** Resumen diario de boletas. */
  RESUMEN_DIARIO: "RC",
  /** Comunicación de baja. */
  COMUNICACION_BAJA: "RA",
} as const;

export type TipoDocumentoSunat = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO];

/** Catálogo 06 — tipo de documento de identidad del adquirente. */
export const TIPO_DOC_IDENTIDAD = {
  SIN_RUC: "0",
  DNI: "1",
  CE: "4",
  RUC: "6",
  PASAPORTE: "7",
  CEDULA_DIPLOMATICA: "A",
} as const;

/** Traduce el docType que guarda el POS al código de SUNAT. */
export function codigoTipoDocIdentidad(docType: string): string {
  switch (docType.toUpperCase()) {
    case "RUC": return TIPO_DOC_IDENTIDAD.RUC;
    case "CE": return TIPO_DOC_IDENTIDAD.CE;
    case "PASAPORTE": return TIPO_DOC_IDENTIDAD.PASAPORTE;
    case "DNI": return TIPO_DOC_IDENTIDAD.DNI;
    default: return TIPO_DOC_IDENTIDAD.DNI;
  }
}

/** Catálogo 51 — tipo de operación. */
export const TIPO_OPERACION = {
  VENTA_INTERNA: "0101",
  EXPORTACION: "0102",
  NO_DOMICILIADOS: "0103",
} as const;

/** Catálogo 07 — tipo de afectación del IGV. */
export const AFECTACION_IGV = {
  /** Gravado — operación onerosa. Es el caso de toda venta normal del POS. */
  GRAVADO_ONEROSO: "10",
  EXONERADO_ONEROSO: "20",
  INAFECTO_ONEROSO: "30",
  GRATUITO: "11",
} as const;

/** Catálogo 05 — tributos. */
export const TRIBUTO = {
  IGV: { id: "1000", nombre: "IGV", codigo: "VAT" },
  ISC: { id: "2000", nombre: "ISC", codigo: "EXC" },
  EXONERADO: { id: "9997", nombre: "EXO", codigo: "VAT" },
  INAFECTO: { id: "9998", nombre: "INA", codigo: "FRE" },
  OTROS: { id: "9999", nombre: "OTROS", codigo: "OTH" },
} as const;

/**
 * Categoría de impuesto (UN/ECE 5305).
 * "S" = standard rate, "E" = exento, "O" = fuera de alcance.
 */
export const CATEGORIA_TRIBUTO = { GRAVADO: "S", EXONERADO: "E", INAFECTO: "O" } as const;

/** Catálogo 16 — tipo de precio unitario. */
export const TIPO_PRECIO = {
  /** Precio unitario incluyendo IGV. Es el que va en cac:PricingReference. */
  UNITARIO: "01",
  REFERENCIAL_GRATUITO: "02",
} as const;

/** Catálogo 52 — leyendas. */
export const LEYENDA = {
  MONTO_EN_LETRAS: "1000",
  TRANSFERENCIA_GRATUITA: "1002",
  OPERACION_DETRACCION: "2006",
} as const;

/** Unidades de medida (UN/ECE rec 20). */
export const UNIDAD_MEDIDA = {
  /** Unidad. Es lo que vende esta óptica: monturas, lunas, accesorios. */
  UNIDAD: "NIU",
  /** Servicio / no aplica. */
  SERVICIO: "ZZ",
} as const;

/** Tasa de IGV vigente. */
export const TASA_IGV = 0.18;

/** Umbral a partir del cual una boleta exige identificar al adquirente. */
export const UMBRAL_DNI_BOLETA = 700;
