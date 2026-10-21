import { describe, expect, it } from "vitest";
import {
  documentoConElMovimiento,
  revertirStockYCaja,
  type VentaAReverir,
} from "@/lib/reversion-venta";
import { marcaDeConversion } from "@/lib/conversion";

type Llamada = { modelo: string; args: Record<string, unknown> };

type MovFalso = { productId: string; tipo: string; cantidad: number };

/** Un `tx` que no toca nada y apunta lo que le piden. */
function txFalso(origen: { id: string } | null = null, movimientos: MovFalso[] = []) {
  const llamadas: Llamada[] = [];
  const tx = {
    product: {
      update: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: "product", args });
        return { stockTienda: 0, stockAlmacen: 0 };
      },
    },
    stockMovimiento: {
      findMany: async () => movimientos,
      create: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: "stockMovimiento", args });
        return {};
      },
    },
    posSession: {
      update: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: "posSession", args });
        return {};
      },
    },
    saleDocument: {
      findFirst: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: "saleDocument.findFirst", args });
        return origen;
      },
    },
  };
  return { tx: tx as unknown as Parameters<typeof revertirStockYCaja>[0], llamadas };
}

function venta(overrides: Partial<VentaAReverir> = {}): VentaAReverir {
  return {
    id: "doc-1",
    fullNumber: "NV001-00000300",
    cashierId: "cajero-1",
    channel: "POS",
    location: "TIENDA",
    posSessionId: "sesion-1",
    paymentMethod: "EFECTIVO",
    total: 590,
    montoAdelanto: null,
    montoEfectivo: null,
    montoTarjeta: null,
    montoYape: null,
    items: [{ productId: "prod-1", quantity: 2, product: { trackInventory: true } }],
    ...overrides,
  };
}

const datos = (l: Llamada) => l.args.data as Record<string, Record<string, number>>;

describe("devolución del stock", () => {
  it("una venta de tienda repone tienda y el total", async () => {
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(tx, venta());

    const p = llamadas.find((l) => l.modelo === "product")!;
    expect(datos(p).stockTienda).toEqual({ increment: 2 });
    expect(datos(p).stock).toEqual({ increment: 2 });
    expect(datos(p).stockAlmacen).toBeUndefined();
  });

  it("una venta de almacén repone almacén, no tienda", async () => {
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(tx, venta({ location: "ALMACEN" }));

    const p = llamadas.find((l) => l.modelo === "product")!;
    expect(datos(p).stockAlmacen).toEqual({ increment: 2 });
    expect(datos(p).stockTienda).toBeUndefined();
  });

  it("salta los productos que no llevan inventario", async () => {
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(
      tx,
      venta({ items: [{ productId: "servicio", quantity: 1, product: { trackInventory: false } }] }),
    );

    expect(llamadas.filter((l) => l.modelo === "product")).toHaveLength(0);
  });

  it("no toca el stock de una venta web y dice por qué", async () => {
    // Sólo el ecommerce sabe de qué ubicación salió cada unidad.
    const { tx, llamadas } = txFalso();
    const r = await revertirStockYCaja(tx, venta({ channel: "WEB" }));

    expect(llamadas.filter((l) => l.modelo === "product")).toHaveLength(0);
    expect(r.stock).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/ecommerce/);
  });
});

