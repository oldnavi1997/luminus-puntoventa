import { describe, expect, it } from "vitest";
import { numeroALetras } from "@/lib/numero-letras";

describe("monto en letras", () => {
  it.each([
    [0, "CERO Y 00/100 SOLES"],
    [1, "UNO Y 00/100 SOLES"],
    [15, "QUINCE Y 00/100 SOLES"],
    [21, "VEINTIUNO Y 00/100 SOLES"],
    [30, "TREINTA Y 00/100 SOLES"],
    [31, "TREINTA Y UNO Y 00/100 SOLES"],
    [100, "CIEN Y 00/100 SOLES"],
    [101, "CIENTO UNO Y 00/100 SOLES"],
    [590, "QUINIENTOS NOVENTA Y 00/100 SOLES"],
    [999, "NOVECIENTOS NOVENTA Y NUEVE Y 00/100 SOLES"],
    [1000, "MIL Y 00/100 SOLES"],
    [1354.99, "MIL TRESCIENTOS CINCUENTA Y CUATRO Y 99/100 SOLES"],
    [21000, "VEINTIÚN MIL Y 00/100 SOLES"],
    [1_000_000, "UN MILLÓN Y 00/100 SOLES"],
    [2_500_000.5, "DOS MILLONES QUINIENTOS MIL Y 50/100 SOLES"],
  ])("%s → %s", (monto, esperado) => {
    expect(numeroALetras(monto)).toBe(esperado);
  });

  it("redondea a dos decimales antes de convertir", () => {
    expect(numeroALetras(10.999)).toBe("ONCE Y 00/100 SOLES");
    expect(numeroALetras(10.994)).toBe("DIEZ Y 99/100 SOLES");
  });

  it("acepta otra moneda", () => {
    expect(numeroALetras(5, "DÓLARES AMERICANOS")).toBe("CINCO Y 00/100 DÓLARES AMERICANOS");
  });
});
