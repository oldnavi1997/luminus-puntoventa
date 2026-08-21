import { describe, expect, it } from "vitest";
import { DIAS_PLAZO_BAJA, plazoDeBaja } from "@/lib/sunat/plazos";

/** Instante en hora de Lima, que es como razona el negocio. */
const lima = (s: string) => new Date(`${s}-05:00`);

describe("plazo de baja", () => {
  it("el mismo día quedan los 7 completos", () => {
    const p = plazoDeBaja(lima("2026-08-21T10:00:00"), lima("2026-08-21T18:00:00"));
    expect(p.vencido).toBe(false);
    expect(p.diasRestantes).toBe(DIAS_PLAZO_BAJA);
  });

  it("el séptimo día todavía vale", () => {
    const p = plazoDeBaja(lima("2026-08-21T10:00:00"), lima("2026-08-28T23:00:00"));
    expect(p.vencido).toBe(false);
    expect(p.diasRestantes).toBe(0);
  });

  it("el octavo ya venció", () => {
    const p = plazoDeBaja(lima("2026-08-21T10:00:00"), lima("2026-08-29T00:30:00"));
    expect(p.vencido).toBe(true);
    expect(p.diasRestantes).toBe(-1);
  });

  it("una boleta de las 21:00 de Lima es de ESE día peruano, no del siguiente", () => {
    // 21:00 en Lima son las 02:00 UTC del día siguiente. Contando en UTC, o
    // restando milisegundos, el plazo saldría corrido un día.
    const emitida = lima("2026-08-21T21:00:00");
    expect(emitida.toISOString().slice(0, 10)).toBe("2026-08-22");

    const p = plazoDeBaja(emitida, lima("2026-08-21T22:00:00"));
    expect(p.diasRestantes).toBe(DIAS_PLAZO_BAJA);
  });

  it("cruza el fin de mes sin perder la cuenta", () => {
    const p = plazoDeBaja(lima("2026-08-28T09:00:00"), lima("2026-09-04T09:00:00"));
    expect(p.vencido).toBe(false);
    expect(p.diasRestantes).toBe(0);
  });

  it("informa del último día válido", () => {
    const p = plazoDeBaja(lima("2026-08-21T10:00:00"), lima("2026-08-22T10:00:00"));
    expect(p.limite.toISOString().slice(0, 10)).toBe("2026-08-28");
  });
});
