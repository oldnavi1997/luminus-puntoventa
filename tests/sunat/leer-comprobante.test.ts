import { describe, expect, it } from "vitest";
import { calcularComprobante } from "@/lib/sunat/calculo";
import { construirComprobante } from "@/lib/sunat/ubl/comprobante";
import { importesDelXml, ErrorLecturaComprobante } from "@/lib/sunat/ubl/leer-comprobante";
import { configDePrueba } from "./fixtures";

function boleta(lineas: Parameters<typeof calcularComprobante>[0], total?: number) {
  return construirComprobante({
    tipo: "BOLETA",
    serie: "B001",
    correlativo: 53,
    emitidoEn: new Date("2026-08-21T14:00:00-05:00"),
    adquirente: { docType: "DNI", docNumber: "45678912", name: "CLIENTE DE PRUEBA" },
    calculo: calcularComprobante(lineas, total),
    config: configDePrueba(),
  });
}

describe("importesDelXml", () => {
  it("devuelve los mismos importes que el comprobante declaró", () => {
    const lineas = [
      { descripcion: "Montura", cantidad: 1, importeConIgv: 590 },
      { descripcion: "Lunas", cantidad: 2, importeConIgv: 472 },
    ];
    const calculo = calcularComprobante(lineas);
    const importes = importesDelXml(boleta(lineas));

    expect(importes.total).toBeCloseTo(calculo.totalPrecioVenta, 2);
    expect(importes.gravado).toBeCloseTo(calculo.totalValorVenta, 2);
    expect(importes.igv).toBeCloseTo(calculo.totalIgv, 2);
  });

  it("cuadra al céntimo: gravado + igv === total", () => {
    const importes = importesDelXml(
      boleta([{ descripcion: "Montura", cantidad: 1, importeConIgv: 590 }]),
    );
    expect(importes.gravado + importes.igv).toBeCloseTo(importes.total, 2);
  });

  it("lee el IGV de la raíz y no el de una línea", () => {
    // Con varias líneas, el TaxAmount de cualquiera de ellas es menor que el
    // total: si se leyera el de una línea, esto fallaría.
    const lineas = [
      { descripcion: "Montura", cantidad: 1, importeConIgv: 590 },
      { descripcion: "Lunas", cantidad: 1, importeConIgv: 236 },
      { descripcion: "Estuche", cantidad: 3, importeConIgv: 30 },
    ];
    const importes = importesDelXml(boleta(lineas));
    expect(importes.igv).toBeCloseTo(calcularComprobante(lineas).totalIgv, 2);
    expect(importes.gravado + importes.igv).toBeCloseTo(importes.total, 2);
  });

  it("sobrevive al descuento global prorrateado, donde recalcular divergiría", () => {
    // El total cobrado es menor que la suma de las líneas: el prorrateo lo
    // reparte. Es justo el caso en que recalcular desde las columnas de la
    // venta no reproduciría lo que se declaró.
    const lineas = [
      { descripcion: "Montura", cantidad: 1, importeConIgv: 590 },
      { descripcion: "Lunas", cantidad: 2, importeConIgv: 472 },
    ];
    const importes = importesDelXml(boleta(lineas, 1000));

    expect(importes.total).toBeCloseTo(1000, 2);
    expect(importes.gravado + importes.igv).toBeCloseTo(1000, 2);
  });

  it("se queja en vez de devolver ceros cuando el XML no sirve", () => {
    expect(() => importesDelXml("<Invoice></Invoice>")).toThrow(ErrorLecturaComprobante);
  });
});
