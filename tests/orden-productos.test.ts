import { describe, it, expect } from "vitest";
import {
  valorSku, compararProductos, comparadorDe, siguienteSku,
  type ClaveDeOrden, type ClaveDeOrdenCompleta, type CampoOrden,
} from "@/lib/orden-productos";

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

describe("comparadorDe", () => {
  const q = (o: Partial<ClaveDeOrdenCompleta> & { sku: string }): ClaveDeOrdenCompleta => ({
    name: "x", brand: null, categoria: null, price: 0, storePrice: null,
    stockTienda: 0, stockAlmacen: 0, trackInventory: true, ...o,
  });
  const skus = (items: ClaveDeOrdenCompleta[], campo: CampoOrden, dir: "asc" | "desc") =>
    [...items].sort(comparadorDe(campo, dir)).map((i) => i.sku);

  it("ordena por nombre en los dos sentidos, sin distinguir mayúsculas ni tildes", () => {
    const items = [q({ sku: "1", name: "óptica" }), q({ sku: "2", name: "Armazón" }), q({ sku: "3", name: "lente" })];
    expect(skus(items, "nombre", "asc")).toEqual(["2", "3", "1"]);
    expect(skus(items, "nombre", "desc")).toEqual(["1", "3", "2"]);
  });

  it("ordena el SKU como número también en ascendente", () => {
    const items = [q({ sku: "697" }), q({ sku: "97" }), q({ sku: "0045" })];
    expect(skus(items, "sku", "asc")).toEqual(["0045", "97", "697"]);
  });

  it("manda lo vacío al final en las dos direcciones", () => {
    const items = [q({ sku: "1", storePrice: 50 }), q({ sku: "2", storePrice: null }), q({ sku: "3", storePrice: 20 })];
    expect(skus(items, "precioTienda", "asc")).toEqual(["3", "1", "2"]);
    expect(skus(items, "precioTienda", "desc")).toEqual(["1", "3", "2"]);
  });

  it("no ordena por stock lo que no lleva inventario", () => {
    const items = [q({ sku: "1", stockTienda: 3 }), q({ sku: "2", stockTienda: 0, trackInventory: false }), q({ sku: "3", stockTienda: 0 })];
    expect(skus(items, "stockTienda", "asc")).toEqual(["3", "1", "2"]);
  });

  it("desempata con el orden por defecto", () => {
    const items = [q({ sku: "10", brand: "Ray-Ban" }), q({ sku: "30", brand: "Ray-Ban" }), q({ sku: "20", brand: "Oakley" })];
    expect(skus(items, "marca", "asc")).toEqual(["20", "30", "10"]);
  });
});
