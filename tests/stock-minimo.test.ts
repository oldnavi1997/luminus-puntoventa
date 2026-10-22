import { describe, it, expect } from "vitest";
import { esStockBajo, parsearStockMinimo, umbralDe } from "@/lib/stock-minimo";

describe("esStockBajo", () => {
  it("usa el general cuando el producto no tiene mínimo propio", () => {
    expect(esStockBajo({ stock: 5, stockMinimo: null }, 5)).toBe(true);
    expect(esStockBajo({ stock: 6, stockMinimo: null }, 5)).toBe(false);
  });

  it("el mínimo del producto reemplaza al general, hacia arriba y hacia abajo", () => {
    expect(esStockBajo({ stock: 8, stockMinimo: 10 }, 5)).toBe(true);
    expect(esStockBajo({ stock: 3, stockMinimo: 2 }, 5)).toBe(false);
  });

  it("lo agotado no es stock bajo", () => {
    expect(esStockBajo({ stock: 0, stockMinimo: null }, 5)).toBe(false);
  });

  it("un mínimo propio de 0 apaga el aviso para ese producto", () => {
    expect(umbralDe({ stockMinimo: 0 }, 5)).toBe(0);
    expect(esStockBajo({ stock: 1, stockMinimo: 0 }, 5)).toBe(false);
  });
});

describe("parsearStockMinimo", () => {
  it("acepta enteros desde 0, como número o texto", () => {
    expect(parsearStockMinimo(3)).toBe(3);
    expect(parsearStockMinimo(" 12 ")).toBe(12);
    expect(parsearStockMinimo("0")).toBe(0);
  });

  it("vacío o null vuelve al general", () => {
    expect(parsearStockMinimo("")).toBeNull();
    expect(parsearStockMinimo(null)).toBeNull();
  });

  it("rechaza lo que no es un entero válido", () => {
    expect(parsearStockMinimo("-1")).toBeUndefined();
    expect(parsearStockMinimo("2.5")).toBeUndefined();
    expect(parsearStockMinimo("abc")).toBeUndefined();
    expect(parsearStockMinimo(100000)).toBeUndefined();
  });
});
