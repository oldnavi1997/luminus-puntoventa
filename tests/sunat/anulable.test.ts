import { describe, expect, it } from "vitest";
import { ErrorAnulacion, validarAnulable } from "@/lib/sunat/anular";

const AHORA = new Date("2026-08-25T10:00:00-05:00");
const EMITIDO = new Date("2026-08-21T14:00:00-05:00");

/** Lo mínimo que mira `validarAnulable`; el resto del SaleDocument no le importa. */
function documento(overrides: Record<string, unknown> = {}) {
  return {
    fullNumber: "B001-00000053",
    type: "BOLETA",
    status: "ACCEPTED",
    createdAt: EMITIDO,
    sunatEnvios: [{ tipoEnvio: "INDIVIDUAL", estado: "ACEPTADO" }],
    ...overrides,
  } as unknown as Parameters<typeof validarAnulable>[0];
}

const anular = (doc: unknown, motivo = "VENTA ANULADA POR EL CLIENTE") =>
  validarAnulable(doc as Parameters<typeof validarAnulable>[0], motivo, AHORA);

describe("qué se puede anular", () => {
  it("deja pasar una boleta aceptada y dentro de plazo", () => {
    expect(() => anular(documento())).not.toThrow();
  });

  it("acepta también un comprobante aceptado CON observaciones", () => {
    // El backend siempre lo admitió; era el botón el que lo dejaba fuera.
    expect(() =>
      anular(
        documento({
          status: "ACCEPTED_WITH_OBSERVATIONS",
          sunatEnvios: [{ tipoEnvio: "INDIVIDUAL", estado: "ACEPTADO_CON_OBSERVACIONES" }],
        }),
      ),
    ).not.toThrow();
  });

  it("rechaza una nota de venta y explica por dónde va", () => {
    expect(() => anular(documento({ type: "NOTA_VENTA" }))).toThrow(/elimínala desde Ventas/);
  });

  it("no anula dos veces", () => {
    expect(() => anular(documento({ status: "VOIDED" }))).toThrow(/ya está anulado/);
  });

  it("no pisa una baja que está en curso", () => {
    // Sin esto, un doble clic pediría dos bajas del mismo comprobante.
    expect(() => anular(documento({ status: "VOID_PENDING" }))).toThrow(/baja en curso/);
  });

  it("no anula lo que SUNAT nunca aceptó", () => {
    expect(() => anular(documento({ status: "REJECTED" }))).toThrow(/sólo puede dar de baja/);
    expect(() => anular(documento({ status: "SEND_ERROR" }))).toThrow(/sólo puede dar de baja/);
  });

  it("exige constancia de que el comprobante salió de este POS", () => {
    expect(() => anular(documento({ sunatEnvios: [] }))).toThrow(/No hay constancia/);
  });

  it("no cuenta como emisión un envío de baja anterior", () => {
    expect(() =>
      anular(documento({ sunatEnvios: [{ tipoEnvio: "COMUNICACION_BAJA", estado: "ACEPTADO" }] })),
    ).toThrow(/No hay constancia/);
  });
});

describe("plazo", () => {
  it("el séptimo día todavía deja anular", () => {
    const septimo = new Date("2026-08-28T23:00:00-05:00");
    expect(() =>
      validarAnulable(documento(), "MOTIVO SUFICIENTE", septimo),
    ).not.toThrow();
  });

  it("vencido manda a la nota de crédito, que es lo que toca de verdad", () => {
    const octavo = new Date("2026-08-29T09:00:00-05:00");
    expect(() => validarAnulable(documento(), "MOTIVO SUFICIENTE", octavo)).toThrow(
      /nota de crédito/,
    );
  });

  it("el error de plazo es un 422", () => {
    const octavo = new Date("2026-08-29T09:00:00-05:00");
    try {
      validarAnulable(documento(), "MOTIVO SUFICIENTE", octavo);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAnulacion);
      expect((e as ErrorAnulacion).status).toBe(422);
    }
  });
});

describe("motivo", () => {
  it("pide al menos cinco caracteres", () => {
    expect(() => anular(documento(), "malo")).toThrow(/al menos 5/);
  });

  it("avisa en vez de truncar en silencio cuando pasa del tope", () => {
    // Truncar aquí dejaría en la base un motivo distinto del que se declaró.
    expect(() => anular(documento(), "M".repeat(101))).toThrow(/no puede pasar de 100/);
  });

  it("no cuenta los espacios de los extremos", () => {
    expect(() => anular(documento(), "   ok   ")).toThrow(/al menos 5/);
  });
});
