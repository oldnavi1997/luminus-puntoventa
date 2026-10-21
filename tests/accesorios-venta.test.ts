import { describe, expect, it } from "vitest";
import { accesoriosDeVenta, type ItemConMarcas } from "@/lib/accesorios-venta";

function item(quantity: number, product: Partial<ItemConMarcas["product"]> = {}): ItemConMarcas {
  return {
    quantity,
    product: { incluyeEstuche: false, incluyeLiquido: false, accesorioVenta: null, ...product },
  };
}

const montura = { incluyeEstuche: true };
const lunaConLiquido = { incluyeLiquido: true };

describe("accesorios que acompañan a una venta", () => {
  it("una montura sola lleva su estuche", () => {
    expect(accesoriosDeVenta([item(1, montura)])).toEqual({ ESTUCHE: 1, LIQUIDO: 0 });
  });

  it("montura con lunas: un estuche, el de la montura, y el líquido de la luna", () => {
    expect(accesoriosDeVenta([item(1, montura), item(1, lunaConLiquido)])).toEqual({ ESTUCHE: 1, LIQUIDO: 1 });
  });

  it("lunas solas (el cliente trae su montura) no llevan estuche", () => {
    expect(accesoriosDeVenta([item(1, lunaConLiquido)])).toEqual({ ESTUCHE: 0, LIQUIDO: 1 });
  });

  it("una luna sin marcar no descuenta nada", () => {
    expect(accesoriosDeVenta([item(1)])).toEqual({ ESTUCHE: 0, LIQUIDO: 0 });
  });

  it("cuenta por unidad", () => {
    expect(accesoriosDeVenta([item(3, montura)])).toEqual({ ESTUCHE: 3, LIQUIDO: 0 });
  });

  it("un accesorio vendido suelto no arrastra otro, aunque esté marcado", () => {
    const estucheSuelto = item(1, { accesorioVenta: "ESTUCHE", incluyeEstuche: true, incluyeLiquido: true });
    expect(accesoriosDeVenta([estucheSuelto])).toEqual({ ESTUCHE: 0, LIQUIDO: 0 });
  });
});
