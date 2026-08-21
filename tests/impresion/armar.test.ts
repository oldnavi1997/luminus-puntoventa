import { describe, expect, it } from "vitest";
import { construirRepresentacion } from "@/lib/impresion/armar";
import type { EntradaRepresentacion } from "@/lib/impresion/tipos";

const EMISOR = {
  razonSocial: "LUMINUS S.A.C.",
  nombreComercial: "LUMINUS EYEWEAR",
  ruc: "20609242753",
  domicilioFiscal: "LT. 8 MZ. D ASC. SOR ANA DE LOS ANGELES - CERRO COLORADO, AREQUIPA",
  sucursal: "PRINCIPAL",
  direccionSucursal: null,
  telefono: null,
  email: null,
  resolucion: null,
};

function entrada(over: Partial<EntradaRepresentacion> = {}): EntradaRepresentacion {
  return {
    clase: "COMPROBANTE",
    emisor: EMISOR,
    documento: {
      id: "doc-1",
      type: "FACTURA",
      serie: "F001",
      correlativo: 28,
      fullNumber: "F001-00000028",
      status: "ACCEPTED",
      emitidoEn: new Date("2026-08-21T14:00:00-05:00"),
    },
    adquirente: {
      nombre: "EMPRESA DE PRUEBA S.A.C.",
      docType: "RUC",
      docNumber: "20512345678",
      direccion: "AV. PRUEBA 123",
    },
    items: [
      { descripcion: "Montura Ray-Ban", cantidad: 1, importeConIgv: 590, unidad: "NIU", codigo: "MON-1" },
      { descripcion: "Lunas progresivas", cantidad: 2, importeConIgv: 472, unidad: "NIU", codigo: "LUN-1" },
    ],
    total: 1062,
    descuento: 0,
    pago: {
      metodo: "EFECTIVO",
      montoRecibido: 1100,
      cambio: 38,
      adelanto: null,
      efectivo: null,
      tarjeta: null,
      yape: null,
    },
    vendedor: "Wendy",
    hash: "Ici1VkCEYQ+82h5Z5XJRRpckhnQ=",
    ...over,
  };
}

describe("comprobante", () => {
  const rep = construirRepresentacion(entrada());

  it("titula y tipifica según el tipo, no según la serie", () => {
    expect(rep.documento.titulo).toBe("FACTURA ELECTRÓNICA");
    expect(rep.documento.tipoSunat).toBe("01");
    expect(rep.documento.correlativo).toBe("00000028");
  });

  it("usa la hora de Lima y no la del servidor", () => {
    expect(rep.documento.fechaEmision).toBe("2026-08-21");
    expect(rep.documento.horaEmision).toBe("14:00:00");
  });

  it("numera los ítems desde 1 y distingue valor de precio unitario", () => {
    expect(rep.items.map((i) => i.numero)).toEqual([1, 2]);
    expect(rep.items[0].precioUnitario).toBeGreaterThan(rep.items[0].valorUnitario);
    expect(rep.items[0].unidadEtiqueta).toBe("UND");
  });

  it("cuadra: gravadas + IGV === total", () => {
    expect(rep.totales.opGravadas + rep.totales.igv).toBeCloseTo(rep.totales.total, 2);
  });

  it("cuadra: la suma de los ítems === total", () => {
    const suma = rep.items.reduce((s, i) => s + i.importe, 0);
    expect(suma).toBeCloseTo(rep.totales.total, 2);
  });

  it("lleva QR, hash y las leyendas legales", () => {
    expect(rep.sunat).not.toBeNull();
    expect(rep.sunat?.cadenaQr).toContain("20609242753|01|F001|00000028|");
    expect(rep.sunat?.hash).toBe("Ici1VkCEYQ+82h5Z5XJRRpckhnQ=");
    expect(rep.sunat?.leyendas.join(" ")).toContain("Representación impresa");
    expect(rep.sunat?.leyendas.join(" ")).toContain("SEE-DC");
  });

  it("no inventa la resolución si no está configurada", () => {
    expect(rep.sunat?.leyendas.join(" ")).not.toContain("Resolución");
  });

  it("la añade sólo cuando se configura", () => {
    const con = construirRepresentacion(
      entrada({ emisor: { ...EMISOR, resolucion: "0180050000804/SUNAT" } }),
    );
    expect(con.sunat?.leyendas.join(" ")).toContain("0180050000804/SUNAT");
  });

  it("pone el monto en letras", () => {
    expect(rep.totales.totalLetras).toMatch(/SOLES$/);
  });
});

