/**
 * Empaquetado ZIP de ida y vuelta.
 *
 * SUNAT no recibe el XML suelto: va dentro de un ZIP, en base64, y el nombre
 * del archivo interno tiene que coincidir con el del ZIP salvo la extensión. Si
 * no coincide, el envío se rechaza antes de que nadie mire el contenido.
 *
 * El CDR vuelve por el mismo camino: un ZIP en base64 con el XML de respuesta
 * dentro, normalmente como `R-<nombre>.xml`.
 */

import JSZip from "jszip";
import { ErrorSunat } from "./errores";

/** Mete el XML en un ZIP y lo devuelve en base64, listo para el sobre SOAP. */
export async function empaquetarXml(nombreArchivoXml: string, xml: string): Promise<string> {
  const zip = new JSZip();
  zip.file(nombreArchivoXml, xml);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return buffer.toString("base64");
}

export interface CdrExtraido {
  /** Nombre del XML dentro del ZIP. */
  nombre: string;
  xml: string;
}

/**
 * Saca el XML del ZIP que devuelve SUNAT.
 *
 * El ZIP puede traer más de una entrada (algunas respuestas incluyen carpetas o
 * un `dummy`), así que se busca el primer `.xml` en vez de asumir la posición.
 */
export async function extraerCdr(base64: string): Promise<CdrExtraido> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  } catch (err) {
    throw new ErrorSunat(
      "RESPUESTA_ILEGIBLE",
      "SUNAT respondió algo que no es un ZIP válido.",
      {},
      err,
    );
  }

  const entrada = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".xml"),
  );

  if (!entrada) {
    throw new ErrorSunat(
      "RESPUESTA_ILEGIBLE",
      `El ZIP de respuesta no contiene ningún XML (entradas: ${Object.keys(zip.files).join(", ") || "ninguna"}).`,
    );
  }

  return { nombre: entrada.name, xml: await entrada.async("string") };
}
