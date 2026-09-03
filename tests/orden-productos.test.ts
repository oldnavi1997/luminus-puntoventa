import { describe, it, expect } from "vitest";
import { valorSku, compararProductos, siguienteSku, type ClaveDeOrden } from "@/lib/orden-productos";

const p = (sku: string | null, name = "x"): ClaveDeOrden => ({ sku, name });

function ordenar(items: ClaveDeOrden[]) {
  return [...items].sort(compararProductos).map((i) => i.sku ?? `∅ ${i.name}`);
}

describe("valorSku", () => {
  it("ignora los ceros a la izquierda", () => {
    expect(valorSku("0697")).toBe(697);
    expect(valorSku("697")).toBe(697);
  });

  it("devuelve null para lo que no es un número", () => {
    expect(valorSku(null)).toBeNull();
    expect(valorSku("")).toBeNull();
    expect(valorSku("   ")).toBeNull();
    expect(valorSku("AB-12")).toBeNull();
  });
});

describe("compararProductos", () => {
  it("compara el SKU como número, no como texto", () => {
    // Ordenados como texto, "97" quedaría por encima de "697".
    expect(ordenar([p("45"), p("697"), p("97"), p("614")])).toEqual([
      "697", "614", "97", "45",
    ]);
  });

  it("trata '0697' y '697' como el mismo número", () => {
    expect(ordenar([p("614"), p("0697")])).toEqual(["0697", "614"]);
  });

  it("manda al final lo que no tiene SKU usable", () => {
    expect(ordenar([p(null, "sin sku"), p("45"), p("AB", "raro")])).toEqual([
      "45", "AB", "∅ sin sku",
    ]);
  });

  it("desempata por nombre para que la paginación sea estable", () => {
    const mismos = [p("100", "Zeta"), p("100", "Alfa"), p("100", "Medio")];
    expect([...mismos].sort(compararProductos).map((i) => i.name)).toEqual([
      "Alfa", "Medio", "Zeta",
    ]);
  });
});

describe("siguienteSku", () => {
  it("propone el siguiente al numero mas alto, no al ultimo de la lista", () => {
    expect(siguienteSku(["45", "727", "97", "614"])).toBe("728");
  });

  it("ignora los ceros a la izquierda y lo que no es numero", () => {
    expect(siguienteSku(["0697", "AB-12", null, ""])).toBe("698");
  });

  it("arranca en 1 con el catalogo vacio", () => {
    expect(siguienteSku([])).toBe("1");
    expect(siguienteSku([null, "sin-numero"])).toBe("1");
  });
});
