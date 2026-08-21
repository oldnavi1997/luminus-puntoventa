/**
 * Piezas compartidas por los tres documentos UBL que emite el POS: el
 * comprobante (Invoice), la comunicación de baja (VoidedDocuments) y el resumen
 * de anulación (SummaryDocuments).
 *
 * Aquí vive sólo lo que los tres construyen IGUAL. El bloque de emisor no entra:
 * el Invoice lo declara con `cac:PartyIdentification` y dirección completa,
 * mientras que RA y RC usan `cbc:CustomerAssignedAccountID` sin dirección. Son
 * formas distintas, no variantes de una misma, y unificarlas daría una función
 * cuyo `if` decide toda la estructura. Lo que RA y RC sí comparten literalmente
 * es `emisorResumen`.
 */

import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import type { ConfigSunat } from "../config";

export const NS = {
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ccts: "urn:un:unece:uncefact:documentation:2",
  ds: "http://www.w3.org/2000/09/xmldsig#",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  qdt: "urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2",
  udt: "urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",

  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  baja: "urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1",
  resumen: "urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1",
  sac: "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1",
} as const;

export const AGENCIA = "PE:SUNAT";
export const MONEDA = "PEN";

/** Id del ds:Signature; cac:Signature debe apuntar aquí con "#". */
export const ID_FIRMA = "SignatureLuminus";

/** Fecha del día peruano, `YYYY-MM-DD`. */
export function fechaLima(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Hora peruana, `HH:MM:SS`. */
export function horaLima(d: Date): string {
  return d.toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour12: false });
}

/**
 * El `ext:ExtensionContent` vacío donde `firma.ts` inserta el `ds:Signature`.
 *
 * Es el ancla exacta que busca la firma (`//*[local-name(.)='ExtensionContent']`)
 * y va SIEMPRE de primero. Está factorizado justamente por eso: un documento al
 * que se le olvide este hueco no falla al construirse, falla al firmarse.
 */
export function huecoExtension(doc: XMLBuilder): void {
  doc.ele("ext:UBLExtensions").ele("ext:UBLExtension").ele("ext:ExtensionContent").up().up().up();
}

/**
 * El `cac:Signature` que declara quién firma y apunta al `ds:Signature`.
 * Idéntico en Invoice, VoidedDocuments y SummaryDocuments.
 */
export function bloqueFirma(doc: XMLBuilder, config: ConfigSunat): void {
  const firma = doc.ele("cac:Signature");
  firma.ele("cbc:ID").txt(ID_FIRMA).up();

  const signatory = firma.ele("cac:SignatoryParty");
  signatory.ele("cac:PartyIdentification").ele("cbc:ID").txt(config.ruc).up().up();
  signatory.ele("cac:PartyName").ele("cbc:Name").dat(config.razonSocial).up().up();
  signatory.up();

  firma
    .ele("cac:DigitalSignatureAttachment")
    .ele("cac:ExternalReference")
    .ele("cbc:URI")
    .txt(`#${ID_FIRMA}`)
    .up()
    .up()
    .up();
  firma.up();
}

/**
 * Emisor reducido de RA y RC.
 *
 * A diferencia del Invoice no lleva dirección ni `PartyIdentification`: el RUC
 * va en `cbc:CustomerAssignedAccountID` y el `6` de `AdditionalAccountID` es el
 * tipo de documento del catálogo 06.
 */
export function emisorResumen(doc: XMLBuilder, config: ConfigSunat): void {
  const emisor = doc.ele("cac:AccountingSupplierParty");
  emisor.ele("cbc:CustomerAssignedAccountID").txt(config.ruc).up();
  emisor.ele("cbc:AdditionalAccountID").txt("6").up();
  emisor
    .ele("cac:Party")
    .ele("cac:PartyLegalEntity")
    .ele("cbc:RegistrationName")
    .dat(config.razonSocial)
    .up()
    .up()
    .up();
  emisor.up();
}
