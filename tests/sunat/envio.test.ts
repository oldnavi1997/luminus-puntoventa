import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { empaquetarXml, extraerCdr } from "@/lib/sunat/empaquetado";
import { errorDesdeCdr, leerCdr } from "@/lib/sunat/cdr";
import { getStatus, sendBill, sendSummary } from "@/lib/sunat/cliente-soap";
import { ErrorSunat, clasificarCodigoSunat, esDuplicado } from "@/lib/sunat/errores";
import { configDePrueba } from "./fixtures";

// ── Empaquetado ──────────────────────────────────────────────────────────────

describe("empaquetado ZIP", () => {
  it("mete el XML con el nombre exacto que espera SUNAT", async () => {
    const b64 = await empaquetarXml("20609242753-01-F001-1.xml", "<Invoice/>");
    const zip = await JSZip.loadAsync(Buffer.from(b64, "base64"));

    expect(Object.keys(zip.files)).toEqual(["20609242753-01-F001-1.xml"]);
    expect(await zip.file("20609242753-01-F001-1.xml")!.async("string")).toBe("<Invoice/>");
  });

  it("hace ida y vuelta sin perder contenido", async () => {
    const xml = '<?xml version="1.0"?><Invoice><cbc:ID>F001-1</cbc:ID></Invoice>';
    const b64 = await empaquetarXml("doc.xml", xml);
    const extraido = await extraerCdr(b64);
    expect(extraido.xml).toBe(xml);
  });

  it("encuentra el XML aunque el ZIP traiga otras entradas", async () => {
    const zip = new JSZip();
    zip.file("dummy/", "");
    zip.file("basura.txt", "ignorar");
    zip.file("R-20609242753-01-F001-1.xml", "<ApplicationResponse/>");
    const b64 = (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");

    const extraido = await extraerCdr(b64);
    expect(extraido.nombre).toBe("R-20609242753-01-F001-1.xml");
  });

  it("falla con claridad si la respuesta no es un ZIP", async () => {
    await expect(extraerCdr(Buffer.from("no soy un zip").toString("base64"))).rejects.toThrow(
      ErrorSunat,
    );
  });
});

// ── Lectura del CDR ──────────────────────────────────────────────────────────

function cdrXml(codigo: string, descripcion: string, notas: string[] = []) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>1234567890</cbc:ID>
  ${notas.map((n) => `<cbc:Note>${n}</cbc:Note>`).join("")}
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ResponseCode>${codigo}</cbc:ResponseCode>
      <cbc:Description>${descripcion}</cbc:Description>
    </cac:Response>
    <cac:DocumentReference>
      <cbc:ID>F001-1</cbc:ID>
    </cac:DocumentReference>
  </cac:DocumentResponse>
</ar:ApplicationResponse>`;
}

describe("lectura del CDR", () => {
  it("reconoce un comprobante aceptado", () => {
    const cdr = leerCdr(cdrXml("0", "La Factura numero F001-1, ha sido aceptada"));

    expect(cdr.aceptado).toBe(true);
    expect(cdr.conObservaciones).toBe(false);
    expect(cdr.codigo).toBe("0");
    expect(cdr.referencia).toBe("F001-1");
    expect(errorDesdeCdr(cdr)).toBeNull();
  });

  it("reconoce un rechazo y lo convierte en error", () => {
    const cdr = leerCdr(cdrXml("2335", "El documento electronico ingresado ha sido alterado"));

    expect(cdr.aceptado).toBe(false);
    const err = errorDesdeCdr(cdr)!;
    expect(err.codigo).toBe("RECHAZADO");
    expect(err.detalle.codigoSunat).toBe("2335");
    expect(err.requiereCorreccion).toBe(true);
    expect(err.reintentable).toBe(false);
  });

  it("acepta con observaciones sin darlas por buenas en silencio", () => {
    const cdr = leerCdr(
      cdrXml("0", "aceptada", ["4267 - El dato ingresado en el tipo de documento del receptor no cumple"]),
    );

    expect(cdr.aceptado).toBe(true);
    expect(cdr.conObservaciones).toBe(true);
    expect(cdr.observaciones).toHaveLength(1);
  });

  it("marca los duplicados para que nadie los reenvíe", () => {
    const cdr = leerCdr(cdrXml("1033", "El comprobante fue registrado previamente"));
    const err = errorDesdeCdr(cdr)!;

    expect(err.codigo).toBe("DUPLICADO");
    expect(err.reintentable).toBe(false);
    expect(err.message).toMatch(/correlativo está quemado/);
  });

  // 1032 llegó tarde a esta lista y costó dos correlativos: se clasificaba como
  // un rechazo de contenido, que manda a revisar los datos del comprobante
  // cuando lo único que pasa es que el número ya está tomado.
  it("trata como duplicado un número dado de baja (1032)", () => {
    const cdr = leerCdr(cdrXml("1032", "El comprobante B001-52 fue anulado"));
    const err = errorDesdeCdr(cdr)!;

    expect(err.codigo).toBe("DUPLICADO");
    expect(err.reintentable).toBe(false);
  });

  it("falla si el CDR no trae la respuesta", () => {
    expect(() => leerCdr("<ApplicationResponse></ApplicationResponse>")).toThrow(ErrorSunat);
  });
});

describe("clasificación de códigos", () => {
  it.each([
    ["0", "ACEPTADO"],
    ["2335", "RECHAZADO"],
    ["1033", "RECHAZADO"],
    ["4267", "OBSERVADO"],
    ["0160", "CREDENCIALES"],
  ])("%s → %s", (codigo, esperado) => {
    expect(clasificarCodigoSunat(codigo)).toBe(esperado);
  });

  it("identifica los códigos de numeración ya usada", () => {
    expect(esDuplicado("1033")).toBe(true);
    expect(esDuplicado("2109")).toBe(true);
    expect(esDuplicado("2335")).toBe(false);
  });
});

// ── Cliente SOAP ─────────────────────────────────────────────────────────────

function responder(xml: string, status = 200) {
  return vi.fn().mockResolvedValue(new Response(xml, { status, headers: { "Content-Type": "text/xml" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("cliente SOAP", () => {
  const config = configDePrueba();

  it("manda el usuario WSSE como RUC + usuario SOL", async () => {
    const fetchMock = responder(
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns:sendBillResponse xmlns:ns="http://service.sunat.gob.pe"><applicationResponse>UEsDBA==</applicationResponse></ns:sendBillResponse></soap:Body></soap:Envelope>`,
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendBill(config, "20609242753-01-F001-1.zip", "UEsDBA==");

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toContain("e-beta.sunat.gob.pe");
    expect(opciones.headers.SOAPAction).toBe("urn:sendBill");
    expect(opciones.body).toContain("<wsse:Username>20609242753MODDATOS</wsse:Username>");
    expect(opciones.body).toContain("<fileName>20609242753-01-F001-1.zip</fileName>");
  });

  it("devuelve el CDR en base64", async () => {
    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><sendBillResponse><applicationResponse>Q0RSQjY0</applicationResponse></sendBillResponse></soap:Body></soap:Envelope>`,
      ),
    );
    expect(await sendBill(config, "x.zip", "UEsDBA==")).toBe("Q0RSQjY0");
  });

  it("traduce un fault de credenciales a algo accionable", async () => {
    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap-env:Client.0160</faultcode><faultstring>El archivo ZIP esta vacio</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
        500,
      ),
    );

    await expect(sendBill(config, "x.zip", "")).rejects.toMatchObject({
      codigo: "CREDENCIALES",
      detalle: { codigoSunat: "0160" },
    });
  });

  it("clasifica un fault de contenido como XML inválido", async () => {
    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap-env:Client.0130</faultcode><faultstring>El archivo ZIP no contiene comprobantes</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
        500,
      ),
    );

    await expect(sendBill(config, "x.zip", "UEsDBA==")).rejects.toMatchObject({
      codigo: "XML_INVALIDO",
    });
  });

  it("marca el timeout como reintentable y avisa de no duplicar", async () => {
    const err = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));

    try {
      await sendBill(config, "x.zip", "UEsDBA==");
      expect.unreachable("debió lanzar");
    } catch (e) {
      const error = e as ErrorSunat;
      expect(error.codigo).toBe("TIMEOUT");
      expect(error.reintentable).toBe(true);
      expect(error.message).toMatch(/consulta su estado antes de reenviar/);
    }
  });

  it("obtiene el ticket de un resumen diario", async () => {
    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><sendSummaryResponse><ticket>1660000000001</ticket></sendSummaryResponse></soap:Body></soap:Envelope>`,
      ),
    );
    expect(await sendSummary(config, "RC.zip", "UEsDBA==")).toBe("1660000000001");
  });

  it("distingue un ticket en proceso de uno resuelto", async () => {
    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><getStatusResponse><status><statusCode>98</statusCode><statusMessage>En proceso</statusMessage></status></getStatusResponse></soap:Body></soap:Envelope>`,
      ),
    );
    const enProceso = await getStatus(config, "1660000000001");
    expect(enProceso.enProceso).toBe(true);
    expect(enProceso.cdrBase64).toBeNull();

    vi.stubGlobal(
      "fetch",
      responder(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><getStatusResponse><status><statusCode>0</statusCode><statusMessage>Procesado</statusMessage><content>Q0RS</content></status></getStatusResponse></soap:Body></soap:Envelope>`,
      ),
    );
    const listo = await getStatus(config, "1660000000001");
    expect(listo.enProceso).toBe(false);
    expect(listo.cdrBase64).toBe("Q0RS");
  });

  it("no filtra la contraseña SOL en el mensaje de error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    try {
      await sendBill(config, "x.zip", "UEsDBA==");
    } catch (e) {
      expect((e as Error).message).not.toContain(config.sol.clave);
    }
  });
});
