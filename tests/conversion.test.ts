import { describe, it, expect } from "vitest";
import {
  marcaDeConversion,
  naceDeConversion,
  origenDeConversion,
  prefijoDeConversion,
} from "@/lib/conversion";

/**
 * La marca es lo único que ata un comprobante a la nota de venta de la que
 * salió. De ella dependen dos cosas que cuestan dinero si fallan: que una venta
 * no se declare dos veces ante SUNAT, y que borrar el comprobante no devuelva
 * stock que nunca salió ni descuadre la caja.
 */
describe("marca de conversión", () => {
  it("va y vuelve", () => {
    const notes = marcaDeConversion("NV001-00000251");
    expect(origenDeConversion(notes)).toBe("NV001-00000251");
    expect(naceDeConversion(notes)).toBe(true);
  });

  it("conserva la nota que ya tenía la venta", () => {
    const notes = marcaDeConversion("NV001-00000251", "Cliente pidió factura después");
    expect(origenDeConversion(notes)).toBe("NV001-00000251");
    expect(notes).toContain("Cliente pidió factura después");
  });

  it("no se confunde con una nota escrita a mano que empieza igual", () => {
    // Sin exigir la forma de un fullNumber, esto bloquearía la conversión de una
    // venta que nunca se convirtió.
    expect(origenDeConversion("Convertido de una cotización antigua")).toBeNull();
    expect(naceDeConversion("Convertido de una cotización antigua")).toBe(false);
  });

  it("ignora lo que no es una marca", () => {
    for (const notes of [null, undefined, "", "Entrega el viernes"]) {
      expect(naceDeConversion(notes)).toBe(false);
      expect(origenDeConversion(notes)).toBeNull();
    }
  });

  // Los fullNumber van rellenos a 8 dígitos, así que ninguno es prefijo de otro
  // y el `startsWith` con que se buscan las conversiones no cruza ventas.
  it("no cruza correlativos de ancho fijo", () => {
    const notes = marcaDeConversion("NV001-00000251");
    expect(notes.startsWith(prefijoDeConversion("NV001-00000025"))).toBe(false);
    expect(notes.startsWith(prefijoDeConversion("NV001-00000251"))).toBe(true);
  });
});
