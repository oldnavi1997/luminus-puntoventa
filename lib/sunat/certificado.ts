/**
 * Lectura del certificado digital (PKCS#12).
 *
 * `.pfx` y `.p12` son el MISMO contenedor PKCS#12 — sólo cambia la extensión por
 * convención histórica (Microsoft usó .pfx, la especificación PKCS#12 usó .p12).
 * No hay que convertir nada.
 *
 * El matiz que sí importa: los contenedores generados con OpenSSL 3.x usan
 * AES-256-CBC con PBKDF2 (PBES2), y node-forge sólo implementa los cifrados
 * antiguos (3DES / RC2). Si el certificado viene con el cifrado nuevo, la carga
 * falla y hay que re-empaquetarlo con `openssl pkcs12 -legacy` — que cambia el
 * cifrado del contenedor, no el certificado ni la clave.
 */

import forge from "node-forge";

export interface CertificadoCargado {
  /** Clave privada en PEM, para firmar. */
  clavePrivadaPem: string;
  /** Certificado en PEM. */
  certificadoPem: string;
  /** El certificado DER en base64, tal cual va en ds:X509Certificate. */
  certificadoBase64: string;
  /** Subject completo, como lo espera ds:X509SubjectName. */
  subjectName: string;
  emisor: string;
  numeroSerie: string;
  validoDesde: Date;
  validoHasta: Date;
  /** RUC leído del OU del subject, si el certificado lo trae. */
  rucDelCertificado: string | null;
}

export class ErrorCertificado extends Error {
  constructor(
    readonly codigo:
      | "CLAVE_INCORRECTA"
      | "CIFRADO_NO_SOPORTADO"
      | "FORMATO_INVALIDO"
      | "SIN_CLAVE_PRIVADA"
      | "SIN_CERTIFICADO"
      | "VENCIDO",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorCertificado";
  }
}

/** Junta los atributos del subject/issuer en la forma "CN=…,OU=…,O=…". */
function formatearNombre(attrs: forge.pki.CertificateField[]): string {
  return attrs
    .map((a) => `${a.shortName ?? a.name ?? "?"}=${String(a.value ?? "")}`)
    .join(",");
}

/**
 * El RUC va en el OU del subject en los certificados tributarios peruanos.
 * Si no está, devuelve null y quien llame decide (no es fatal por sí solo).
 */
function extraerRuc(attrs: forge.pki.CertificateField[]): string | null {
  for (const a of attrs) {
    const valor = String(a.value ?? "");
    if (/^\d{11}$/.test(valor)) return valor;
  }
  return null;
}

/**
 * Abre el PKCS#12 y saca clave privada y certificado.
 *
 * Nunca registra ni devuelve la contraseña, y los errores de node-forge se
 * traducen a algo accionable: su mensaje crudo ("Invalid password?") confunde
 * dos causas muy distintas — clave mala y cifrado no soportado.
 */
export function cargarCertificado(pfx: Buffer, clave: string): CertificadoCargado {
  let p12: forge.pkcs12.Pkcs12Pfx;

  try {
    const der = forge.util.createBuffer(pfx.toString("binary"));
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (/Unsupported|not supported|PBES2|AES/i.test(msg)) {
      throw new ErrorCertificado(
        "CIFRADO_NO_SOPORTADO",
        "El contenedor usa un cifrado que node-forge no soporta (típico de OpenSSL 3.x). " +
          "Re-empaquétalo conservando certificado y clave: " +
          "openssl pkcs12 -in original.pfx -out compatible.pfx -legacy -export",
      );
    }
    if (/MAC|password|Invalid/i.test(msg)) {
      throw new ErrorCertificado(
        "CLAVE_INCORRECTA",
        "No se pudo abrir el certificado: la contraseña no coincide, o el contenedor usa un cifrado no soportado.",
      );
    }
    throw new ErrorCertificado("FORMATO_INVALIDO", `El archivo no es un PKCS#12 válido: ${msg}`);
  }

  // La clave puede venir cifrada (pkcs8ShroudedKeyBag) o en claro (keyBag).
  const bolsasClave = {
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
  };
  const bolsaClave =
    bolsasClave[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? bolsasClave[forge.pki.oids.keyBag]?.[0];

  if (!bolsaClave?.key) {
    throw new ErrorCertificado(
      "SIN_CLAVE_PRIVADA",
      "El certificado no trae clave privada. Pide a la entidad emisora el archivo con la clave incluida.",
    );
  }

  const bolsaCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!bolsaCert?.cert) {
    throw new ErrorCertificado("SIN_CERTIFICADO", "El contenedor no trae el certificado X.509.");
  }

  const cert = bolsaCert.cert;
  const certificadoPem = forge.pki.certificateToPem(cert);

  // ds:X509Certificate lleva el DER en base64, sin las líneas BEGIN/END.
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certificadoBase64 = forge.util.encode64(der);

  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(bolsaClave.key),
    certificadoPem,
    certificadoBase64,
    subjectName: formatearNombre(cert.subject.attributes),
    emisor: formatearNombre(cert.issuer.attributes),
    numeroSerie: cert.serialNumber,
    validoDesde: cert.validity.notBefore,
    validoHasta: cert.validity.notAfter,
    rucDelCertificado: extraerRuc(cert.subject.attributes),
  };
}

/** Lanza si el certificado ya venció o todavía no entra en vigencia. */
export function verificarVigencia(cert: CertificadoCargado, ahora = new Date()): void {
  if (ahora > cert.validoHasta) {
    throw new ErrorCertificado(
      "VENCIDO",
      `El certificado venció el ${cert.validoHasta.toLocaleDateString("es-PE")}. Renuévalo antes de emitir.`,
    );
  }
  if (ahora < cert.validoDesde) {
    throw new ErrorCertificado(
      "VENCIDO",
      `El certificado recién entra en vigencia el ${cert.validoDesde.toLocaleDateString("es-PE")}.`,
    );
  }
}
