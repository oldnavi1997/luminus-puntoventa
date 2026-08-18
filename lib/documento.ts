/**
 * Reglas de forma de los documentos de identidad.
 *
 * Estaban duplicadas inline en varios sitios (app/api/clientes/route.ts,
 * ConvertirView, DocumentTypeSelector); aqui viven una sola vez.
 */

/** Centinela que el POS graba cuando la venta no tiene comprador identificado. */
export const DOC_SIN_IDENTIFICAR = "00000000";

export const TIPOS_DOCUMENTO = ["DNI", "RUC", "CE"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export function esDNI(v: string): boolean {
  return /^\d{8}$/.test(v);
}

export function esRUC(v: string): boolean {
  return /^\d{11}$/.test(v);
}

/** Solo DNI y RUC son consultables contra el proveedor externo. */
export function esConsultable(v: string): boolean {
  return esDNI(v) || esRUC(v);
}

/** true cuando el numero identifica de verdad a alguien. */
export function tieneDocumento(v?: string | null): v is string {
  return !!v && v !== DOC_SIN_IDENTIFICAR;
}

/** Devuelve el motivo del rechazo, o null si el documento es valido. */
export function validarDocumento(docType: string, docNumber: string): string | null {
  const n = docNumber.trim();
  if (!n) return "El numero de documento no puede estar vacio";
  if (docType === "DNI" && !esDNI(n)) return "El DNI debe tener 8 digitos";
  if (docType === "RUC" && !esRUC(n)) return "El RUC debe tener 11 digitos";
  if (docType === "CE" && n.length < 6) return "El carne de extranjeria es demasiado corto";
  return null;
}
