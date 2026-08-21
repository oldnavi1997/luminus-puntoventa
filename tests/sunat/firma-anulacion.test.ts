import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import * as xpath from "xpath";
import { cargarCertificado } from "@/lib/sunat/certificado";
import { firmarComprobante } from "@/lib/sunat/firma";
import { construirComunicacionBaja } from "@/lib/sunat/ubl/baja";
import { CONDICION, construirResumenAnulacion } from "@/lib/sunat/ubl/resumen";
import { ID_FIRMA } from "@/lib/sunat/ubl/comun";
import { CLAVE_PFX, configDePrueba, generarPfxDePrueba } from "./fixtures";

// Generar la clave RSA cuesta, así que se hace una vez para todo el archivo.
const certificado = cargarCertificado(generarPfxDePrueba(), CLAVE_PFX);

const GENERADO = new Date("2026-08-25T09:00:00-05:00");
const EMITIDA = new Date("2026-08-21T14:00:00-05:00");

const baja = () =>
  construirComunicacionBaja({
    correlativo: 1,
    generadoEn: GENERADO,
    fechaEmision: EMITIDA,
    lineas: [{ tipoDocumento: "01", serie: "F001", correlativo: 28, motivo: "ERROR EN EL RUC" }],
    config: configDePrueba(),
  });

const resumen = () =>
  construirResumenAnulacion({
    correlativo: 1,
    generadoEn: GENERADO,
    fechaEmision: EMITIDA,
    lineas: [
      {
        tipoDocumento: "03",
        serie: "B001",
        correlativo: 53,
        condicion: CONDICION.ANULAR,
        adquirente: { tipoDoc: "1", numeroDoc: "45678912" },
        total: 590,
        gravado: 500,
        igv: 90,
      },
    ],
    config: configDePrueba(),
  });

describe.each([
  ["comunicación de baja", baja],
  ["resumen de anulación", resumen],
])("firma de la %s", (_nombre, construir) => {
  const firmado = firmarComprobante(construir(), certificado);
  const doc = () => new DOMParser().parseFromString(firmado, "text/xml");

  it("coloca una única firma dentro de ext:ExtensionContent", () => {
    const nodos = xpath.select(
      "//*[local-name(.)='ExtensionContent']/*[local-name(.)='Signature']",
      doc() as unknown as Node,
    ) as Node[];
    expect(nodos).toHaveLength(1);
  });

  it("usa el Id al que apunta cac:Signature", () => {
    expect(firmado).toContain(`Id="${ID_FIRMA}"`);
    expect(firmado).toContain(`<cbc:URI>#${ID_FIRMA}</cbc:URI>`);
  });

  it("lista la canonicalización explícitamente en la cadena de transforms", () => {
    // El invariante caro del proyecto: xml-crypto sólo aplica los transforms
    // que se le listan y NO cae de vuelta en canonicalizationAlgorithm. Sin
    // esto el digest se calcula sobre la serialización cruda del DOM mientras
    // SUNAT canonicaliza segun la especificación, y rechaza TODO por firma
    // inválida.
    const transforms = xpath.select(
      "//*[local-name(.)='Transforms']/*[local-name(.)='Transform']/@Algorithm",
      doc() as unknown as Node,
    ) as unknown as { value: string }[];

    expect(transforms.map((t) => t.value)).toContain(
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    );
  });

  it("produce una firma criptográficamente válida", () => {
    const arbol = doc();
    const nodoFirma = xpath.select1(
      "//*[local-name(.)='Signature']",
      arbol as unknown as Node,
    ) as Node;

    const verificador = new SignedXml();
    verificador.publicCert = certificado.certificadoPem;
    verificador.loadSignature(nodoFirma as unknown as string);

    expect(verificador.checkSignature(firmado)).toBe(true);
  });
});
