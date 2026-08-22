import { describe, expect, it } from "vitest";
import { construirRepresentacion } from "@/lib/impresion/armar";
import { generarPdfA4 } from "@/lib/impresion/pdf/documento";
import type { EntradaRepresentacion, RepresentacionImpresa } from "@/lib/impresion/tipos";

/**
 * Humo, no comparación de bytes: la salida de pdfkit no es estable entre
 * versiones y un fichero de referencia sólo daría falsos negativos. Lo que se
 * comprueba es que no revienta con las formas que de verdad aparecen.
 */

const EMISOR = {
  razonSocial: "LUMINUS S.A.C.",
  nombreComercial: "LUMINUS EYEWEAR",
  ruc: "20609242753",
  domicilioFiscal: "MZA. D LOTE. 8 ASC. SOR ANA DE LOS ANGELES ZON. II — CERRO COLORADO, AREQUIPA",
  sucursal: "PRINCIPAL",
  direccionSucursal: null,
  telefono: null,
  email: "ventas@luminuseyewear.com",
  resolucion: null,
};

function rep(over: Partial<EntradaRepresentacion> = {}): RepresentacionImpresa {
  return construirRepresentacion({
    clase: "COMPROBANTE",
    emisor: EMISOR,
    documento: {
      id: "doc-1",
      type: "BOLETA",
      serie: "B001",
      correlativo: 53,
      fullNumber: "B001-00000053",
      status: "ACCEPTED",
      emitidoEn: new Date("2026-08-21T14:00:00-05:00"),
    },
    adquirente: {
      nombre: "MARROQUIN YUCRA JOSEPH",
      docType: "DNI",
      docNumber: "75207666",
      direccion: null,
    },
    items: [{ descripcion: "Montura Ray-Ban", cantidad: 1, importeConIgv: 590, unidad: "NIU", codigo: "MON-1" }],
    total: 590,
    descuento: 0,
    pago: {
      metodo: "EFECTIVO",
      montoRecibido: 600,
      cambio: 10,
      adelanto: null,
      efectivo: null,
      tarjeta: null,
      yape: null,
    },
    vendedor: "Wendy",
    hash: "X7NTFynnLTYWneSRkpljSDZH5UY=",
    ...over,
  });
}

const esPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";

describe("generación del PDF", () => {
  it("produce un PDF de verdad", async () => {
    const pdf = await generarPdfA4(rep());
    expect(esPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("aguanta treinta ítems, que obligan a paginar", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      descripcion: `Artículo número ${i + 1}`,
      cantidad: 1,
      importeConIgv: 59,
      unidad: "NIU",
      codigo: `SKU-${i + 1}`,
    }));
    const pdf = await generarPdfA4(rep({ items, total: 59 * 30 }));
    expect(esPdf(pdf)).toBe(true);
  });

  it("aguanta una descripción larguísima sin desbordar la columna", async () => {
    // En una óptica los nombres largos son la norma.
    const pdf = await generarPdfA4(
      rep({
        items: [
          {
            descripcion: "Lunas Transition Gen S Crizal Blue Defense/AR ".repeat(7),
            cantidad: 2,
            importeConIgv: 800,
            unidad: "NIU",
            codigo: "LUN-0727",
          },
        ],
        total: 800,
      }),
    );
    expect(esPdf(pdf)).toBe(true);
  });

  it("aguanta tildes, eñes y símbolos raros", async () => {
    const pdf = await generarPdfA4(
      rep({
        adquirente: { nombre: "ÑUÑOA PEÑA ÁNGEL", docType: "DNI", docNumber: "45678912", direccion: "JR. AREQUIPA N° 123 — 2° PISO" },
        items: [{ descripcion: "Montura «Ángel» 2° · 45°", cantidad: 1, importeConIgv: 100, unidad: "NIU", codigo: "Ñ-1" }],
        total: 100,
      }),
    );
    expect(esPdf(pdf)).toBe(true);
  });

  it("una nota de venta sale sin QR y no falla por ello", async () => {
    const pdf = await generarPdfA4(
      rep({
        clase: "NOTA_VENTA",
        documento: {
          id: "nv-1",
          type: "NOTA_VENTA",
          serie: "NV001",
          correlativo: 251,
          fullNumber: "NV001-00000251",
          status: "ACCEPTED",
          emitidoEn: new Date("2026-08-21T14:00:00-05:00"),
        },
      }),
    );
    expect(esPdf(pdf)).toBe(true);
  });

  it("un comprobante anulado se genera igual, con su marca", async () => {
    const anulado = rep({
      documento: {
        id: "doc-1",
        type: "BOLETA",
        serie: "B001",
        correlativo: 53,
        fullNumber: "B001-00000053",
        status: "VOIDED",
        emitidoEn: new Date("2026-08-21T14:00:00-05:00"),
      },
    });
    expect(anulado.aviso).toBe("ANULADO");
    expect(esPdf(await generarPdfA4(anulado))).toBe(true);
  });

  it("un pago mixto con adelanto tampoco lo rompe", async () => {
    const pdf = await generarPdfA4(
      rep({
        pago: {
          metodo: "MIXTO",
          montoRecibido: null,
          cambio: null,
          adelanto: 200,
          efectivo: 100,
          tarjeta: 100,
          yape: null,
        },
      }),
    );
    expect(esPdf(pdf)).toBe(true);
  });
});
