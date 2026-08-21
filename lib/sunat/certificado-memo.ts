/**
 * El certificado memorizado del proceso.
 *
 * Abrir el PKCS#12 cuesta y el certificado no cambia entre documentos. Vive
 * aquí, y no dentro de `emitir.ts`, porque la anulación firma con el mismo
 * certificado: duplicar la memoización abriría dos cachés del mismo fichero.
 */

import { getConfigSunat } from "./config";
import { cargarCertificado, verificarVigencia, type CertificadoCargado } from "./certificado";

let memorizado: CertificadoCargado | null = null;

export function obtenerCertificado(): CertificadoCargado {
  if (!memorizado) {
    const config = getConfigSunat();
    memorizado = cargarCertificado(config.certificado.pfx, config.certificado.clave);
  }
  verificarVigencia(memorizado);
  return memorizado;
}

/** Sólo para las pruebas. */
export function _olvidarCertificado(): void {
  memorizado = null;
}
