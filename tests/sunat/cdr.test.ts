import { describe, expect, it } from "vitest";
import { leerCdr, lineaPara } from "@/lib/sunat/cdr";

/** ApplicationResponse con una respuesta por documento, como el de una RA/RC. */
function cdrVarios(
  respuestas: { codigo: string; descripcion: string; referencia?: string }[],
  id = "RA-20260821-1",
) {
  const lineas = respuestas
    .map(
      (r) => `
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ResponseCode>${r.codigo}</cbc:ResponseCode>
      <cbc:Description>${r.descripcion}</cbc:Description>
    </cac:Response>
    ${r.referencia ? `<cac:DocumentReference><cbc:ID>${r.referencia}</cbc:ID></cac:DocumentReference>` : ""}
  </cac:DocumentResponse>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${id}</cbc:ID>${lineas}
</ar:ApplicationResponse>`;
}

describe("CDR con varias respuestas", () => {
  const xml = cdrVarios([
    { codigo: "0", descripcion: "La boleta B001-53 ha sido aceptada", referencia: "B001-53" },
    { codigo: "2033", descripcion: "El comprobante no existe", referencia: "B001-99" },
  ]);

  it("las lee todas", () => {
    expect(leerCdr(xml).lineas).toHaveLength(2);
  });

  it("distingue la aceptada de la rechazada", () => {
    const [aceptada, rechazada] = leerCdr(xml).lineas;
    expect(aceptada.aceptado).toBe(true);
    expect(rechazada.aceptado).toBe(false);
    expect(rechazada.codigo).toBe("2033");
  });

  it("lineaPara devuelve la del documento pedido, no la primera", () => {
    const cdr = leerCdr(xml);
    expect(lineaPara(cdr, "B001-99")?.codigo).toBe("2033");
    expect(lineaPara(cdr, "B001-53")?.codigo).toBe("0");
  });

  it("casa aunque la referencia venga sin los ceros de relleno", () => {
    // Se pide con el fullNumber del POS y SUNAT responde en forma corta.
    expect(lineaPara(leerCdr(xml), "B001-00000053")?.codigo).toBe("0");
  });

  it("prefiere no adivinar si hay varias y ninguna casa", () => {
    expect(lineaPara(leerCdr(xml), "F001-28")).toBeNull();
  });

  it("con una sola respuesta la usa aunque no traiga referencia", () => {
    const uno = leerCdr(cdrVarios([{ codigo: "0", descripcion: "Aceptada" }]));
    expect(lineaPara(uno, "B001-53")?.codigo).toBe("0");
  });

  it("guarda el id de la respuesta", () => {
    expect(leerCdr(xml).idRespuesta).toBe("RA-20260821-1");
  });
});

describe("regresión: el CDR de un comprobante individual no cambia", () => {
  const xml = cdrVarios(
    [{ codigo: "0", descripcion: "La Factura numero F001-1, ha sido aceptada", referencia: "F001-1" }],
    "1234567890",
  );

  it("mantiene código, descripción, referencia y aceptado en la cabecera", () => {
    const cdr = leerCdr(xml);
    expect(cdr.codigo).toBe("0");
    expect(cdr.descripcion).toBe("La Factura numero F001-1, ha sido aceptada");
    expect(cdr.referencia).toBe("F001-1");
    expect(cdr.aceptado).toBe(true);
    expect(cdr.lineas).toHaveLength(1);
  });

  it("sigue quejándose de un CDR sin respuesta", () => {
    expect(() => leerCdr(cdrVarios([]))).toThrow(/DocumentResponse/);
  });
});
