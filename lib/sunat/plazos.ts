/**
 * Plazo para dar de baja un comprobante.
 *
 * Pasado el plazo SUNAT ya no acepta la anulación y el único instrumento válido
 * es una nota de crédito, que este POS todavía no emite. Por eso el plazo se
 * comprueba ANTES de construir nada: un rechazo por plazo vencido no enseña
 * nada que no supiéramos y gasta un correlativo de RA/RC para nada.
 */

import { fechaLima } from "./ubl/comun";

/**
 * RS 097-2012/SUNAT y modificatorias: hasta el sétimo día calendario siguiente
 * a la fecha de emisión, tanto para la comunicación de baja (facturas) como
 * para la anulación por resumen (boletas).
 *
 * Está en un solo sitio porque conviene que lo confirme el contador contra la
 * resolución vigente; si algún día difiere entre factura y boleta, esto se
 * parte en dos constantes y `plazoDeBaja` recibe el tipo.
 */
export const DIAS_PLAZO_BAJA = 7;

export interface PlazoBaja {
  vencido: boolean;
  /** Último día en que SUNAT aceptaría la baja. */
  limite: Date;
  /** Días que faltan; 0 el último día, negativo si ya venció. */
  diasRestantes: number;
}

/**
 * Días calendario de Lima entre dos instantes.
 *
 * Se compara día peruano contra día peruano, no ventanas de 24 horas. Una
 * boleta emitida a las 21:00 de Lima son las 02:00 UTC del día siguiente: con
 * una resta de milisegundos contaría como emitida mañana y el plazo saldría
 * corrido un día.
 */
function diasCalendarioLima(desde: Date, hasta: Date): number {
  const a = Date.parse(`${fechaLima(desde)}T00:00:00Z`);
  const b = Date.parse(`${fechaLima(hasta)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function plazoDeBaja(emitidoEn: Date, ahora: Date = new Date()): PlazoBaja {
  const transcurridos = diasCalendarioLima(emitidoEn, ahora);
  const diasRestantes = DIAS_PLAZO_BAJA - transcurridos;

  const limite = new Date(
    Date.parse(`${fechaLima(emitidoEn)}T00:00:00Z`) + DIAS_PLAZO_BAJA * 86_400_000,
  );

  return { vencido: diasRestantes < 0, limite, diasRestantes };
}