describe("devolución de los accesorios", () => {
  const estuche: MovFalso = { productId: "estuche", tipo: "ACCESORIO_POS", cantidad: 2 };

  it("devuelve lo que salió con la venta, a la misma ubicación", async () => {
    const { tx, llamadas } = txFalso(null, [estuche]);
    const r = await revertirStockYCaja(tx, venta({ location: "ALMACEN" }), "admin-1");

    const p = llamadas.filter((l) => l.modelo === "product").find((l) => l.args.where && (l.args.where as { id: string }).id === "estuche")!;
    expect(datos(p).stockAlmacen).toEqual({ increment: 2 });
    const mov = llamadas.find((l) => l.modelo === "stockMovimiento")!.args.data as Record<string, unknown>;
    expect(mov.tipo).toBe("ANULACION_ACCESORIO_POS");
    expect(mov.userId).toBe("admin-1");
    expect(r.accesorios).toEqual(["estuche"]);
  });

  it("sin usuario, el reingreso queda a nombre de quien cobró", async () => {
    const { tx, llamadas } = txFalso(null, [estuche]);
    await revertirStockYCaja(tx, venta());

    const mov = llamadas.find((l) => l.modelo === "stockMovimiento")!.args.data as Record<string, unknown>;
    expect(mov.userId).toBe("cajero-1");
  });

  it("no devuelve dos veces", async () => {
    const { tx, llamadas } = txFalso(null, [
      estuche,
      { productId: "estuche", tipo: "ANULACION_ACCESORIO_POS", cantidad: 2 },
    ]);
    const r = await revertirStockYCaja(tx, venta());

    expect(llamadas.filter((l) => l.modelo === "stockMovimiento")).toHaveLength(0);
    expect(r.accesorios).toEqual([]);
  });

  it("una venta web no devuelve accesorios", async () => {
    const { tx, llamadas } = txFalso(null, [estuche]);
    await revertirStockYCaja(tx, venta({ channel: "WEB" }));

    expect(llamadas.filter((l) => l.modelo === "stockMovimiento")).toHaveLength(0);
  });
});

describe("descuento de la caja", () => {
  it("descuenta el total y una venta del contador", async () => {
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(tx, venta());

    const s = datos(llamadas.find((l) => l.modelo === "posSession")!);
    expect(s.totalVentas).toEqual({ decrement: 590 });
    expect(s.countVentas).toEqual({ decrement: 1 });
    expect(s.totalEfectivo).toEqual({ decrement: 590 });
  });

  it("un pago mixto descuenta cada método por su parte", async () => {
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(
      tx,
      venta({ paymentMethod: "MIXTO", montoEfectivo: 200, montoTarjeta: 390, montoYape: 0 }),
    );

    const s = datos(llamadas.find((l) => l.modelo === "posSession")!);
    expect(s.totalEfectivo).toEqual({ decrement: 200 });
    expect(s.totalTarjeta).toEqual({ decrement: 390 });
    expect(s.totalYape).toBeUndefined();
  });

  it("en una venta con adelanto descuenta el adelanto, no el total", async () => {
    // A la sesión sólo se le sumó el adelanto; restarle el total la descuadraría.
    const { tx, llamadas } = txFalso();
    await revertirStockYCaja(tx, venta({ montoAdelanto: 100 }));

    const s = datos(llamadas.find((l) => l.modelo === "posSession")!);
    expect(s.totalVentas).toEqual({ decrement: 100 });
    expect(s.totalEfectivo).toEqual({ decrement: 100 });
  });

  it("sin sesión vinculada no hay caja que tocar", async () => {
    const { tx, llamadas } = txFalso();
    const r = await revertirStockYCaja(tx, venta({ posSessionId: null }));

    expect(llamadas.filter((l) => l.modelo === "posSession")).toHaveLength(0);
    expect(r.caja).toBe(false);
    expect(r.stock).toBe(true);
  });
});

describe("dónde vive el movimiento", () => {
  it("una venta directa se revierte contra sí misma", async () => {
    const { tx } = txFalso();
    const r = await documentoConElMovimiento(tx, { id: "doc-1", notes: "una nota cualquiera" });

    expect(r).toEqual({ id: "doc-1", esOrigen: false });
  });

  it("un comprobante convertido se revierte contra la nota de origen", async () => {
    // El movimiento lo hizo la nota; revertir contra el comprobante no
    // devolvería nada, porque la conversión nunca descontó.
    const { tx, llamadas } = txFalso({ id: "nota-1" });
    const r = await documentoConElMovimiento(tx, {
      id: "doc-1",
      notes: marcaDeConversion("NV001-00000251", null),
    });

    expect(r).toEqual({ id: "nota-1", esOrigen: true });
    const busqueda = llamadas.find((l) => l.modelo === "saleDocument.findFirst")!;
    expect((busqueda.args.where as { fullNumber: string }).fullNumber).toBe("NV001-00000251");
  });

  it("si la nota de origen no aparece, no inventa: devuelve null", async () => {
    // La baja ante SUNAT vale por sí sola; revertir contra el documento
    // equivocado sería peor que no revertir.
    const { tx } = txFalso(null);
    const r = await documentoConElMovimiento(tx, {
      id: "doc-1",
      notes: marcaDeConversion("NV001-00000999", null),
    });

    expect(r).toBeNull();
  });
});
