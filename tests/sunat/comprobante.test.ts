import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { calcularComprobante } from "@/lib/sunat/calculo";
import { construirComprobante, ID_FIRMA } from "@/lib/sunat/ubl/comprobante";
import { configDePrueba } from "./fixtures";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  removeNSPrefix: false,
});

function xmlFactura(overrides?: Partial<Parameters<typeof construirComprobante>[0]>) {
  const calculo = calcularComprobante([
    { descripcion: "Montura Ray-Ban RB5154", cantidad: 1, importeConIgv: 590, codigoProducto: "MON-RB5154" },
    { descripcion: "Luna progresiva 1.60 AR", cantidad: 2, importeConIgv: 472 },
  ]);

  return construirComprobante({
    tipo: "FACTURA",
    serie: "F001",
    correlativo: 123,
    emitidoEn: new Date("2026-08-19T20:30:00-05:00"),
    adquirente: {
      docType: "RUC",
      docNumber: "20512345678",
      name: "CLIENTE EMPRESA S.A.C.",
      address: "AV. CLIENTE 456",
    },
    calculo,
    config: configDePrueba(),
    ...overrides,
  });
}

describe("estructura del XML", () => {
  const xml = xmlFactura();
  const doc = parser.parse(xml).Invoice;

  it("declara todos los namespaces que exige SUNAT", () => {
    for (const ns of ["cac", "cbc", "ds", "ext", "qdt", "udt", "ccts", "xsi"]) {
      expect(xml).toContain(`xmlns:${ns}=`);
    }
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
  });

  it("deja el hueco de la firma vacío y listo", () => {
    expect(xml).toContain("<ext:ExtensionContent/>");
  });

  it("usa UBL 2.1 con customization 2.0", () => {
    expect(doc["cbc:UBLVersionID"]).toBe("2.1");
    expect(doc["cbc:CustomizationID"]).toBe("2.0");
  });

  it("pone el tipo de operación en ProfileID con el schemeURI de catalogo17", () => {
    // Rareza documentada de SUNAT: valores del catálogo 51, URI de catalogo17.
    // Necesario pero NO suficiente — ver el bloque de regresiones más abajo.
    expect(doc["cbc:ProfileID"]["#text"]).toBe("0101");
    expect(doc["cbc:ProfileID"]["@schemeURI"]).toContain("catalogo17");
  });

  it("numera el comprobante como SERIE-CORRELATIVO sin ceros de relleno", () => {
    expect(doc["cbc:ID"]).toBe("F001-123");
  });

  it("marca el tipo de documento 01 para factura", () => {
    expect(doc["cbc:InvoiceTypeCode"]["#text"]).toBe("01");
    expect(doc["cbc:InvoiceTypeCode"]["@listURI"]).toContain("catalogo01");
  });

  it("enlaza cac:Signature con el Id del ds:Signature", () => {
    expect(doc["cac:Signature"]["cbc:ID"]).toBe(ID_FIRMA);
    expect(doc["cac:Signature"]["cac:DigitalSignatureAttachment"]["cac:ExternalReference"]["cbc:URI"])
      .toBe(`#${ID_FIRMA}`);
  });

  it("identifica al emisor en PartyIdentification, no en PartyTaxScheme", () => {
    // SUNAT rechaza con 1008 si el RUC va en cac:PartyTaxScheme/cbc:CompanyID.
    const party = doc["cac:AccountingSupplierParty"]["cac:Party"];
    expect(party["cac:PartyIdentification"]["cbc:ID"]["#text"]).toBe("20609242753");
    expect(party["cac:PartyIdentification"]["cbc:ID"]["@schemeID"]).toBe("6");
    expect(party["cac:PartyTaxScheme"]).toBeUndefined();

    const dir = party["cac:PartyLegalEntity"]["cac:RegistrationAddress"];
    expect(dir["cbc:AddressTypeCode"]).toBe("0000");
    expect(dir["cbc:ID"]).toBe("150101");
  });

  it("identifica al adquirente con el código de catálogo 06 correcto", () => {
    const party = doc["cac:AccountingCustomerParty"]["cac:Party"];
    expect(party["cac:PartyIdentification"]["cbc:ID"]["@schemeID"]).toBe("6"); // RUC
    expect(party["cac:PartyIdentification"]["cbc:ID"]["#text"]).toBe("20512345678");
    expect(party["cac:PartyLegalEntity"]["cbc:RegistrationName"]).toBe("CLIENTE EMPRESA S.A.C.");
  });

  it("cuenta las líneas", () => {
    expect(doc["cbc:LineCountNumeric"]).toBe("2");
    expect(doc["cac:InvoiceLine"]).toHaveLength(2);
  });
});

describe("fecha y hora de emisión", () => {
  it("usa el día peruano aunque en UTC ya sea el día siguiente", () => {
    // 20:30 en Lima = 01:30 UTC del día siguiente. El comprobante tiene que
    // declarar el 19, no el 20: es la causa clásica de rechazo por fecha.
    const doc = parser.parse(xmlFactura()).Invoice;
    expect(doc["cbc:IssueDate"]).toBe("2026-08-19");
    expect(doc["cbc:IssueTime"]).toBe("20:30:00");
  });
});

