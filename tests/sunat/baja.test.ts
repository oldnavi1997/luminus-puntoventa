import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { construirComunicacionBaja, MAX_MOTIVO, numeroBaja } from "@/lib/sunat/ubl/baja";
import { ID_FIRMA } from "@/lib/sunat/ubl/comun";
import { configDePrueba } from "./fixtures";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  removeNSPrefix: false,
});

const GENERADA = new Date("2026-08-25T09:00:00-05:00");
const EMITIDA = new Date("2026-08-21T14:00:00-05:00");

function xmlBaja(overrides?: Partial<Parameters<typeof construirComunicacionBaja>[0]>) {
  return construirComunicacionBaja({
    correlativo: 1,
    generadoEn: GENERADA,
    fechaEmision: EMITIDA,
    lineas: [
      { tipoDocumento: "01", serie: "F001", correlativo: 28, motivo: "ERROR EN DATOS DEL CLIENTE" },
    ],
    config: configDePrueba(),
    ...overrides,
  });
}

describe("estructura de la comunicación de baja", () => {
  const doc = parser.parse(xmlBaja()).VoidedDocuments;

  it("usa la raíz y el namespace de VoidedDocuments", () => {
    expect(doc["@xmlns"]).toBe("urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1");
    expect(doc["@xmlns:sac"]).toBe("urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1");
  });

  it("va en UBL 2.0 con customization 1.0, no en 2.1 como el comprobante", () => {
    expect(doc["cbc:UBLVersionID"]).toBe("2.0");
    expect(doc["cbc:CustomizationID"]).toBe("1.0");
  });

  it("deja el hueco de la firma vacío y de primero", () => {
    const contenido = doc["ext:UBLExtensions"]["ext:UBLExtension"]["ext:ExtensionContent"];
    expect(contenido === "" || contenido == null).toBe(true);
  });

  it("numera el documento con la fecha de generación", () => {
    expect(doc["cbc:ID"]).toBe("RA-20260825-1");
    expect(numeroBaja(GENERADA, 1)).toBe("RA-20260825-1");
  });

  it("separa la fecha de emisión de la de generación", () => {
    // Es el error fácil de este documento: si se anula días después, no coinciden.
    expect(doc["cbc:ReferenceDate"]).toBe("2026-08-21");
    expect(doc["cbc:IssueDate"]).toBe("2026-08-25");
    expect(doc["cbc:ReferenceDate"]).not.toBe(doc["cbc:IssueDate"]);
  });

  it("declara el emisor en la forma reducida, sin dirección", () => {
    expect(doc["cac:AccountingSupplierParty"]["cbc:CustomerAssignedAccountID"]).toBe("20609242753");
    expect(doc["cac:AccountingSupplierParty"]["cbc:AdditionalAccountID"]).toBe("6");
    expect(JSON.stringify(doc["cac:AccountingSupplierParty"])).not.toContain("RegistrationAddress");
  });

  it("enlaza el cac:Signature con el id de la firma", () => {
    expect(doc["cac:Signature"]["cbc:ID"]).toBe(ID_FIRMA);
    expect(
      doc["cac:Signature"]["cac:DigitalSignatureAttachment"]["cac:ExternalReference"]["cbc:URI"],
    ).toBe(`#${ID_FIRMA}`);
  });

  it("describe el comprobante que se da de baja", () => {
    const linea = doc["sac:VoidedDocumentsLine"];
    expect(linea["cbc:LineID"]).toBe("1");
    expect(linea["cbc:DocumentTypeCode"]).toBe("01");
    expect(linea["sac:DocumentSerialID"]).toBe("F001");
    expect(linea["sac:DocumentNumberID"]).toBe("28");
    expect(linea["sac:VoidReasonDescription"]).toBe("ERROR EN DATOS DEL CLIENTE");
  });
});

describe("reglas de la baja", () => {
  it("trunca el motivo al tope del esquema en vez de que SUNAT rechace el envío", () => {
    const largo = "M".repeat(150);
    const doc = parser.parse(
      xmlBaja({ lineas: [{ tipoDocumento: "01", serie: "F001", correlativo: 28, motivo: largo }] }),
    ).VoidedDocuments;

    expect(doc["sac:VoidedDocumentsLine"]["sac:VoidReasonDescription"]).toHaveLength(MAX_MOTIVO);
  });

  it("numera las líneas correlativamente cuando hay varias", () => {
    const doc = parser.parse(
      xmlBaja({
        lineas: [
          { tipoDocumento: "01", serie: "F001", correlativo: 28, motivo: "UNO" },
          { tipoDocumento: "01", serie: "F001", correlativo: 29, motivo: "DOS" },
        ],
      }),
    ).VoidedDocuments;

    expect(doc["sac:VoidedDocumentsLine"].map((l: { "cbc:LineID": string }) => l["cbc:LineID"]))
      .toEqual(["1", "2"]);
  });

  it("se niega a construir una baja sin líneas", () => {
    expect(() => xmlBaja({ lineas: [] })).toThrow(/nada que anular/);
  });
});
