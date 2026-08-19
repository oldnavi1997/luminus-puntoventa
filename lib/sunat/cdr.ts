/**
 * Lectura del CDR (Constancia de Recepción).
 *
 * El CDR es un ApplicationResponse de UBL. Lo que decide si el comprobante
 * quedó emitido es `cbc:ResponseCode`:
 *
 *   "0"          aceptado
 *   2000-3999    rechazado — el comprobante NO existe para SUNAT
 *   4000+        aceptado CON observaciones — sí existe, pero hay que corregir
 *                para los siguientes
 *
 * Las observaciones vienen en los `cbc:Note`, y aceptarlas en silencio es un
 * error clásico: el comprobante vale, pero SUNAT ya avisó de algo.
 */

import { XMLParser } from "fast-xml-parser";
import { clasificarCodigoSunat, esDuplicado, ErrorSunat } from "./errores";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (nombre) => nombre === "Note",
});

export interface Cdr {
  /** Código de respuesta de SUNAT. "0" = aceptado. */
  codigo: string;
  descripcion: string;
  /** Notas 4000+ : el comprobante quedó aceptado pero con reparos. */
  observaciones: string[];
  /** Identificador del documento al que responde. */
  referencia: string | null;
  aceptado: boolean;
  conObservaciones: boolean;
  /** El XML tal cual, para archivarlo. */
  xml: string;
}

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return String(v);
}

/** Interpreta el XML del CDR. */
export function leerCdr(xml: string): Cdr {
  let raiz: Record<string, unknown>;
  try {
    const parsed = parser.parse(xml) as Record<string, unknown>;
    raiz = (parsed.ApplicationResponse ?? parsed) as Record<string, unknown>;
  } catch (err) {
    throw new ErrorSunat("RESPUESTA_ILEGIBLE", "El CDR no es un XML válido.", {}, err);
  }

  const documentResponse = raiz.DocumentResponse as Record<string, unknown> | undefined;
  const response = documentResponse?.Response as Record<string, unknown> | undefined;

  if (!response) {
    throw new ErrorSunat(
      "RESPUESTA_ILEGIBLE",
      "El CDR no trae cac:DocumentResponse/cac:Response; no se puede saber si fue aceptado.",
    );
  }

  const codigo = texto(response.ResponseCode);
  const descripcion = texto(response.Description);

  const notas = (raiz.Note as unknown[] | undefined) ?? [];
  const observaciones = notas.map(texto).filter((n) => n !== "");

  const referenciaDoc = documentResponse?.DocumentReference as Record<string, unknown> | undefined;
  const clasificacion = clasificarCodigoSunat(codigo);

  return {
    codigo,
    descripcion,
    observaciones,
    referencia: referenciaDoc ? texto(referenciaDoc.ID) || null : null,
    aceptado: clasificacion === "ACEPTADO" || clasificacion === "OBSERVADO",
    conObservaciones: clasificacion === "OBSERVADO" || observaciones.length > 0,
    xml,
  };
}

/**
 * Convierte un CDR de rechazo en el error correspondiente.
 * Devuelve `null` si el comprobante fue aceptado.
 */
export function errorDesdeCdr(cdr: Cdr): ErrorSunat | null {
  if (cdr.aceptado) return null;

  const detalle = { codigoSunat: cdr.codigo, mensajeSunat: cdr.descripcion };

  if (esDuplicado(cdr.codigo)) {
    return new ErrorSunat(
      "DUPLICADO",
      `SUNAT ya tenía registrado este comprobante (${cdr.codigo}): ${cdr.descripcion}. ` +
        "No lo reenvíes: consulta su estado en vez de emitir otro.",
      detalle,
    );
  }

  return new ErrorSunat(
    "RECHAZADO",
    `SUNAT rechazó el comprobante (${cdr.codigo}): ${cdr.descripcion}`,
    detalle,
  );
}