describe("el descuento global no descuadra nada", () => {
  // Es el caso en que recalcular a mano divergiría del XML: el total cobrado es
  // menor que la suma de las líneas y `calcularComprobante` lo prorratea.
  const rep = construirRepresentacion(entrada({ total: 1000, descuento: 62 }));

  it("respeta el total realmente cobrado", () => {
    expect(rep.totales.total).toBeCloseTo(1000, 2);
  });

  it("sigue cuadrando por dentro", () => {
    expect(rep.totales.opGravadas + rep.totales.igv).toBeCloseTo(1000, 2);
    expect(rep.items.reduce((s, i) => s + i.importe, 0)).toBeCloseTo(1000, 2);
  });

  it("y el QR declara ese mismo total", () => {
    expect(rep.sunat?.cadenaQr).toContain("|1000.00|");
  });
});

describe("comprador sin identificar", () => {
  const rep = construirRepresentacion(
    entrada({
      documento: { ...entrada().documento, type: "BOLETA", serie: "B001", fullNumber: "B001-00000053" },
      adquirente: { nombre: null, docType: null, docNumber: "00000000", direccion: null },
    }),
  );

  it("lo marca como no identificado", () => {
    expect(rep.adquirente.identificado).toBe(false);
    expect(rep.adquirente.numeroDoc).toBeNull();
    expect(rep.adquirente.nombre).toBe("CLIENTE VARIOS");
  });

  it("y el QR lleva los centinelas", () => {
    expect(rep.sunat?.cadenaQr).toContain("|0|00000000|");
  });
});

describe("documentos que SUNAT no conoce", () => {
  it("una nota de venta no lleva QR ni hash", () => {
    const rep = construirRepresentacion(
      entrada({
        clase: "NOTA_VENTA",
        documento: { ...entrada().documento, type: "NOTA_VENTA", serie: "NV001", fullNumber: "NV001-00000251" },
      }),
    );
    expect(rep.sunat).toBeNull();
    expect(rep.documento.titulo).toBe("NOTA DE VENTA");
    expect(rep.documento.tipoSunat).toBeNull();
  });

  it("un recibo de saldo tampoco", () => {
    const rep = construirRepresentacion(entrada({ clase: "RECIBO_SALDO" }));
    expect(rep.sunat).toBeNull();
    expect(rep.documento.titulo).toBe("RECIBO DE COBRO DE SALDO");
  });

  it("un comprobante que SUNAT no aceptó se imprime, pero avisando", () => {
    const rep = construirRepresentacion(
      entrada({ documento: { ...entrada().documento, status: "PENDING" } }),
    );
    expect(rep.sunat).toBeNull();
    expect(rep.aviso).toBe("PENDIENTE DE ACEPTACIÓN POR SUNAT");
  });

  it("uno anulado lo dice en grande", () => {
    const rep = construirRepresentacion(
      entrada({ documento: { ...entrada().documento, status: "VOIDED" } }),
    );
    expect(rep.aviso).toBe("ANULADO");
    expect(rep.documento.anulado).toBe(true);
    // Sigue siendo la representación impresa de algo que SUNAT sí registró.
    expect(rep.sunat).not.toBeNull();
  });
});

describe("pago", () => {
  it("desglosa un pago mixto", () => {
    const rep = construirRepresentacion(
      entrada({
        pago: { metodo: "MIXTO", montoRecibido: null, cambio: null, adelanto: null, efectivo: 500, tarjeta: 562, yape: 0 },
      }),
    );
    expect(rep.pago.desglose).toEqual([
      { etiqueta: "Efectivo", monto: 500 },
      { etiqueta: "Tarjeta", monto: 562 },
    ]);
  });

  it("calcula el saldo pendiente de un adelanto", () => {
    const rep = construirRepresentacion(
      entrada({
        pago: { metodo: "EFECTIVO", montoRecibido: 400, cambio: 0, adelanto: 400, efectivo: null, tarjeta: null, yape: null },
      }),
    );
    expect(rep.pago.adelanto).toBe(400);
    expect(rep.pago.saldoPendiente).toBeCloseTo(662, 2);
  });
});

describe("la receta óptica no se imprime", () => {
  it("no aparece en ninguna parte de la salida", () => {
    // Ancla un requisito de producto por muy poco dinero: la entrada ni
    // siquiera tiene campo para ella, y esto lo mantiene así.
    const rep = construirRepresentacion(entrada());
    const serializado = JSON.stringify(rep);
    for (const rastro of ["sphere", "cylinder", "axis", "prescription", "esfera"]) {
      expect(serializado).not.toContain(rastro);
    }
  });
});
