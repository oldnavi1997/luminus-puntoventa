import { describe, expect, it } from "vitest";
import { DocumentType, PaymentMethod } from "@/app/generated/prisma/client";
import { TIPO_DOC_IDENTIDAD } from "@/lib/sunat/catalogos";
import {
  etiquetaTipoDoc,
  etiquetaUnidad,
  LEYENDA_CONSULTA,
  leyendaRepresentacion,
  METODO_PAGO,
  TIPO_DOC_ETIQUETA,
  TITULO_DOCUMENTO,
} from "@/lib/impresion/etiquetas";

describe("los mapas cubren los enums enteros", () => {
  // Si mañana se añade un DocumentType o un PaymentMethod, esto falla en vez de
  // imprimir "undefined" en un documento tributario.
  it("hay título para cada tipo de documento", () => {
    for (const tipo of Object.values(DocumentType)) {
      expect(TITULO_DOCUMENTO[tipo], `falta el título de ${tipo}`).toBeTruthy();
    }
  });

  it("hay etiqueta para cada método de pago", () => {
    for (const metodo of Object.values(PaymentMethod)) {
      expect(METODO_PAGO[metodo], `falta la etiqueta de ${metodo}`).toBeTruthy();
    }
  });

  it("hay etiqueta para cada tipo de documento de identidad del catálogo 06", () => {
    for (const codigo of Object.values(TIPO_DOC_IDENTIDAD)) {
      expect(TIPO_DOC_ETIQUETA[codigo], `falta la etiqueta del código ${codigo}`).toBeTruthy();
    }
  });
});

describe("etiquetas sueltas", () => {
  it("traduce las unidades que emite el POS", () => {
    expect(etiquetaUnidad("NIU")).toBe("UND");
    expect(etiquetaUnidad("ZZ")).toBe("SERV");
  });

  it("ante una unidad desconocida imprime el código en vez de nada", () => {
    expect(etiquetaUnidad("KGM")).toBe("KGM");
  });

  it("sin tipo de documento cae en un rótulo neutro", () => {
    expect(etiquetaTipoDoc(null)).toBe("Doc.");
    expect(etiquetaTipoDoc("6")).toBe("RUC");
    expect(etiquetaTipoDoc("1")).toBe("DNI");
  });
});

describe("leyendas", () => {
  it("la de representación impresa nombra el documento", () => {
    expect(leyendaRepresentacion("FACTURA ELECTRÓNICA")).toBe(
      "Representación impresa de la FACTURA ELECTRÓNICA.",
    );
  });

  it("la consulta apunta a SUNAT y no a un proveedor", () => {
    // Los comprobantes del facturador anterior mandaban a consultar a su propia
    // web; esto tiene que llevar al validador oficial.
    expect(LEYENDA_CONSULTA).toContain("sunat.gob.pe");
    expect(LEYENDA_CONSULTA).not.toContain("paqari");
  });
});
