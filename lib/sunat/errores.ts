/**
 * Taxonomía de errores de emisión.
 *
 * La gracia de tipar esto es que quien llama pueda decidir sin leer mensajes:
 * qué se reintenta, qué se corrige a mano y qué no se debe volver a enviar
 * nunca. Un reintento ciego sobre un comprobante ya aceptado duplica la
 * numeración, que es de los problemas más caros de deshacer con SUNAT.
 */

export type CodigoErrorSunat =
  | "CONFIG_INVALIDA"
  | "CERTIFICADO_INVALIDO"
  | "FIRMA_INVALIDA"
  | "XML_INVALIDO"
  | "DATOS_INCOMPLETOS"
  | "CONEXION"
  | "TIMEOUT"
  | "CREDENCIALES"
  | "RECHAZADO"
  | "OBSERVADO"
  | "DUPLICADO"
  | "RESPUESTA_ILEGIBLE"
  | "DESCONOCIDO";

export interface DetalleError {
  /** Código que devolvió SUNAT, si lo hubo. */
  codigoSunat?: string;
  /** Texto original de SUNAT, útil para el operador. */
  mensajeSunat?: string;
}

export class ErrorSunat extends Error {
  constructor(
    readonly codigo: CodigoErrorSunat,
    mensaje: string,
    readonly detalle: DetalleError = {},
    readonly causa?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorSunat";
  }

  /**
   * ¿Tiene sentido reintentar tal cual?
   *
   * Sólo lo transitorio. Un rechazo de contenido se vuelve a intentar igual y
   * se rechaza igual; un duplicado NO se reintenta nunca porque el comprobante
   * ya existe del lado de SUNAT.
   */
  get reintentable(): boolean {
    return this.codigo === "CONEXION" || this.codigo === "TIMEOUT";
  }

  /** ¿Hay que arreglar datos antes de volver a intentar? */
  get requiereCorreccion(): boolean {
    return (
      this.codigo === "XML_INVALIDO" ||
      this.codigo === "DATOS_INCOMPLETOS" ||
      this.codigo === "RECHAZADO" ||
      this.codigo === "FIRMA_INVALIDA"
    );
  }
}

/**
 * Familias de códigos de SUNAT.
 *
 *   0000        aceptado
 *   0100-0999   errores de configuración o del envío (SOAP, credenciales, zip)
 *   1000-1999   excepciones del contribuyente: el comprobante NO se registró
 *   2000-3999   errores de contenido: comprobante rechazado
 *   4000+       observaciones: el comprobante SÍ queda aceptado
 */
export function clasificarCodigoSunat(codigo: string): CodigoErrorSunat | "ACEPTADO" {
  const n = Number(codigo);
  if (!Number.isFinite(n)) return "DESCONOCIDO";
  if (n === 0) return "ACEPTADO";
  if (n >= 4000) return "OBSERVADO";
  if (n >= 2000) return "RECHAZADO";
  if (n >= 1000) return "RECHAZADO";

  // Rango 0100-0999: casi todo es configuración nuestra.
  if (n === 100 || n === 98 || n === 99) return "CONEXION";
  if (n >= 150 && n <= 199) return "CREDENCIALES";
  return "XML_INVALIDO";
}

/** ¿El código indica que el comprobante ya estaba registrado antes? */
export function esDuplicado(codigo: string): boolean {
  // 1033: "El comprobante fue registrado previamente con otros datos"
  // 2109 / 2113: numeración ya usada.
  return ["1033", "2109", "2113"].includes(codigo);
}
