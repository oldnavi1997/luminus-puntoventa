/**
 * Lectura de los importes de un comprobante YA EMITIDO, desde su XML firmado.
 *
 * El resumen de anulación tiene que declarar los mismos importes con los que el
 * comprobante quedó registrado en SUNAT, al céntimo: cualquier diferencia es un
 * rechazo. Recalcularlos desde las columnas de la venta parece equivalente y no
 * lo es —el redondeo de entonces pudo no ser el de ahora, y el prorrateo del
 * descuento global depende del total realmente cobrado—, mientras que el XML
 * firmado es literalmente lo que SUNAT tiene.
 */

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
});

export interface ImportesComprobante {
  /** `cbc:TaxInclusiveAmount`: total con IGV. */
  total: number;
  /** `cbc:LineExtensionAmount`: valor de venta de las operaciones gravadas. */
  gravado: number;
  /** `cac:TaxTotal/cbc:TaxAmount` de la raíz. */
  igv: number;
}

export class ErrorLecturaComprobante extends Error {
  readonly codigo = "XML_ILEGIBLE";
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorLecturaComprobante";
  }
}

function numero(v: unknown, donde: string): number {
  const n = Number(typeof v === "object" && v !== null ? (v as Record<string, unknown>)["#text"] : v);
  if (!Number.isFinite(n)) {
    throw new ErrorLecturaComprobante(`El XML firmado no trae un ${donde} legible.`);
  }
  return n;
}

/** Los importes con que SUNAT registró el comprobante. */
export function importesDelXml(xmlFirmado: string): ImportesComprobante {
  let raiz: Record<string, unknown>;
  try {
    const parsed = parser.parse(xmlFirmado) as Record<string, unknown>;
    raiz = (parsed.Invoice ?? parsed) as Record<string, unknown>;
  } catch (err) {
    throw new ErrorLecturaComprobante(
      `El XML firmado no se puede parsear: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const totales = raiz.LegalMonetaryTotal as Record<string, unknown> | undefined;
  if (!totales) {
    throw new ErrorLecturaComprobante("El XML firmado no trae cac:LegalMonetaryTotal.");
  }

  // En la raíz hay un solo cac:TaxTotal, pero cada línea lleva el suyo; con
  // removeNSPrefix el de la raíz es el que cuelga del Invoice, no de InvoiceLine.
  const taxTotal = raiz.TaxTotal as Record<string, unknown> | undefined;
  if (!taxTotal) {
    throw new ErrorLecturaComprobante("El XML firmado no trae cac:TaxTotal en la raíz.");
  }

  return {
    total: numero(totales.TaxInclusiveAmount, "cbc:TaxInclusiveAmount"),
    gravado: numero(totales.LineExtensionAmount, "cbc:LineExtensionAmount"),
    igv: numero(taxTotal.TaxAmount, "cbc:TaxAmount"),
  };
}
