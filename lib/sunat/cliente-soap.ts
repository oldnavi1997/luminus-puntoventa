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
 *   consultarComprobante(...)    si un serie-correlativo ya está tomado
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

/**
 * Dos llamadas pegadas al servicio de SUNAT reciben un 401 de su gateway.
 *
 * No es un problema de credenciales: es el nginx que tiene delante, y se
 * reconoce porque responde una página HTML en vez de un sobre SOAP (un
 * permiso mal dado llega como fault 0111, no como esto). Comprobado contra
 * beta: dos sendBill seguidos sin pausa fallan el segundo y el tercero, y con
 * medio segundo entre medias pasan los dos.
 *
 * Importa más de lo que parece: `processQueue` drena hasta diez comprobantes
 * en un bucle, así que sin esto la cola sólo colocaba el primero de cada
 * pasada y devolvía los demás a la cola como si SUNAT no hubiera respondido.
 */
/**
 * Se lee del entorno para poder anularla donde no hay gateway que respetar:
 * con `fetch` simulado la pausa es tiempo muerto y nada más.
 */
const PAUSA_ENTRE_LLAMADAS_MS = Number(process.env.SUNAT_PAUSA_LLAMADAS_MS ?? 1_200);
const ESPERA_TRAS_401_MS = 4_000;
const REINTENTOS_401 = 2;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ultimaLlamada = 0;
let turno: Promise<unknown> = Promise.resolve();

/**
 * Serializa las llamadas a SUNAT y deja un hueco mínimo entre ellas.
 *
 * Va aquí y no en quien llama porque el estrangulamiento es por servicio, no
 * por operación: emitir, anular y sondear compiten por el mismo hueco.
 */
function enTurno<T>(fn: () => Promise<T>): Promise<T> {
  const resultado = turno.then(async () => {
    const transcurrido = Date.now() - ultimaLlamada;
    if (transcurrido < PAUSA_ENTRE_LLAMADAS_MS) {
      await esperar(PAUSA_ENTRE_LLAMADAS_MS - transcurrido);
    }
    try {
      return await fn();
    } finally {
      ultimaLlamada = Date.now();
    }
  });

  // La cola no puede romperse porque una llamada falle.
  turno = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
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

/** Una petición suelta. Devuelve la respuesta y su cuerpo sin interpretarlos. */
async function peticion(
  endpoint: string,
  accion: string,
  sobreXml: string,
): Promise<{ respuesta: Response; texto: string }> {
  let respuesta: Response;

  try {
    respuesta = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `urn:${accion}`,
      },
      body: sobreXml,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const esTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ErrorSunat(
      esTimeout ? "TIMEOUT" : "CONEXION",
      esTimeout
        ? `SUNAT no respondió en ${TIMEOUT_MS / 1000} s. El comprobante puede haberse registrado igualmente: consulta su estado antes de reenviar.`
        : "No se pudo contactar con SUNAT. Se reintentará automáticamente.",
      {},
      err,
    );
  }

  return { respuesta, texto: await respuesta.text() };
}

/** El 401 del gateway llega como HTML de nginx, no como un sobre SOAP. */
function esEstrangulamiento(respuesta: Response, texto: string): boolean {
  return respuesta.status === 401 && !texto.includes("Envelope");
}

async function llamar(
  config: ConfigSunat,
  accion: string,
  cuerpo: string,
  // La consulta por serie-correlativo no vive en el mismo servicio que el envío.
  endpoint: string = config.endpoints.comprobantes,
): Promise<Record<string, unknown>> {
  const sobreXml = sobre(config, cuerpo);
  let respuesta: Response;
  let texto: string;

  for (let intento = 0; ; intento++) {
    ({ respuesta, texto } = await enTurno(() => peticion(endpoint, accion, sobreXml)));

    if (!esEstrangulamiento(respuesta, texto) || intento >= REINTENTOS_401) break;

    // Nada que corregir: la misma petición pasa sola con un hueco por delante.
    await esperar(ESPERA_TRAS_401_MS);
  }

  const parsed = parser.parse(texto) as Record<string, unknown>;
  const envelope = (parsed.Envelope ?? parsed) as Record<string, unknown>;
  const body = (envelope.Body ?? {}) as Record<string, unknown>;

  const fault = body.Fault as Record<string, unknown> | undefined;
  if (fault) throw errorDeFault(fault);

  if (!respuesta.ok) {
    throw new ErrorSunat(
      "CONEXION",
      esEstrangulamiento(respuesta, texto)
        ? `SUNAT devolvió 401 en su gateway tras ${REINTENTOS_401 + 1} intentos espaciados. No es la clave SOL: es que rechaza llamadas seguidas.`
        : `SUNAT respondió HTTP ${respuesta.status} sin un fault interpretable.`,
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
      `SUNAT rechazó las credenciales (${codigo}): ${faultstring}. Revisa SUNAT_SOL_USER y SUNAT_SOL_PASSWORD. ` +
        `SUNAT_SOL_USER es el nombre del usuario SOL a secas, sin el RUC delante: el RUC se antepone solo al armar el sobre.`,
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

export interface EstadoComprobante {
  /** Código que devuelve SUNAT tal cual; su significado va en `mensaje`. */
  codigo: string;
  mensaje: string;
  /** true si SUNAT reconoce ese serie-correlativo, aceptado o dado de baja. */
  existe: boolean;
}

/**
 * Pregunta a SUNAT si un serie-correlativo ya está tomado.
 *
 * Existe porque la alternativa es averiguarlo emitiendo, y cada intento contra
 * un número ya informado lo quema para siempre (1032/1033). Cuando una serie
 * viene de un sistema anterior no hay forma de saber dónde quedó, y adivinar de
 * uno en uno cuesta un correlativo por intento.
 *
 * Va contra `billConsultService`, no contra el de envío, y el usuario SOL
 * necesita además el permiso de consultar validez de CPE.
 *
 * Los códigos no se interpretan aquí a propósito: SUNAT los ha cambiado de
 * significado entre revisiones y el texto de `statusMessage` es lo único
 * estable. Sólo se distingue "no existe" de todo lo demás.
 */
export async function consultarComprobante(
  config: ConfigSunat,
  comprobante: { tipo: string; serie: string; numero: number },
): Promise<EstadoComprobante> {
  const body = await llamar(
    config,
    "getStatus",
    `<ser:getStatus>` +
      `<rucComprobante>${escaparXml(config.ruc)}</rucComprobante>` +
      `<tipoComprobante>${escaparXml(comprobante.tipo)}</tipoComprobante>` +
      `<serieComprobante>${escaparXml(comprobante.serie)}</serieComprobante>` +
      `<numeroComprobante>${comprobante.numero}</numeroComprobante>` +
      `</ser:getStatus>`,
    config.endpoints.consultaCdr,
  );

  const respuesta = body.getStatusResponse as Record<string, unknown> | undefined;
  const status = respuesta?.status as Record<string, unknown> | undefined;

  if (!status) {
    throw new ErrorSunat("RESPUESTA_ILEGIBLE", "SUNAT no devolvió el estado del comprobante.");
  }

  const codigo = String(status.statusCode ?? "");
  const mensaje = String(status.statusMessage ?? "");

  return {
    codigo,
    mensaje,
    // "No existe" es lo único que hace libre un correlativo. Cualquier otra
    // respuesta —aceptado, anulado, rechazado— significa que está tomado.
    existe: !/no existe|no se encuentra|no ha sido informado/i.test(mensaje),
  };
}
