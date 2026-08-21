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
  // `DocumentResponse` va forzado a array porque una RA/RC devuelve una
  // respuesta por línea; con una sola llegaría como objeto y cada lectura
  // tendría que distinguir los dos casos.
  isArray: (nombre) => nombre === "Note" || nombre === "DocumentResponse",
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
  /** `cbc:ID` de la raíz: identifica al CDR entero. */
  idRespuesta: string | null;
  /**
   * Una entrada por `cac:DocumentResponse`. Un comprobante individual trae
   * exactamente una; una comunicación de baja o un resumen traen una por línea.
   */
  lineas: CdrLinea[];
}

/** Respuesta de SUNAT sobre UN documento dentro del CDR. */
export interface CdrLinea {
  codigo: string;
  descripcion: string;
  /** `SERIE-NUMERO` del documento al que se refiere, tal cual lo manda SUNAT. */
  referencia: string | null;
  aceptado: boolean;
  conObservaciones: boolean;
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

  // Cada `cac:DocumentResponse` es la respuesta a UN documento. El
  // comprobante individual trae una; la baja y el resumen, una por línea.
  const respuestas = (raiz.DocumentResponse as Record<string, unknown>[] | undefined) ?? [];

  const lineas: CdrLinea[] = respuestas.flatMap((dr) => {
    const response = dr.Response as Record<string, unknown> | undefined;
    if (!response) return [];

    const codigo = texto(response.ResponseCode);
    const clasificacion = clasificarCodigoSunat(codigo);
    const referenciaDoc = dr.DocumentReference as Record<string, unknown> | undefined;

    return [
      {
        codigo,
        descripcion: texto(response.Description),
        referencia: referenciaDoc ? texto(referenciaDoc.ID) || null : null,
        aceptado: clasificacion === "ACEPTADO" || clasificacion === "OBSERVADO",
        conObservaciones: clasificacion === "OBSERVADO",
      },
    ];
  });

  if (lineas.length === 0) {
    throw new ErrorSunat(
      "RESPUESTA_ILEGIBLE",
      "El CDR no trae cac:DocumentResponse/cac:Response; no se puede saber si fue aceptado.",
    );
  }

  const notas = (raiz.Note as unknown[] | undefined) ?? [];
  const observaciones = notas.map(texto).filter((n) => n !== "");

  // Los campos de cabecera siguen siendo los de la primera respuesta, que en
  // un comprobante individual es la única: así `emitir.ts` no se entera de
  // que esto ahora sabe leer varias.
  const principal = lineas[0];

  return {
    codigo: principal.codigo,
    descripcion: principal.descripcion,
    observaciones,
    referencia: principal.referencia,
    aceptado: principal.aceptado,
    conObservaciones: principal.conObservaciones || observaciones.length > 0,
    xml,
    idRespuesta: texto(raiz.ID) || null,
    lineas,
  };
}

/**
 * Deja "B001-00000053" y "B001-53" en la misma forma.
 *
 * SUNAT no siempre devuelve la referencia con los ceros de relleno con que se
 * envió, así que comparar las cadenas tal cual falla justo cuando importa.
 */
function normalizarReferencia(v: string): string {
  const limpio = v.trim().toUpperCase();
  const corte = limpio.lastIndexOf("-");
  if (corte < 0) return limpio;

  const serie = limpio.slice(0, corte);
  const numero = limpio.slice(corte + 1);
  return /^[0-9]+$/.test(numero) ? `${serie}-${Number(numero)}` : limpio;
}

/**
 * La respuesta que corresponde a un comprobante concreto dentro del CDR.
 *
 * Devuelve `null` en vez de adivinar cuando hay varias líneas y ninguna casa:
 * dar por buena la primera marcaría un documento como anulado con la respuesta
 * de otro.
 */
export function lineaPara(cdr: Cdr, fullNumber: string): CdrLinea | null {
  const buscado = normalizarReferencia(fullNumber);

  const encontrada = cdr.lineas.find(
    (l) => l.referencia !== null && normalizarReferencia(l.referencia) === buscado,
  );
  if (encontrada) return encontrada;

  // Con un documento por RA/RC no hay ambigüedad posible, y SUNAT no siempre
  // repite la referencia en la respuesta.
  return cdr.lineas.length === 1 ? cdr.lineas[0] : null;
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
      `SUNAT ya tiene ese número tomado (${cdr.codigo}): ${cdr.descripcion}. ` +
        "Reenviarlo daría lo mismo: el correlativo está quemado y hay que emitir " +
        "con el siguiente número libre de la serie.",
      detalle,
    );
  }

  return new ErrorSunat(
    "RECHAZADO",
    `SUNAT rechazó el comprobante (${cdr.codigo}): ${cdr.descripcion}`,
    detalle,
  );
}
