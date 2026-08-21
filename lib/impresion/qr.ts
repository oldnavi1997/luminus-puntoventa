/**
 * La cadena del código QR de la representación impresa.
 *
 * Un QR mal formado es un incumplimiento silencioso: el comprobante se imprime
 * igual de bonito y nadie se entera hasta que alguien intenta validarlo. Por eso
 * esto vive en un módulo propio, sin dependencias, y se construye en UN solo
 * sitio: la misma cadena se rasteriza para el PDF y para el ticket.
 *
 * El formato son nueve campos separados por `|`, con barra final:
 *
 *   RUC | tipoDoc | serie | correlativo | IGV | total | fecha | tipoDocAdq | nroDocAdq |
 *
 * Circula también una variante con el hash y la firma añadidos al final. Si
 * alguna vez hace falta, se cambia `SUFIJO_QR` y se añaden los campos aquí, no
 * repartidos por el código.
 */

import { formatCorrelativo } from "@/lib/utils";
import { formatearMonto } from "@/lib/sunat/calculo";

/** Nueve campos, y por tanto ocho separadores más el final. */
export const CAMPOS_QR = 9;

/** Lo que cierra la cadena. SUNAT y la mayoría de emisores la dejan con barra. */
export const SUFIJO_QR = "|";

export interface DatosQr {
  ruc: string;
  /** Catálogo 01: "01" factura, "03" boleta. */
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  igv: number;
  total: number;
  /** Día peruano en `YYYY-MM-DD`. Nunca la fecha del servidor. */
  fechaEmision: string;
  /** Catálogo 06. "0" cuando el comprador no está identificado. */
  tipoDocAdquirente: string;
  /** "00000000" cuando el comprador no está identificado. */
  numeroDocAdquirente: string;
}

export function cadenaQr(d: DatosQr): string {
  return (
    [
      d.ruc,
      d.tipoDocumento,
      d.serie,
      formatCorrelativo(d.correlativo),
      // `formatearMonto` y no `formatPEN`: aquí van dos decimales pelados, sin
      // el "S/" ni el separador de miles que mete el formateo de pantalla.
      formatearMonto(d.igv),
      formatearMonto(d.total),
      d.fechaEmision,
      d.tipoDocAdquirente,
      d.numeroDocAdquirente,
    ].join("|") + SUFIJO_QR
  );
}
