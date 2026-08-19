import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import * as xpath from "xpath";
import { cargarCertificado, ErrorCertificado, verificarVigencia } from "@/lib/sunat/certificado";
import { firmarComprobante, ErrorFirma } from "@/lib/sunat/firma";
import { calcularComprobante } from "@/lib/sunat/calculo";
import { construirComprobante, ID_FIRMA } from "@/lib/sunat/ubl/comprobante";
import { CLAVE_PFX, configDePrueba, generarPfxDePrueba } from "./fixtures";

// Generar la clave RSA cuesta, así que se hace una vez para todo el archivo.
const pfx = generarPfxDePrueba();
const certificado = cargarCertificado(pfx, CLAVE_PFX);

function comprobanteSinFirmar(): string {
  const calculo = calcularComprobante([
    { descripcion: "Montura Ray-Ban", cantidad: 1, importeConIgv: 590 },
  ]);
  return construirComprobante({
    tipo: "FACTURA",
    serie: "F001",
    correlativo: 1,
    emitidoEn: new Date("2026-08-19T15:00:00-05:00"),
    adquirente: { docType: "RUC", docNumber: "20512345678", name: "CLIENTE S.A.C." },
    calculo,
    config: configDePrueba(),
  });
}

describe("carga del certificado", () => {
  it("abre un PKCS#12 con la contraseña correcta", () => {
    expect(certificado.clavePrivadaPem).toContain("BEGIN RSA PRIVATE KEY");
    expect(certificado.certificadoPem).toContain("BEGIN CERTIFICATE");
    expect(certificado.certificadoBase64).not.toContain("BEGIN");
  });

  it("extrae el RUC del titular", () => {
    expect(certificado.rucDelCertificado).toBe("20609242753");
  });

  it("rechaza la contraseña equivocada con un código accionable", () => {
    try {
      cargarCertificado(pfx, "otra-clave");
      expect.unreachable("debió lanzar");
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorCertificado);
      expect((err as ErrorCertificado).codigo).toBe("CLAVE_INCORRECTA");
    }
  });

  it("rechaza un archivo que no es PKCS#12", () => {
    try {
      cargarCertificado(Buffer.from("esto no es un certificado"), "x");
      expect.unreachable("debió lanzar");
    } catch (err) {
      expect((err as ErrorCertificado).codigo).toBe("FORMATO_INVALIDO");
    }
  });

  it("detecta un certificado vencido", () => {
    const vencido = cargarCertificado(generarPfxDePrueba({ vencido: true }), CLAVE_PFX);
    expect(() => verificarVigencia(vencido)).toThrow(/venció/);
  });

  it("nunca expone la contraseña en el mensaje de error", () => {
    try {
      cargarCertificado(pfx, "secreto-que-no-debe-filtrarse");
    } catch (err) {
      expect((err as Error).message).not.toContain("secreto-que-no-debe-filtrarse");
    }
  });
});

describe("firma del comprobante", () => {
  const firmado = firmarComprobante(comprobanteSinFirmar(), certificado);

  it("coloca la firma dentro de ext:ExtensionContent", () => {
    const doc = new DOMParser().parseFromString(firmado, "text/xml");
    const nodos = xpath.select(
      "//*[local-name(.)='ExtensionContent']/*[local-name(.)='Signature']",
      doc as unknown as Node,
    ) as Node[];
    expect(nodos).toHaveLength(1);
  });

  it("usa el Id que referencia cac:Signature", () => {
    expect(firmado).toContain(`Id="${ID_FIRMA}"`);
    expect(firmado).toContain(`<cbc:URI>#${ID_FIRMA}</cbc:URI>`);
  });

  it("firma el documento entero con URI vacío y transform enveloped", () => {
    expect(firmado).toContain('URI=""');
    expect(firmado).toContain("http://www.w3.org/2000/09/xmldsig#enveloped-signature");
  });

  it("usa los algoritmos que exige SUNAT", () => {
    expect(firmado).toContain("http://www.w3.org/TR/2001/REC-xml-c14n-20010315");
    expect(firmado).toContain("http://www.w3.org/2000/09/xmldsig#rsa-sha1");
    expect(firmado).toContain("http://www.w3.org/2000/09/xmldsig#sha1");
  });

  it("incluye el certificado en KeyInfo", () => {
    expect(firmado).toContain("<ds:X509Certificate>");
    expect(firmado).toContain(certificado.certificadoBase64);
    expect(firmado).toContain("<ds:X509SubjectName>");
  });

  it("produce una firma criptográficamente válida", () => {
    const doc = new DOMParser().parseFromString(firmado, "text/xml");
    const nodoFirma = xpath.select1(
      "//*[local-name(.)='Signature']",
      doc as unknown as Node,
    ) as Node;

    const verificador = new SignedXml({ publicCert: certificado.certificadoPem });
    verificador.loadSignature(nodoFirma);

    expect(verificador.checkSignature(firmado)).toBe(true);
  });

  it("detecta un documento manipulado después de firmar", () => {
    const alterado = firmado.replace("<cbc:PayableAmount", '<cbc:PayableAmount data-x="1"');
    const doc = new DOMParser().parseFromString(alterado, "text/xml");
    const nodoFirma = xpath.select1("//*[local-name(.)='Signature']", doc as unknown as Node) as Node;

    const verificador = new SignedXml({ publicCert: certificado.certificadoPem });
    verificador.loadSignature(nodoFirma);

    let valido = true;
    try {
      valido = verificador.checkSignature(alterado);
    } catch {
      valido = false;
    }
    expect(valido).toBe(false);
  });

  it("se niega a firmar un XML sin el hueco de la extensión", () => {
    expect(() => firmarComprobante("<Invoice><cbc:ID>F001-1</cbc:ID></Invoice>", certificado)).toThrow(
      ErrorFirma,
    );
  });
});
