/**
 * Comunicación de baja (RA) — el instrumento con que se anula una FACTURA.
 *
 * Es un documento aparte del comprobante y con su propia numeración diaria:
 * `RA-AAAAMMDD-N`, donde la fecha es la de GENERACIÓN de la baja, no la del
 * comprobante que se da de baja. Esa distinción es la que separa `cbc:IssueDate`
 * de `cbc:ReferenceDate` y es el error fácil de este documento.
 *
 * A diferencia del comprobante, la respuesta de SUNAT no llega en el momento:
 * `sendSummary` devuelve un ticket y el CDR se recoge después con `getStatus`.
 */

import { create } from "xmlbuilder2";
import { TIPO_DOCUMENTO } from "../catalogos";
import { idResumen } from "../nombres";
import type { ConfigSunat } from "../config";
import { NS, bloqueFirma, emisorResumen, fechaLima, huecoExtension } from "./comun";

/** Tope del `sac:VoidReasonDescription` en el esquema de SUNAT. */
export const MAX_MOTIVO = 100;

export interface LineaBaja {
  /** Catálogo 01: "01" factura, "07"/"08" sus notas. */
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  motivo: string;
}

export interface ParametrosBaja {
  /** El N de `RA-AAAAMMDD-N`. */
  correlativo: number;
  /** Cuándo se genera la baja. Da el ID y el `IssueDate`. */
  generadoEn: Date;
  /**
   * Fecha de emisión de los comprobantes que se dan de baja.
   *
   * Es una sola para todo el documento a propósito: SUNAT exige que todas las
   * líneas de una misma RA correspondan al mismo día de emisión, y tenerlo como
   * campo único hace imposible construir una que lo incumpla.
   */
  fechaEmision: Date;
  lineas: LineaBaja[];
  config: ConfigSunat;
}

/** El `cbc:ID` del documento: `RA-20260821-1`. */
export function numeroBaja(generadoEn: Date, correlativo: number): string {
  return idResumen(TIPO_DOCUMENTO.COMUNICACION_BAJA, fechaLima(generadoEn), correlativo);
}

/**
 * Construye el XML sin firmar, con el `ext:ExtensionContent` vacío listo para
 * que `firma.ts` inserte ahí el `ds:Signature`.
 */
export function construirComunicacionBaja(p: ParametrosBaja): string {
  const { config } = p;

  if (p.lineas.length === 0) {
    throw new Error("Una comunicación de baja sin líneas no tiene nada que anular.");
  }

  const doc = create({ version: "1.0", encoding: "UTF-8", standalone: false }).ele(
    NS.baja,
    "VoidedDocuments",
    {
      "xmlns:cac": NS.cac,
      "xmlns:cbc": NS.cbc,
      "xmlns:ds": NS.ds,
      "xmlns:ext": NS.ext,
      "xmlns:sac": NS.sac,
    },
  );

  huecoExtension(doc);

  // El resumen y la baja van en UBL 2.0, no 2.1 como el comprobante.
  doc.ele("cbc:UBLVersionID").txt("2.0").up();
  doc.ele("cbc:CustomizationID").txt("1.0").up();

  doc.ele("cbc:ID").txt(numeroBaja(p.generadoEn, p.correlativo)).up();

  // ReferenceDate es el día en que se EMITIERON los comprobantes; IssueDate, el
  // día en que se comunica la baja. Coinciden sólo si se anula el mismo día.
  doc.ele("cbc:ReferenceDate").txt(fechaLima(p.fechaEmision)).up();
  doc.ele("cbc:IssueDate").txt(fechaLima(p.generadoEn)).up();

  bloqueFirma(doc, config);
  emisorResumen(doc, config);

  p.lineas.forEach((linea, i) => {
    const l = doc.ele("sac:VoidedDocumentsLine");
    l.ele("cbc:LineID").txt(String(i + 1)).up();
    l.ele("cbc:DocumentTypeCode").txt(linea.tipoDocumento).up();
    l.ele("sac:DocumentSerialID").txt(linea.serie).up();
    l.ele("sac:DocumentNumberID").txt(String(linea.correlativo)).up();
    // Se trunca en vez de dejar que SUNAT rechace el documento entero por un
    // motivo demasiado largo; la ruta ya valida el tope antes de llegar aquí.
    l.ele("sac:VoidReasonDescription").dat(linea.motivo.trim().slice(0, MAX_MOTIVO)).up();
    l.up();
  });

  return doc.end({ prettyPrint: false });
}
