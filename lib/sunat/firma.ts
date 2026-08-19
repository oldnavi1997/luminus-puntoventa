/**
 * Firma digital XMLDSig del comprobante.
 *
 * SUNAT exige una firma *enveloped* sobre todo el documento (Reference URI="")
 * alojada dentro de `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent`,
 * con RSA-SHA1 y canonicalización C14N — así está en la guía oficial, y no es
 * negociable aunque SHA1 esté obsoleto en otros contextos.
 *
 * El `Id` del `ds:Signature` tiene que coincidir con lo que apunta
 * `cac:Signature/…/cbc:URI` en el cuerpo del comprobante; ambos salen de
 * `ID_FIRMA` para que no puedan desincronizarse.
 */

import { SignedXml } from "xml-crypto";
import type { CertificadoCargado } from "./certificado";
import { ID_FIRMA } from "./ubl/comprobante";

const ALGORITMOS = {
  canonicalizacion: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  firma: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  digest: "http://www.w3.org/2000/09/xmldsig#sha1",
  envelopedSignature: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
} as const;

export class ErrorFirma extends Error {
  readonly codigo = "FIRMA_INVALIDA";
  constructor(mensaje: string, readonly causa?: unknown) {
    super(mensaje);
    this.name = "ErrorFirma";
  }
}

/**
 * Devuelve el XML con el `ds:Signature` insertado en el hueco de la extensión.
 *
 * @param xml  comprobante sin firmar, con `ext:ExtensionContent` vacío.
 */
export function firmarComprobante(xml: string, cert: CertificadoCargado): string {
  if (!xml.includes("ExtensionContent")) {
    throw new ErrorFirma(
      "El XML no tiene ext:ExtensionContent; sin ese hueco la firma no puede alojarse donde SUNAT la busca.",
    );
  }

  const firmador = new SignedXml({
    privateKey: cert.clavePrivadaPem,
    publicCert: cert.certificadoPem,
    signatureAlgorithm: ALGORITMOS.firma,
    canonicalizationAlgorithm: ALGORITMOS.canonicalizacion,
    // KeyInfo con el subject y el certificado, como el ejemplo de la guía.
    getKeyInfoContent: () =>
      `<ds:X509Data>` +
      `<ds:X509SubjectName>${escaparXml(cert.subjectName)}</ds:X509SubjectName>` +
      `<ds:X509Certificate>${cert.certificadoBase64}</ds:X509Certificate>` +
      `</ds:X509Data>`,
  });

  // URI="" = todo el documento. `isEmptyUri` hace que xml-crypto emita
  // literalmente URI="" en vez de omitir el atributo o inventar un fragmento.
  //
  // La canonicalización va EXPLÍCITA en la cadena de transformaciones. No es
  // decorativo: `getCanonXml` de xml-crypto aplica sólo lo que se le lista, sin
  // recurrir a `canonicalizationAlgorithm` como respaldo. Si aquí va sólo la
  // transformación enveloped, el digest se calcula sobre la serialización cruda
  // del DOM — namespaces sin ordenar y `<x/>` en vez de `<x></x>` — mientras que
  // el validador de SUNAT (Apache Santuario) canonicaliza según la norma y
  // obtiene otro digest. El resultado sería el rechazo de todos los
  // comprobantes por firma inválida.
  firmador.addReference({
    xpath: "/*",
    transforms: [ALGORITMOS.envelopedSignature, ALGORITMOS.canonicalizacion],
    digestAlgorithm: ALGORITMOS.digest,
    uri: "",
    isEmptyUri: true,
  });

  try {
    firmador.computeSignature(xml, {
      prefix: "ds",
      attrs: { Id: ID_FIRMA },
      location: { reference: "//*[local-name(.)='ExtensionContent']", action: "append" },
    });
  } catch (err) {
    throw new ErrorFirma(
      `No se pudo firmar el comprobante: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  return firmador.getSignedXml();
}

function escaparXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
