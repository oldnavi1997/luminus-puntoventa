/**
 * Nombres de archivo de los comprobantes.
 *
 * SUNAT los usa como identificador del envío: el ZIP, el XML que va dentro y el
 * CDR que devuelve comparten la misma raíz, y si no coincide con el contenido
 * del XML el envío se rechaza antes de validarse.
 *
 *   Comprobante:  RUC-TIPO-SERIE-CORRELATIVO       20609242753-01-F001-123
 *   Resumen/baja: RUC-TIPO-FECHA-CORRELATIVO       20609242753-RC-20260819-1
 *   CDR:          R-<raíz>                         R-20609242753-01-F001-123
 */

/** Raíz del nombre para factura, boleta y notas. */
export function nombreComprobante(
  ruc: string,
  tipoDocumento: string,
  serie: string,
  correlativo: number,
): string {
  return `${ruc}-${tipoDocumento}-${serie}-${correlativo}`;
}

/** Raíz del nombre para resumen diario (RC) y comunicación de baja (RA). */
export function nombreResumen(
  ruc: string,
  tipoDocumento: string,
  fecha: string,
  correlativo: number,
): string {
  return `${ruc}-${tipoDocumento}-${fecha.replace(/-/g, "")}-${correlativo}`;
}

/**
 * El `cbc:ID` que va DENTRO del XML de un resumen o una baja: `RA-20260821-1`.
 *
 * Vive pegado a `nombreResumen` porque los dos tienen que llevar la misma fecha
 * y el mismo correlativo. Si el nombre del ZIP y el ID del XML no coinciden,
 * SUNAT rechaza el envío antes de mirar el contenido.
 */
export function idResumen(tipoDocumento: string, fecha: string, correlativo: number): string {
  return `${tipoDocumento}-${fecha.replace(/-/g, "")}-${correlativo}`;
}

export const archivoXml = (raiz: string) => `${raiz}.xml`;
export const archivoZip = (raiz: string) => `${raiz}.zip`;
/** SUNAT devuelve el CDR con el prefijo "R-". */
export const archivoCdr = (raiz: string) => `R-${raiz}.zip`;