describe("importes", () => {
  const doc = parser.parse(xmlFactura()).Invoice;

  it("declara los totales con dos decimales", () => {
    const totales = doc["cac:LegalMonetaryTotal"];
    expect(totales["cbc:LineExtensionAmount"]["#text"]).toBe("900.00");
    expect(totales["cbc:TaxInclusiveAmount"]["#text"]).toBe("1062.00");
    expect(totales["cbc:PayableAmount"]["#text"]).toBe("1062.00");
  });

  it("declara el IGV total y su base", () => {
    const tax = doc["cac:TaxTotal"];
    expect(tax["cbc:TaxAmount"]["#text"]).toBe("162.00");
    expect(tax["cac:TaxSubtotal"]["cbc:TaxableAmount"]["#text"]).toBe("900.00");
    expect(tax["cac:TaxSubtotal"]["cac:TaxCategory"]["cac:TaxScheme"]["cbc:ID"]["#text"]).toBe("1000");
  });

  it("usa 10 decimales en los valores unitarios", () => {
    const linea = doc["cac:InvoiceLine"][0];
    expect(linea["cac:Price"]["cbc:PriceAmount"]["#text"]).toMatch(/^\d+\.\d{10}$/);
    expect(
      linea["cac:PricingReference"]["cac:AlternativeConditionPrice"]["cbc:PriceAmount"]["#text"],
    ).toMatch(/^\d+\.\d{10}$/);
  });

  it("marca cada línea como gravada con IGV al 18%", () => {
    const categoria = doc["cac:InvoiceLine"][0]["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"];
    expect(categoria["cbc:Percent"]).toBe("18.00");
    expect(categoria["cbc:TaxExemptionReasonCode"]["#text"]).toBe("10");
  });

  it("escribe el monto en letras como leyenda 1000", () => {
    expect(doc["cbc:Note"]["@languageLocaleID"]).toBe("1000");
    expect(doc["cbc:Note"]["#text"]).toContain("/100 SOLES");
  });
});

describe("boleta", () => {
  it("usa el tipo 03 y el código de DNI", () => {
    const calculo = calcularComprobante([{ descripcion: "Estuche", cantidad: 1, importeConIgv: 59 }]);
    const xml = construirComprobante({
      tipo: "BOLETA",
      serie: "B001",
      correlativo: 7,
      emitidoEn: new Date("2026-08-19T10:00:00-05:00"),
      adquirente: { docType: "DNI", docNumber: "45678912", name: "JUAN PEREZ" },
      calculo,
      config: configDePrueba(),
    });
    const doc = parser.parse(xml).Invoice;

    expect(doc["cbc:InvoiceTypeCode"]["#text"]).toBe("03");
    expect(doc["cbc:ID"]).toBe("B001-7");
    expect(
      doc["cac:AccountingCustomerParty"]["cac:Party"]["cac:PartyIdentification"]["cbc:ID"]["@schemeID"],
    ).toBe("1");
  });
});

/**
 * Cada aserción de aquí abajo corresponde a un rechazo o una observación real
 * del validador de SUNAT en el ambiente beta. La guía en PDF no las recoge —
 * se descubrieron enviando. No tocar sin volver a enviar a beta.
 */
describe("regresiones aprendidas del validador de SUNAT", () => {
  const doc = parser.parse(xmlFactura()).Invoice;

  it("3205 — el tipo de operación va en el @listID de InvoiceTypeCode", () => {
    // Con el tipo de operación sólo en cbc:ProfileID, SUNAT rechaza con 3205.
    expect(doc["cbc:InvoiceTypeCode"]["@listID"]).toBe("0101");
  });

  it("3244 — la factura declara la forma de pago", () => {
    expect(doc["cac:PaymentTerms"]["cbc:ID"]).toBe("FormaPago");
    expect(doc["cac:PaymentTerms"]["cbc:PaymentMeansID"]).toBe("Contado");
  });

  it("4252 — los @listName usan los nombres cortos que espera SUNAT", () => {
    expect(doc["cbc:InvoiceTypeCode"]["@listName"]).toBe("Tipo de Documento");

    const linea = doc["cac:InvoiceLine"][0];
    expect(
      linea["cac:PricingReference"]["cac:AlternativeConditionPrice"]["cbc:PriceTypeCode"]["@listName"],
    ).toBe("Tipo de Precio");
    expect(
      linea["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"]["cbc:TaxExemptionReasonCode"]["@listName"],
    ).toBe("Afectacion del IGV");
  });

  it("4255/4256 — el cbc:ID del TaxScheme usa schemeAgencyID, no schemeName", () => {
    for (const esquema of [
      doc["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"]["cac:TaxScheme"],
      doc["cac:InvoiceLine"][0]["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"]["cac:TaxScheme"],
    ]) {
      expect(esquema["cbc:ID"]["@schemeAgencyID"]).toBe("6");
      expect(esquema["cbc:ID"]["@schemeName"]).toBeUndefined();
      expect(esquema["cbc:ID"]["@schemeAgencyName"]).toBeUndefined();
    }
  });

  it("acepta declarar la venta a crédito cuando haga falta", () => {
    const xml = xmlFactura({ formaPago: "Credito" });
    expect(parser.parse(xml).Invoice["cac:PaymentTerms"]["cbc:PaymentMeansID"]).toBe("Credito");
  });
});

describe("caracteres especiales", () => {
  it("no rompe el XML con & ni < en las descripciones", () => {
    const calculo = calcularComprobante([
      { descripcion: "Montura K&G <especial> \"premium\"", cantidad: 1, importeConIgv: 118 },
    ]);
    const xml = construirComprobante({
      tipo: "BOLETA",
      serie: "B001",
      correlativo: 1,
      emitidoEn: new Date("2026-08-19T10:00:00-05:00"),
      adquirente: { docType: "DNI", docNumber: "45678912", name: "AMPERSAND & CIA" },
      calculo,
      config: configDePrueba(),
    });

    // Tiene que seguir siendo parseable, que es lo único que importa.
    const doc = parser.parse(xml).Invoice;
    expect(doc["cac:InvoiceLine"]["cac:Item"]["cbc:Description"]).toContain("K&G");
  });
});
