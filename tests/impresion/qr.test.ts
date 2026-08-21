import { describe, expect, it } from "vitest";
import { cadenaQr, CAMPOS_QR, SUFIJO_QR } from "@/lib/impresion/qr";
import { fechaLima } from "@/lib/sunat/ubl/comun";

const base = {
  ruc: "20609242753",
  tipoDocumento: "03",
  serie: "B001",
  correlativo: 51,
  igv: 295.93,
  total: 1940,
  fechaEmision: "2026-04-06",
  tipoDocAdquirente: "1",
  numeroDocAdquirente: "45589809",
};

describe("cadena del QR", () => {
  it("arma la cadena exacta de una boleta con DNI", () => {
    expect(cadenaQr(base)).toBe(
      "20609242753|03|B001|00000051|295.93|1940.00|2026-04-06|1|45589809|",
    );
  });

  it("arma la de una factura con RUC", () => {
    expect(
      cadenaQr({
        ...base,
        tipoDocumento: "01",
        serie: "F001",
        correlativo: 28,
        igv: 0.31,
        total: 2,
        tipoDocAdquirente: "6",
        numeroDocAdquirente: "20512345678",
      }),
    ).toBe("20609242753|01|F001|00000028|0.31|2.00|2026-04-06|6|20512345678|");
  });

  it("usa los centinelas cuando el comprador no está identificado", () => {
    expect(
      cadenaQr({ ...base, tipoDocAdquirente: "0", numeroDocAdquirente: "00000000" }),
    ).toContain("|0|00000000|");
  });

  it("tiene nueve campos y termina en barra", () => {
    const cadena = cadenaQr(base);
    expect(cadena.endsWith(SUFIJO_QR)).toBe(true);
    // La barra final deja un décimo elemento vacío al partir.
    expect(cadena.split("|")).toHaveLength(CAMPOS_QR + 1);
    expect(cadena.split("|").pop()).toBe("");
  });

  it("rellena el correlativo a ocho dígitos y no toca los que ya lo son", () => {
    expect(cadenaQr({ ...base, correlativo: 7 })).toContain("|00000007|");
    expect(cadenaQr({ ...base, correlativo: 12345678 })).toContain("|12345678|");
  });

  it("escribe los importes con dos decimales, sin símbolo ni separador de miles", () => {
    // `formatPEN` daría "S/ 1,940.00" y eso rompe la lectura del QR.
    const cadena = cadenaQr({ ...base, igv: 0, total: 100 });
    expect(cadena).toContain("|0.00|100.00|");
    expect(cadena).not.toContain("S/");
    expect(cadena).not.toContain(",");
  });

  it("redondea igual que el XML", () => {
    expect(cadenaQr({ ...base, total: 1354.995 })).toContain("|1355.00|");
    expect(cadenaQr({ ...base, total: 1354.994 })).toContain("|1354.99|");
  });

  it("no mete espacios alrededor de las barras", () => {
    expect(cadenaQr(base)).not.toMatch(/\s\|/);
    expect(cadenaQr(base)).not.toMatch(/\|\s/);
  });

  it("la fecha es el día PERUANO, no el del servidor", () => {
    // Una venta de las 22:00 de Lima son las 03:00 UTC del día siguiente. Si la
    // fecha saliera en UTC, el QR no cuadraría con el XML que se declaró.
    const emitidoEn = new Date("2026-08-19T03:00:00Z");
    expect(emitidoEn.toISOString().slice(0, 10)).toBe("2026-08-19");
    expect(fechaLima(emitidoEn)).toBe("2026-08-18");

    expect(cadenaQr({ ...base, fechaEmision: fechaLima(emitidoEn) })).toContain("|2026-08-18|");
  });
});
