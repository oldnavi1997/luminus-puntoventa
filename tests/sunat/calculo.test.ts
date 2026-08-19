import { describe, expect, it } from "vitest";
import { calcularComprobante, ErrorCalculo, redondear2 } from "@/lib/sunat/calculo";

/**
 * La invariante que sostiene todo el módulo: lo declarado a SUNAT tiene que
 * sumar exactamente lo que el POS le cobró al cliente. Si esto se rompe, el
 * comprobante o se rechaza o declara un importe distinto al cobrado.
 */
function verificarCuadre(calculo: ReturnType<typeof calcularComprobante>, totalEsperado: number) {
  // Cada línea cuadra consigo misma.
  for (const l of calculo.lineas) {
    expect(redondear2(l.valorVenta + l.igv)).toBe(l.importeConIgv);
  }
  // Las líneas suman los totales del documento.
  const sumaValor = redondear2(calculo.lineas.reduce((s, l) => s + l.valorVenta, 0));
  const sumaIgv = redondear2(calculo.lineas.reduce((s, l) => s + l.igv, 0));
  expect(sumaValor).toBe(calculo.totalValorVenta);
  expect(sumaIgv).toBe(calculo.totalIgv);
  // Y el documento cuadra con lo cobrado.
  expect(calculo.totalPagar).toBe(totalEsperado);
  expect(redondear2(calculo.totalValorVenta + calculo.totalIgv)).toBe(totalEsperado);
}

describe("boleta simple", () => {
  it("descompone un ítem con IGV incluido", () => {
    const c = calcularComprobante([
      { descripcion: "Montura Ray-Ban RB5154", cantidad: 1, importeConIgv: 590 },
    ]);

    expect(c.lineas).toHaveLength(1);
    expect(c.totalValorVenta).toBe(500);
    expect(c.totalIgv).toBe(90);
    verificarCuadre(c, 590);
  });
});

describe("factura con varios productos", () => {
  it("mantiene el cuadre con importes que no dividen exacto", () => {
    const c = calcularComprobante([
      { descripcion: "Montura", cantidad: 1, importeConIgv: 333.33 },
      { descripcion: "Luna progresiva", cantidad: 2, importeConIgv: 199.99 },
      { descripcion: "Estuche", cantidad: 3, importeConIgv: 45.5 },
    ]);

    expect(c.lineas).toHaveLength(3);
    verificarCuadre(c, redondear2(333.33 + 199.99 + 45.5));
  });

  it("reparte el valor unitario entre la cantidad", () => {
    const c = calcularComprobante([{ descripcion: "Luna", cantidad: 4, importeConIgv: 236 }]);
    const linea = c.lineas[0];

    expect(linea.valorVenta).toBe(200);
    expect(linea.valorUnitario).toBeCloseTo(50, 10);
    expect(linea.precioUnitario).toBeCloseTo(59, 10);
  });
});

describe("venta con descuento", () => {
  it("prorratea el descuento sin perder céntimos", () => {
    const items = [
      { descripcion: "A", cantidad: 1, importeConIgv: 100 },
      { descripcion: "B", cantidad: 1, importeConIgv: 200 },
      { descripcion: "C", cantidad: 1, importeConIgv: 33.33 },
    ];
    // 10% de descuento sobre 333.33 → 300.00
    const c = calcularComprobante(items, 300);

    expect(c.descuentoAplicado).toBe(33.33);
    verificarCuadre(c, 300);
  });

  it("absorbe el residuo del prorrateo en la última línea", () => {
    // Tres líneas iguales con un total que no es divisible entre tres.
    const items = [
      { descripcion: "A", cantidad: 1, importeConIgv: 10 },
      { descripcion: "B", cantidad: 1, importeConIgv: 10 },
      { descripcion: "C", cantidad: 1, importeConIgv: 10 },
    ];
    const c = calcularComprobante(items, 10.01);
    verificarCuadre(c, 10.01);
  });
});

describe("casos que deben fallar antes de llegar a SUNAT", () => {
  it("rechaza un comprobante sin líneas", () => {
    expect(() => calcularComprobante([])).toThrow(ErrorCalculo);
  });

  it("rechaza cantidad cero", () => {
    expect(() =>
      calcularComprobante([{ descripcion: "X", cantidad: 0, importeConIgv: 100 }]),
    ).toThrow(/cantidad/);
  });

  it("rechaza importe negativo", () => {
    expect(() =>
      calcularComprobante([{ descripcion: "X", cantidad: 1, importeConIgv: -5 }]),
    ).toThrow(/negativo/);
  });

  it("rechaza total cero", () => {
    expect(() =>
      calcularComprobante([{ descripcion: "X", cantidad: 1, importeConIgv: 100 }], 0),
    ).toThrow(/mayor que cero/);
  });
});

describe("estabilidad ante muchos ítems", () => {
  it("cuadra con 50 líneas de importes irregulares", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      descripcion: `Ítem ${i + 1}`,
      cantidad: (i % 4) + 1,
      importeConIgv: redondear2(17.77 + i * 3.31),
    }));
    const bruto = redondear2(items.reduce((s, l) => s + l.importeConIgv, 0));

    verificarCuadre(calcularComprobante(items), bruto);
    // Y con un descuento del 7% encima.
    const conDescuento = redondear2(bruto * 0.93);
    verificarCuadre(calcularComprobante(items, conDescuento), conDescuento);
  });
});
