/**
 * Correlativo diario de los resúmenes y las comunicaciones de baja.
 *
 * No hay una fila de `DocumentSerie` para esto: el contador es la propia tabla
 * `SunatTicket`, cuyo `@@unique([tipo, fechaReferencia, correlativo])` es
 * exactamente el espacio que SUNAT hace único —`RUC-RA-AAAAMMDD-N`—. Leer el
 * máximo del día y volver a intentarlo si otro proceso se adelantó es correcto
 * porque la restricción de la base ES la restricción de SUNAT.
 *
 * Dos cosas que separan esto del correlativo de un comprobante:
 *
 * 1. El número va DENTRO del XML firmado, así que no se puede firmar antes de
 *    saberlo; y si hay que reintentar, hay que volver a construir y RE-FIRMAR.
 *    Por eso se recibe un callback y no un XML ya hecho.
 * 2. Un número de RA/RC quemado no cuesta nada: no hay obligación de
 *    correlatividad sin huecos en los resúmenes. Eso permite crear la fila
 *    antes de enviar —el invariante del proyecto— sin efectos secundarios.
 */

/** Cuántas veces se reintenta antes de rendirse ante una carrera. */
const MAX_COLISIONES = 5;

export type TipoTicket = "RA" | "RC";

export interface DatosTicket {
  tipo: TipoTicket;
  fechaReferencia: Date;
  correlativo: number;
  nombreArchivo: string;
  xmlFirmado: string;
}

/** Lo mínimo que `crearTicketConCorrelativo` necesita de la base. */
export interface RepositorioTickets<T> {
  ultimoCorrelativo(tipo: TipoTicket, dia: Date): Promise<number | null>;
  crear(datos: DatosTicket): Promise<T>;
}

/**
 * El día peruano al que pertenece un instante, como fecha sin hora.
 *
 * `fechaReferencia` es una columna `@db.Date`, así que se guarda a medianoche
 * UTC: guardar el instante local haría que una baja generada a las 20:00 de
 * Lima cayera en el día siguiente y colisionara con la del día que viene.
 */
export function diaLima(d: Date = new Date()): Date {
  const peruano = d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  return new Date(`${peruano}T00:00:00.000Z`);
}

/** P2002: otro proceso se llevó ese correlativo entre la lectura y el insert. */
export function esColisionDeCorrelativo(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Reserva el siguiente correlativo del día y crea el ticket con el XML ya
 * firmado para ese número.
 *
 * @param construir recibe el correlativo y devuelve el nombre y el XML firmado.
 *   Se llama una vez por intento: el número forma parte de lo que se firma.
 */
export async function crearTicketConCorrelativo<T>(
  repo: RepositorioTickets<T>,
  tipo: TipoTicket,
  dia: Date,
  construir: (correlativo: number, dia: Date) => { nombreArchivo: string; xmlFirmado: string },
): Promise<T> {
  let ultimoError: unknown;

  for (let intento = 0; intento < MAX_COLISIONES; intento++) {
    const ultimo = await repo.ultimoCorrelativo(tipo, dia);
    const correlativo = (ultimo ?? 0) + 1;

    const { nombreArchivo, xmlFirmado } = construir(correlativo, dia);

    try {
      return await repo.crear({ tipo, fechaReferencia: dia, correlativo, nombreArchivo, xmlFirmado });
    } catch (e) {
      if (!esColisionDeCorrelativo(e)) throw e;
      ultimoError = e;
    }
  }

  throw new Error(
    `No se pudo reservar un correlativo de ${tipo} tras ${MAX_COLISIONES} intentos: ` +
      "hay otro proceso creando bajas al mismo tiempo. " +
      (ultimoError instanceof Error ? ultimoError.message : ""),
  );
}
