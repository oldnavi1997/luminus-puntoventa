import { describe, expect, it } from "vitest";
import {
  CODIGO_TICKET_CONSUMIDO,
  esperaAcumuladaMs,
  interpretarTicket,
  tocaConsultar,
} from "@/lib/sunat/tickets";
import type { EstadoTicket } from "@/lib/sunat/cliente-soap";

function estado(codigo: string, mensaje = ""): EstadoTicket {
  return { codigo, mensaje, cdrBase64: null, enProceso: codigo === "98" };
}

/** ApplicationResponse como el que devuelve SUNAT para una RA/RC. */
function cdrXml(codigo: string, descripcion: string, notas: string[] = []) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>1787335114709</cbc:ID>
  ${notas.map((n) => `<cbc:Note>${n}</cbc:Note>`).join("")}
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ResponseCode>${codigo}</cbc:ResponseCode>
      <cbc:Description>${descripcion}</cbc:Description>
    </cac:Response>
    <cac:DocumentReference><cbc:ID>RC-20260821-1</cbc:ID></cac:DocumentReference>
  </cac:DocumentResponse>
</ar:ApplicationResponse>`;
}

describe("interpretación del ticket", () => {
  it("98 es 'todavía en proceso', no un error", () => {
    expect(interpretarTicket(estado("98"), null)).toEqual({ clase: "EN_PROCESO" });
  });

  it("0 con un CDR aceptado es una anulación aceptada", () => {
    const v = interpretarTicket(
      estado("0"),
      cdrXml("0", "El Resumen diario RC-20260821-1, ha sido aceptado"),
    );
    expect(v.clase).toBe("ACEPTADO");
    if (v.clase !== "ACEPTADO") return;
    expect(v.codigo).toBe("0");
    expect(v.conObservaciones).toBe(false);
  });

  it("manda el código del CDR y no el del ticket: un 0 con línea 2033 es un RECHAZO", () => {
    // Es el caso que rompe a quien se fía del statusCode. Darlo por bueno
    // marcaría como anulado un comprobante que sigue vivo en SUNAT.
    const v = interpretarTicket(estado("0"), cdrXml("2033", "El comprobante no existe"));
    expect(v.clase).toBe("RECHAZADO");
    if (v.clase !== "RECHAZADO") return;
    expect(v.codigo).toBe("2033");
  });

  it("un CDR 4xxx es aceptado, pero con observaciones", () => {
    const v = interpretarTicket(estado("0"), cdrXml("4000", "Aceptado con observaciones", ["obs"]));
    expect(v.clase).toBe("ACEPTADO");
    if (v.clase !== "ACEPTADO") return;
    expect(v.conObservaciones).toBe(true);
    expect(v.observaciones).toEqual(["obs"]);
  });

  it("99 con contenido usa el código accionable del CDR", () => {
    const v = interpretarTicket(estado("99"), cdrXml("3105", "Error en el resumen"));
    expect(v.clase).toBe("RECHAZADO");
    if (v.clase !== "RECHAZADO") return;
    expect(v.codigo).toBe("3105");
  });

  it("99 sin contenido sigue siendo rechazo: SUNAT evaluó", () => {
    // No es un fallo de envío. Confundirlos diría que el correlativo sigue vivo.
    const v = interpretarTicket(estado("99", "procesado con errores"), null);
    expect(v.clase).toBe("RECHAZADO");
    if (v.clase !== "RECHAZADO") return;
    expect(v.codigo).toBe("99");
    expect(v.cdrXml).toBeNull();
  });

  it("0127 es el ticket ya consumido: ni anulado ni rechazado, hay que mirarlo", () => {
    // Comprobado en beta: el segundo getStatus sobre un ticket resuelto responde
    // esto y no devuelve el CDR otra vez.
    const v = interpretarTicket(estado(CODIGO_TICKET_CONSUMIDO), null);
    expect(v.clase).toBe("PERDIDO");
    if (v.clase !== "PERDIDO") return;
    expect(v.mensaje).toMatch(/SEE-SOL/);
  });

  it("un código desconocido se vuelve a preguntar, no se declara rechazo", () => {
    expect(interpretarTicket(estado("100"), null).clase).toBe("TRANSITORIO");
    expect(interpretarTicket(estado(""), null).clase).toBe("TRANSITORIO");
  });

  it("un 0 sin CDR tampoco se da por bueno", () => {
    expect(interpretarTicket(estado("0"), null).clase).toBe("TRANSITORIO");
  });

  it("un CDR ilegible es transitorio, no un rechazo", () => {
    expect(interpretarTicket(estado("0"), "<esto no es un CDR/>").clase).toBe("TRANSITORIO");
  });
});

describe("ritmo del sondeo", () => {
  it("el primer intento no espera", () => {
    expect(esperaAcumuladaMs(0)).toBe(0);
  });

  it("crece y es monótona", () => {
    const esperas = [0, 1, 2, 3, 4, 5].map(esperaAcumuladaMs);
    for (let i = 1; i < esperas.length; i++) {
      expect(esperas[i]).toBeGreaterThan(esperas[i - 1]);
    }
  });

  it("tiene techo: cada tramo no pasa de media hora", () => {
    const paso20 = esperaAcumuladaMs(20) - esperaAcumuladaMs(19);
    expect(paso20).toBe(30 * 60_000);
  });

  it("un ticket recién creado se consulta ya", () => {
    const ahora = new Date("2026-08-21T12:00:00Z");
    expect(tocaConsultar({ createdAt: ahora, intentos: 0 }, ahora)).toBe(true);
  });

  it("tras un intento espera antes de volver a preguntar", () => {
    const creado = new Date("2026-08-21T12:00:00Z");
    const alSegundo = new Date("2026-08-21T12:00:01Z");
    const alMinuto = new Date("2026-08-21T12:01:00Z");

    expect(tocaConsultar({ createdAt: creado, intentos: 1 }, alSegundo)).toBe(false);
    expect(tocaConsultar({ createdAt: creado, intentos: 1 }, alMinuto)).toBe(true);
  });
});
