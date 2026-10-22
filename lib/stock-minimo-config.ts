import { prisma } from "@/lib/prisma";
import { STOCK_MINIMO_POR_DEFECTO } from "@/lib/stock-minimo";

/**
 * El umbral general de «stock bajo». Sin fila en `PosConfig` (nadie lo cambió
 * todavía) rige el valor por defecto, el mismo 5 que estaba fijo en el código.
 */
export async function leerStockMinimoGeneral(): Promise<number> {
  const config = await prisma.posConfig.findUnique({
    where: { id: "main" },
    select: { stockMinimo: true },
  });
  return config?.stockMinimo ?? STOCK_MINIMO_POR_DEFECTO;
}
