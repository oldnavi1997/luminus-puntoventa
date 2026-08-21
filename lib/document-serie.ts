import { DocumentType, Prisma } from "@/app/generated/prisma/client";
import { formatCorrelativo } from "@/lib/sunat";

/**
 * Reserva el siguiente correlativo de la serie ACTIVA para un tipo de documento.
 *
 * La serie no está en el código a propósito. Una serie se contamina —SUNAT ya
 * tiene números informados o anulados en ella— y entonces todo comprobante que
 * salga con ese número es rechazado (1032/1033) y el correlativo se quema sin
 * remedio. Pasó con B001: la emitió la integración anterior, el POS nunca supo
 * de esas boletas, y no hay forma de averiguar desde aquí hasta dónde llegó.
 *
 * Con la serie en la base, abandonar una serie quemada es un UPDATE de una fila
 * —no un deploy—, que es lo que hace falta cuando estás perdiendo números.
 *
 * Si hay más de una serie activa gana la más reciente: así basta con insertar la
 * nueva para que tome el relevo, sin depender de acordarse de desactivar la vieja.
 */
export async function reservarCorrelativo(
  tx: Prisma.TransactionClient,
  type: DocumentType,
): Promise<{ serie: string; correlativo: number; fullNumber: string }> {
  // El FOR UPDATE serializa a dos cajeros vendiendo a la vez: el segundo espera
  // y vuelve a leer la fila ya incrementada, en vez de repetir el correlativo.
  const filas = await tx.$queryRaw<{ serie: string; lastNumber: number }[]>`
    SELECT serie, "lastNumber" FROM "DocumentSerie"
    WHERE type = ${type}::"DocumentType" AND active = true
    ORDER BY "createdAt" DESC
    LIMIT 1
    FOR UPDATE
  `;

  const fila = filas[0];
  if (!fila) {
    throw new Error(
      `No hay ninguna serie activa para ${type}. Crea la fila en DocumentSerie ` +
        `(o marca active = true en la que corresponda) antes de emitir.`,
    );
  }

  const correlativo = fila.lastNumber + 1;
  await tx.documentSerie.update({
    where: { type_serie: { type, serie: fila.serie } },
    data: { lastNumber: correlativo },
  });

  return { serie: fila.serie, correlativo, fullNumber: formatCorrelativo(fila.serie, correlativo) };
}

/** La serie activa de cada tipo, para mostrarla antes de que exista el documento. */
export async function seriesActivas(
  db: Prisma.TransactionClient,
): Promise<Record<string, string>> {
  const filas = await db.documentSerie.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { type: true, serie: true },
  });

  const porTipo: Record<string, string> = {};
  for (const f of filas) if (!porTipo[f.type]) porTipo[f.type] = f.serie;
  return porTipo;
}
