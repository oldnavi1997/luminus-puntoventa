/**
 * Reglas del adquirente, comprobadas ANTES de firmar.
 *
 * Todo lo que se pille aquí es un rechazo de SUNAT que no llega a ocurrir, y
 * sobre todo un correlativo que no se quema: la numeración se asigna al crear
 * la venta, así que un comprobante rechazado deja un hueco en la serie que hay
 * que justificar después.
 */

import { DOC_SIN_IDENTIFICAR, esRUC, esDNI } from "@/lib/documento";
import { UMBRAL_DNI_BOLETA } from "./catalogos";
import { ErrorSunat } from "./errores";

export interface AdquirenteAValidar {
  docType: string;
  docNumber: string;
  name: string;
  address?: string | null;
}

/**
 * @param total importe del comprobante, para el umbral de la boleta.
 */
export function validarAdquirente(
  tipo: "FACTURA" | "BOLETA",
  adquirente: AdquirenteAValidar,
  total: number,
): void {
  const nombre = adquirente.name?.trim() ?? "";
  const numero = adquirente.docNumber?.trim() ?? "";

  if (tipo === "FACTURA") {
    if (!esRUC(numero)) {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        `Una factura exige RUC de 11 dígitos; llegó "${numero || "vacío"}". Corrige el comprador o emite una boleta.`,
      );
    }
    if (adquirente.docType.toUpperCase() !== "RUC") {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        `Una factura exige tipo de documento RUC; llegó "${adquirente.docType}".`,
      );
    }
    if (nombre === "" || nombre.toUpperCase() === "CLIENTE VARIOS") {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        "Una factura exige la razón social del adquirente.",
      );
    }
    return;
  }

  // ── Boleta ────────────────────────────────────────────────────────────────
  // Por encima del umbral hay que identificar al comprador; por debajo se
  // admite el centinela de "cliente varios".
  if (total >= UMBRAL_DNI_BOLETA) {
    if (numero === "" || numero === DOC_SIN_IDENTIFICAR) {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        `Una boleta de S/ ${total.toFixed(2)} supera el umbral de S/ ${UMBRAL_DNI_BOLETA} y exige identificar al comprador con su DNI.`,
      );
    }
    if (adquirente.docType.toUpperCase() === "DNI" && !esDNI(numero)) {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        `El DNI debe tener 8 dígitos; llegó "${numero}".`,
      );
    }
    if (nombre === "" || nombre.toUpperCase() === "CLIENTE VARIOS") {
      throw new ErrorSunat(
        "DATOS_INCOMPLETOS",
        `Una boleta de S/ ${total.toFixed(2)} exige el nombre del comprador.`,
      );
    }
  }
}
