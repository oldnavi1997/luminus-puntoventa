import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { calcularComprobante } from "@/lib/sunat/calculo";
import { construirComprobante } from "@/lib/sunat/ubl/comprobante";
import { importesDelXml } from "@/lib/sunat/ubl/leer-comprobante";
import { CONDICION, construirResumenAnulacion, numeroResumen } from "@/lib/sunat/ubl/resumen";
import { ID_FIRMA } from "@/lib/sunat/ubl/comun";
import { codigoTipoDocIdentidad } from "@/lib/sunat/catalogos";
import { configDePrueba } from "./fixtures";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  removeNSPrefix: false,
});

const GENERADO = new Date("2026-08-25T09:00:00-05:00");
const EMITIDA = new Date("2026-08-21T14:00:00-05:00");

function xmlResumen(overrides?: Partial<Parameters<typeof construirResumenAnulacion>[0]>) {
  return construirResumenAnulacion({
    correlativo: 1,
    generadoEn: GENERADO,
    fechaEmision: EMITIDA,
    lineas: [
      {
        tipoDocumento: "03",
        serie: "B001",
        correlativo: 53,
        condicion: CONDICION.ANULAR,
        adquirente: { tipoDoc: codigoTipoDocIdentidad("DNI"), numeroDoc: "45678912" },
        total: 590,
        gravado: 500,
        igv: 90,
      },
    ],
    config: configDePrueba(),
    ...overrides,
  });
}

describe("estructura del resumen de anulación", () => {
  const doc = parser.parse(xmlResumen()).SummaryDocuments;

  it("usa la raíz y el namespace de SummaryDocuments", () => {
    expect(doc["@xmlns"]).toBe("urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1");
  });

  it("va en la versión 1.1, que declara un documento por línea", () => {
    expect(doc["cbc:UBLVersionID"]).toBe("2.0");
    expect(doc["cbc:CustomizationID"]).toBe("1.1");
  });

  it("numera el documento con la fecha de generación", () => {
    expect(doc["cbc:ID"]).toBe("RC-20260825-1");
    expect(numeroResumen(GENERADO, 1)).toBe("RC-20260825-1");
  });

  it("separa la fecha de emisión de la de generación", () => {
    expect(doc["cbc:ReferenceDate"]).toBe("2026-08-21");
    expect(doc["cbc:IssueDate"]).toBe("2026-08-25");
  });

  it("comparte cabecera de firma y emisor con la baja", () => {
    expect(doc["cac:Signature"]["cbc:ID"]).toBe(ID_FIRMA);
    expect(doc["cac:AccountingSupplierParty"]["cbc:CustomerAssignedAccountID"]).toBe("20609242753");
    expect(doc["cac:AccountingSupplierParty"]["cbc:AdditionalAccountID"]).toBe("6");
  });

  it("marca la línea como ANULADA con el código 3", () => {
    expect(doc["sac:SummaryDocumentsLine"]["cac:Status"]["cbc:ConditionCode"]).toBe("3");
  });

  it("identifica la boleta por SERIE-NUMERO, sin ceros de relleno", () => {
    const linea = doc["sac:SummaryDocumentsLine"];
    expect(linea["cbc:ID"]).toBe("B001-53");
    expect(linea["cbc:DocumentTypeCode"]).toBe("03");
  });

  it("declara al comprador con el código del catálogo 06", () => {
    const cliente = doc["sac:SummaryDocumentsLine"]["cac:AccountingCustomerParty"];
    expect(cliente["cbc:CustomerAssignedAccountID"]).toBe("45678912");
    expect(cliente["cbc:AdditionalAccountID"]).toBe("1");
  });

  it("omite el bloque del comprador en una boleta a consumidor final", () => {
    const sinCliente = parser.parse(
      xmlResumen({
        lineas: [
          {
            tipoDocumento: "03",
            serie: "B001",
            correlativo: 54,
            condicion: CONDICION.ANULAR,
            adquirente: null,
            total: 59,
            gravado: 50,
            igv: 9,
          },
        ],
      }),
    ).SummaryDocuments;

    expect(sinCliente["sac:SummaryDocumentsLine"]["cac:AccountingCustomerParty"]).toBeUndefined();
  });

  it("clasifica el importe como gravado y lo grava con IGV", () => {
    const linea = doc["sac:SummaryDocumentsLine"];
    expect(linea["sac:BillingPayment"]["cbc:InstructionID"]).toBe("01");
    expect(linea["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"]["cac:TaxScheme"]["cbc:ID"]["#text"])
      .toBe("1000");
    expect(linea["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"]["cac:TaxScheme"]["cbc:ID"]["@schemeAgencyID"])
      .toBe("6");
  });

  it("se niega a construir un resumen sin líneas", () => {
    expect(() => xmlResumen({ lineas: [] })).toThrow(/no informa nada/);
  });
});

describe("ida y vuelta: el resumen declara lo mismo que declaró la boleta", () => {
  // Es la prueba que de verdad importa. Si el resumen no cuadra al céntimo con
  // lo que SUNAT registró, la anulación se rechaza.
  function resumenDeUnaBoleta(lineas: Parameters<typeof calcularComprobante>[0], totalCobrado?: number) {
    const boleta = construirComprobante({
      tipo: "BOLETA",
      serie: "B001",
      correlativo: 53,
      emitidoEn: EMITIDA,
      adquirente: { docType: "DNI", docNumber: "45678912", name: "CLIENTE" },
      calculo: calcularComprobante(lineas, totalCobrado),
      config: configDePrueba(),
    });

    const importes = importesDelXml(boleta);
    const xml = xmlResumen({
      lineas: [
        {
          tipoDocumento: "03",
          serie: "B001",
          correlativo: 53,
          condicion: CONDICION.ANULAR,
          adquirente: { tipoDoc: "1", numeroDoc: "45678912" },
          ...importes,
        },
      ],
    });

    return { importes, linea: parser.parse(xml).SummaryDocuments["sac:SummaryDocumentsLine"] };
  }

  it("total = gravado + IGV, al céntimo", () => {
    const { linea } = resumenDeUnaBoleta([
      { descripcion: "Montura", cantidad: 1, importeConIgv: 590 },
      { descripcion: "Lunas", cantidad: 2, importeConIgv: 472 },
    ]);

    const total = Number(linea["sac:TotalAmount"]["#text"]);
    const gravado = Number(linea["sac:BillingPayment"]["cbc:PaidAmount"]["#text"]);
    const igv = Number(linea["cac:TaxTotal"]["cbc:TaxAmount"]["#text"]);

    expect(gravado + igv).toBeCloseTo(total, 2);
  });

  it("cuadra también con descuento global prorrateado", () => {
    const { importes, linea } = resumenDeUnaBoleta(
      [
        { descripcion: "Montura", cantidad: 1, importeConIgv: 590 },
        { descripcion: "Lunas", cantidad: 2, importeConIgv: 472 },
      ],
      1000,
    );

    expect(Number(linea["sac:TotalAmount"]["#text"])).toBeCloseTo(1000, 2);
    expect(Number(linea["sac:TotalAmount"]["#text"])).toBeCloseTo(importes.total, 2);
  });
});
