/**
 * Traducción entre el estado de un envío a SUNAT y el estado del comprobante.
 *
 * Vive aparte de `emitir.ts` porque la anulación necesita exactamente la misma
 * tabla: cuando SUNAT rechaza una comunicación de baja, el documento tiene que
 * volver al estado que tenía, y ese estado se deriva de su envío de emisión.
 */

import { DocumentStatus, EstadoEnvioSunat } from "@/app/generated/prisma/client";

export const ESTADOS_ACEPTADOS: EstadoEnvioSunat[] = [
  EstadoEnvioSunat.ACEPTADO,
  EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES,
];

/** Estado del comprobante que corresponde a cada estado de envío. */
export function estadoDocumentoPara(estado: EstadoEnvioSunat): DocumentStatus {
  switch (estado) {
    case EstadoEnvioSunat.ACEPTADO:
      return DocumentStatus.ACCEPTED;
    case EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES:
      return DocumentStatus.ACCEPTED_WITH_OBSERVATIONS;
    case EstadoEnvioSunat.RECHAZADO:
      return DocumentStatus.REJECTED;
    // Un fallo de transporte no dice nada del comprobante: queda PENDING para
    // que la cola lo recoja, no REJECTED.
    case EstadoEnvioSunat.ERROR_ENVIO:
      return DocumentStatus.PENDING;
    default:
      return DocumentStatus.PENDING;
  }
}
