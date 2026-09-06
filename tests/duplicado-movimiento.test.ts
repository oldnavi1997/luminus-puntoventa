import { describe, it, expect } from "vitest";
import {
  movimientoGemeloReciente,
  haceSegundos,
  VENTANA_DUPLICADO_MS,
} from "@/lib/stock-movimiento";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Un `tx` de mentira que solo anota el `where` con el que se lo llamó: lo que
 * importa acá es por qué campos se reconoce un reintento, no el viaje a la base.
 */
function txEspia(devuelve: unknown = null) {
  const llamadas: Prisma.StockMovimientoFindFirstArgs[] = [];
  const tx = {
    stockMovimiento: {
      findFirst: async (args: Prisma.StockMovimientoFindFirstArgs) => {
        llamadas.push(args);
        return devuelve;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, llamadas };
}

const mov = { productId: "p1", tipo: "INGRESO" as const, cantidad: 5, userId: "u1" };

describe("movimientoGemeloReciente", () => {
  it("busca por producto, tipo, cantidad y usuario a la vez", async () => {
    const { tx, llamadas } = txEspia();
    await movimientoGemeloReciente(tx, mov);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].where).toMatchObject({
      productId: "p1",
      tipo: "INGRESO",
      cantidad: 5,
      userId: "u1",
    });
  });

  it("solo mira hacia atrás dentro de la ventana", async () => {
    const ahora = new Date("2026-03-01T12:00:00.000Z");
    const { tx, llamadas } = txEspia();
    await movimientoGemeloReciente(tx, mov, ahora);

    const desde = (llamadas[0].where?.createdAt as { gte: Date }).gte;
    expect(ahora.getTime() - desde.getTime()).toBe(VENTANA_DUPLICADO_MS);
  });

  it("se queda con el más reciente cuando hay varios", async () => {
    const { tx, llamadas } = txEspia();
    await movimientoGemeloReciente(tx, mov);
    expect(llamadas[0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("devuelve null cuando no hay ninguno igual", async () => {
    const { tx } = txEspia(null);
    expect(await movimientoGemeloReciente(tx, mov)).toBeNull();
  });

  it("devuelve el movimiento cuando lo hay", async () => {
    const gemelo = { id: "m1", createdAt: new Date() };
    const { tx } = txEspia(gemelo);
    expect(await movimientoGemeloReciente(tx, mov)).toBe(gemelo);
  });
});

describe("haceSegundos", () => {
  it("redondea al segundo", () => {
    const ahora = new Date("2026-03-01T12:00:10.400Z");
    expect(haceSegundos(new Date("2026-03-01T12:00:00.000Z"), ahora)).toBe(10);
  });

  it("nunca es negativo si los relojes no coinciden", () => {
    const ahora = new Date("2026-03-01T12:00:00.000Z");
    expect(haceSegundos(new Date("2026-03-01T12:00:05.000Z"), ahora)).toBe(0);
  });
});
