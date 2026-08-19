/**
 * Cliente del servicio de comprobantes de SUNAT.
 *
 * Son cuatro operaciones con un WSSE UsernameToken en texto plano, así que el
 * sobre se arma a mano con `fetch` en vez de arrastrar un cliente SOAP genérico:
 * menos dependencias, y sin las fricciones conocidas de esas librerías con el
 * WSDL de SUNAT.
 *
 *   sendBill(nombre, zipB64)     facturas y notas → CDR en la misma respuesta
 *   sendSummary(nombre, zipB64)  resúmenes y bajas → devuelve un ticket
 *   getStatus(ticket)            recoge el CDR de un ticket
 *
 * La contraseña SOL viaja en el sobre; por eso nada de esto puede registrarse
 * en logs tal cual (ver `escaparXml` y el manejo de errores).
 */

import { XMLParser } from "fast-xml-parser";
import { ErrorSunat, clasificarCodigoSunat } from "./errores";
import { usuarioWsse, type ConfigSunat } from "./config";

const NS_SOAP = "http://schemas.xmlsoap.org/soap/envelope/";
const NS_SERVICIO = "http://service.sunat.gob.pe";
const NS_WSSE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

/** SUNAT tarda; medio minuto es poco y dos son demasiado para un cajero. */
const TIMEOUT_MS = 60_000;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
});

function escaparXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sobre(config: ConfigSunat, cuerpo: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:ser="${NS_SERVICIO}" xmlns:wsse="${NS_WSSE}">` +
    `<soapenv:Header>` +
    `<wsse:Security>` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${escaparXml(usuarioWsse(config))}</wsse:Username>` +
    `<wsse:Password>${escaparXml(config.sol.clave)}</wsse:Password>` +
    `</wsse:UsernameToken>` +
    `</wsse:Security>` +
    `</soapenv:Header>` +
    `<soapenv:Body>${cuerpo}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

async function llamar(config: ConfigSunat, accion: string, cuerpo: string): Promise<Record<string, unknown>> {
  let respuesta: Response;

  try {
    respuesta = await fetch(config.endpoints.comprobantes, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `urn:${accion}`,
      },
      body: sobre(config, cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const esTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ErrorSunat(
      esTimeout ? "TIMEOUT" : "CONEXION",
      esTimeout
        ? `SUNAT no respondió en ${TIMEOUT_MS / 1000} s. El comprobante puede haberse registrado igualmente: consulta su estado antes de reenviar.`
        : "No se pudo contactar con SUNAT. Se reintentará automáticamente.",
      {},
      err,
    );
  }

  const texto = await respuesta.text();
  const parsed = parser.parse(texto) as Record<string, unknown>;
  const envelope = (parsed.Envelope ?? parsed) as Record<string, unknown>;
  const body = (envelope.Body ?? {}) as Record<string, unknown>;

  const fault = body.Fault as Record<string, unknown> | undefined;
  if (fault) throw errorDeFault(fault);

  if (!respuesta.ok) {
    throw new ErrorSunat(
      "CONEXION",
      `SUNAT respondió HTTP ${respuesta.status} sin un fault interpretable.`,
      { mensajeSunat: texto.slice(0, 300) },
    );
  }

  return body;
}

/**
 * Un SOAP Fault de SUNAT trae el código real en `faultcode` (a veces como
 * "soap-env:Client.NNNN") y el detalle en `faultstring`.
 */
function errorDeFault(fault: Record<string, unknown>): ErrorSunat {
  const faultcode = String(fault.faultcode ?? "");
  const faultstring = String(fault.faultstring ?? "Error no descrito por SUNAT");

  const codigo = /(\d{3,4})/.exec(faultcode)?.[1] ?? /^(\d{3,4})/.exec(faultstring)?.[1] ?? "";
  const clasificacion = codigo ? clasificarCodigoSunat(codigo) : "DESCONOCIDO";

  const detalle = { codigoSunat: codigo || undefined, mensajeSunat: faultstring };

  if (clasificacion === "CREDENCIALES") {
    return new ErrorSunat(
      "CREDENCIALES",
      `SUNAT rechazó las credenciales (${codigo}): ${faultstring}. Revisa SUNAT_SOL_USER y SUNAT_SOL_PASSWORD — el usuario debe ser el SOL secundario.`,
      detalle,
    );
  }

  return new ErrorSunat(
    clasificacion === "ACEPTADO" || clasificacion === "OBSERVADO" ? "DESCONOCIDO" : clasificacion,
    `SUNAT devolvió un error${codigo ? ` (${codigo})` : ""}: ${faultstring}`,
    detalle,
  );
}

/** Envío síncrono de un comprobante. Devuelve el CDR en base64. */
export async function sendBill(
  config: ConfigSunat,
  nombreZip: string,
  zipBase64: string,
): Promise<string> {
  const body = await llamar(
    config,
    "sendBill",
    `<ser:sendBill><fileName>${escaparXml(nombreZip)}</fileName><contentFile>${zipBase64}</contentFile></ser:sendBill>`,
  );

  const respuesta = body.sendBillResponse as Record<string, unknown> | undefined;
  const cdr = respuesta?.applicationResponse;

  if (typeof cdr !== "string" || cdr === "") {
    throw new ErrorSunat("RESPUESTA_ILEGIBLE", "SUNAT aceptó el envío pero no devolvió el CDR.");
  }
  return cdr;
}

/** Envío asíncrono (resumen diario, comunicación de baja). Devuelve el ticket. */
export async function sendSummary(
  config: ConfigSunat,
  nombreZip: string,
  zipBase64: string,
): Promise<string> {
  const body = await llamar(
    config,
    "sendSummary",
    `<ser:sendSummary><fileName>${escaparXml(nombreZip)}</fileName><contentFile>${zipBase64}</contentFile></ser:sendSummary>`,
  );

  const respuesta = body.sendSummaryResponse as Record<string, unknown> | undefined;
  const ticket = respuesta?.ticket;

  if (typeof ticket !== "string" || ticket === "") {
    throw new ErrorSunat("RESPUESTA_ILEGIBLE", "SUNAT no devolvió el ticket del resumen.");
  }
  return ticket;
}

export interface EstadoTicket {
  /** 0 = procesado con CDR; 98 = en proceso; 99 = procesado con errores. */
  codigo: string;
  mensaje: string;
  /** CDR en base64, cuando ya está listo. */
  cdrBase64: string | null;
  enProceso: boolean;
}

/** Consulta el resultado de un ticket. */
export async function getStatus(config: ConfigSunat, ticket: string): Promise<EstadoTicket> {
  const body = await llamar(
    config,
    "getStatus",
    `<ser:getStatus><ticket>${escaparXml(ticket)}</ticket></ser:getStatus>`,
  );

  const respuesta = body.getStatusResponse as Record<string, unknown> | undefined;
  const status = respuesta?.status as Record<string, unknown> | undefined;

  if (!status) {
    throw new ErrorSunat("RESPUESTA_ILEGIBLE", "SUNAT no devolvió el estado del ticket.");
  }

  const codigo = String(status.statusCode ?? "");
  const contenido = status.content;

  return {
    codigo,
    mensaje: String(status.statusMessage ?? ""),
    cdrBase64: typeof contenido === "string" && contenido !== "" ? contenido : null,
    // 98 = "en proceso": hay que volver a preguntar más tarde, no es un error.
    enProceso: codigo === "98",
  };
}
