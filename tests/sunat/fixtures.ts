import forge from "node-forge";
import type { ConfigSunat } from "@/lib/sunat/config";

/**
 * Certificado autofirmado para las pruebas.
 *
 * Se genera al vuelo — así el repositorio nunca contiene un .pfx, ni siquiera
 * uno de juguete, y las pruebas no dependen de que alguien tenga el real.
 * Clave de 1024 bits sólo por velocidad; no se usa fuera de los tests.
 */
export const CLAVE_PFX = "prueba123";

export function generarPfxDePrueba(opciones?: { ruc?: string; vencido?: boolean }): Buffer {
  const ruc = opciones?.ruc ?? "20609242753";
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";

  const ahora = new Date();
  if (opciones?.vencido) {
    cert.validity.notBefore = new Date(ahora.getTime() - 400 * 86_400_000);
    cert.validity.notAfter = new Date(ahora.getTime() - 30 * 86_400_000);
  } else {
    cert.validity.notBefore = new Date(ahora.getTime() - 86_400_000);
    cert.validity.notAfter = new Date(ahora.getTime() + 365 * 86_400_000);
  }

  const attrs = [
    { name: "commonName", value: "LUMINUS S.A.C." },
    { shortName: "OU", value: ruc },
    { name: "organizationName", value: "LUMINUS S.A.C." },
    { name: "countryName", value: "PE" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // 3DES: el cifrado clásico de PKCS#12, que es justo el que node-forge lee.
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], CLAVE_PFX, {
    algorithm: "3des",
  });

  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

/** Configuración mínima para construir XML en las pruebas. */
export function configDePrueba(): ConfigSunat {
  return {
    ambiente: "beta",
    endpoints: {
      comprobantes: "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
      consultaCdr: "https://e-beta.sunat.gob.pe/ol-it-wsconscpegem-beta/billConsultService",
    },
    ruc: "20609242753",
    razonSocial: "LUMINUS S.A.C.",
    nombreComercial: "Luminus Óptica",
    domicilio: {
      codigoEstablecimiento: "0000",
      direccion: "AV. EJEMPLO 123",
      ubigeo: "150101",
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "LIMA",
      pais: "PE",
    },
    sol: { usuario: "MODDATOS", clave: "moddatos" },
    certificado: { pfx: Buffer.alloc(0), clave: "" },
  };
}
