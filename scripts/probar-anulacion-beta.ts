/**
 * Ida y vuelta completa contra BETA: emite un comprobante y lo anula.
 *
 * Responde la pregunta que bloquea el diseño de la anulación: si SUNAT acepta
 * anular por resumen (RC, condición 3) una boleta que se informó
 * individualmente por `sendBill`, que es como las emite este POS. De paso
 * captura la forma real del CDR de una RA/RC —cuántas respuestas trae y qué
 * lleva la referencia—, que es lo que `lineaPara` necesita para no adivinar.
 *
 * Uso:
 *   npm run sunat:probar-anulacion            # boleta y factura
 *   npm run sunat:probar-anulacion boleta
 *
 * No toca la base de datos. Sólo corre contra beta: esos comprobantes no tienen
 * validez tributaria y su numeración es independiente de la de producción.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { getConfigSunat } from "../lib/sunat/config";
import { obtenerCertificado } from "../lib/sunat/certificado-memo";
import { calcularComprobante } from "../lib/sunat/calculo";
import { construirComprobante } from "../lib/sunat/ubl/comprobante";
import { construirComunicacionBaja } from "../lib/sunat/ubl/baja";
import { CONDICION, construirResumenAnulacion } from "../lib/sunat/ubl/resumen";
import { importesDelXml } from "../lib/sunat/ubl/leer-comprobante";
import { firmarComprobante } from "../lib/sunat/firma";
import { empaquetarXml, extraerCdr } from "../lib/sunat/empaquetado";
import { getStatus, sendBill, sendSummary } from "../lib/sunat/cliente-soap";
import { leerCdr, type Cdr } from "../lib/sunat/cdr";
import { archivoXml, archivoZip, nombreComprobante, nombreResumen } from "../lib/sunat/nombres";
import { codigoTipoDocIdentidad, TIPO_DOCUMENTO } from "../lib/sunat/catalogos";
import { fechaLima } from "../lib/sunat/ubl/comun";

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const AMBAR = "\x1b[33m";
const GRIS = "\x1b[90m";
const FIN = "\x1b[0m";
const SALIDA = ".sunat-pruebas";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Correlativo derivado del reloj: en beta un número repetido se rechaza igual. */
function correlativoDePrueba(): number {
  return Math.floor(Date.now() / 1000) % 90000;
}

type Tipo = "BOLETA" | "FACTURA";
type Adquirente = { docType: string; docNumber: string; name: string };

async function emitir(tipo: Tipo, serie: string, correlativo: number) {
  const config = getConfigSunat();
  const certificado = obtenerCertificado();
  const emitidoEn = new Date();

  const calculo = calcularComprobante([
    { descripcion: "Articulo de prueba para anulacion", cantidad: 1, importeConIgv: 59 },
  ]);

  const adquirente: Adquirente =
    tipo === "FACTURA"
      ? { docType: "RUC", docNumber: "20512345678", name: "EMPRESA DE PRUEBA S.A.C." }
      : { docType: "DNI", docNumber: "45678912", name: "CLIENTE DE PRUEBA" };

  const xml = construirComprobante({
    tipo,
    serie,
    correlativo,
    emitidoEn,
    adquirente,
    calculo,
    config,
  });
  const firmado = firmarComprobante(xml, certificado);
  const raiz = nombreComprobante(
    config.ruc,
    tipo === "FACTURA" ? TIPO_DOCUMENTO.FACTURA : TIPO_DOCUMENTO.BOLETA,
    serie,
    correlativo,
  );

  const zip = await empaquetarXml(archivoXml(raiz), firmado);
  const cdrB64 = await sendBill(config, archivoZip(raiz), zip);
  const { xml: cdrXml } = await extraerCdr(cdrB64);

  return { firmado, cdr: leerCdr(cdrXml), emitidoEn, adquirente };
}

async function anular(
  tipo: Tipo,
  serie: string,
  correlativo: number,
  emitidoEn: Date,
  xmlFirmado: string,
  adquirente: Adquirente,
): Promise<{ ticket: string; statusCode: string; cdr: Cdr | null }> {
  const config = getConfigSunat();
  const certificado = obtenerCertificado();
  const generadoEn = new Date();
  const esFactura = tipo === "FACTURA";

  // En una prueba nada compite por el número, así que basta con el 1.
  const CORRELATIVO_RESUMEN = 1;

  const xml = esFactura
    ? construirComunicacionBaja({
        correlativo: CORRELATIVO_RESUMEN,
        generadoEn,
        fechaEmision: emitidoEn,
        lineas: [
          {
            tipoDocumento: TIPO_DOCUMENTO.FACTURA,
            serie,
            correlativo,
            motivo: "PRUEBA DE ANULACION",
          },
        ],
        config,
      })
    : construirResumenAnulacion({
        correlativo: CORRELATIVO_RESUMEN,
        generadoEn,
        fechaEmision: emitidoEn,
        lineas: [
          {
            tipoDocumento: TIPO_DOCUMENTO.BOLETA,
            serie,
            correlativo,
            condicion: CONDICION.ANULAR,
            adquirente: {
              tipoDoc: codigoTipoDocIdentidad(adquirente.docType),
              numeroDoc: adquirente.docNumber,
            },
            ...importesDelXml(xmlFirmado),
          },
        ],
        config,
      });

  const firmado = firmarComprobante(xml, certificado);
  const raiz = nombreResumen(
    config.ruc,
    esFactura ? TIPO_DOCUMENTO.COMUNICACION_BAJA : TIPO_DOCUMENTO.RESUMEN_DIARIO,
    fechaLima(generadoEn),
    CORRELATIVO_RESUMEN,
  );

  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(`${SALIDA}/${archivoXml(raiz)}`, firmado);

  const zip = await empaquetarXml(archivoXml(raiz), firmado);
  const ticket = await sendSummary(config, archivoZip(raiz), zip);
  console.log(`  ${VERDE}✓${FIN} Enviada ${raiz}. Ticket ${AMBAR}${ticket}${FIN}`);

  // El sondeo es lo que la emisión no tiene: 98 significa "todavía en proceso".
  const INTENTOS = 15;
  for (let i = 1; i <= INTENTOS; i++) {
    await esperar(i === 1 ? 3000 : 8000);
    const estado = await getStatus(config, ticket);

    if (estado.enProceso) {
      console.log(`  ${GRIS}· intento ${i}: 98 en proceso…${FIN}`);
      continue;
    }

    console.log(
      `  ${GRIS}· resuelto en el intento ${i} — statusCode ${estado.codigo}: ${estado.mensaje}${FIN}`,
    );

    if (!estado.cdrBase64) {
      console.log(`  ${ROJO}✗ statusCode ${estado.codigo} SIN contenido: no llega CDR.${FIN}`);
      return { ticket, statusCode: estado.codigo, cdr: null };
    }

    const { nombre, xml: cdrXml } = await extraerCdr(estado.cdrBase64);
    writeFileSync(`${SALIDA}/${nombre}`, cdrXml);
    console.log(`  ${GRIS}  CDR guardado en ${SALIDA}/${nombre}${FIN}`);

    return { ticket, statusCode: estado.codigo, cdr: leerCdr(cdrXml) };
  }

  console.log(`  ${AMBAR}! Sigue en proceso tras ${INTENTOS} intentos. Ticket ${ticket}${FIN}`);
  return { ticket, statusCode: "98", cdr: null };
}

async function probar(tipo: Tipo, serie: string) {
  const correlativo = correlativoDePrueba();
  console.log(`\n${AMBAR}── ${tipo} ${serie}-${correlativo} ──${FIN}`);

  const { firmado, cdr, emitidoEn, adquirente } = await emitir(tipo, serie, correlativo);
  if (!cdr.aceptado) {
    console.log(`  ${ROJO}✗ La emisión fue rechazada (${cdr.codigo}): ${cdr.descripcion}${FIN}`);
    console.log(`  ${GRIS}  Sin comprobante emitido no hay nada que anular.${FIN}`);
    return;
  }
  console.log(`  ${VERDE}✓${FIN} Emitido y aceptado (${cdr.codigo}).`);

  const resultado = await anular(tipo, serie, correlativo, emitidoEn, firmado, adquirente);

  console.log("");
  if (!resultado.cdr) {
    console.log(`  ${ROJO}Sin CDR: statusCode ${resultado.statusCode}.${FIN}`);
    return;
  }

  const r = resultado.cdr;
  console.log(r.aceptado ? `  ${VERDE}ANULACION ACEPTADA${FIN}` : `  ${ROJO}ANULACION RECHAZADA${FIN}`);
  console.log(`  codigo ${r.codigo}: ${r.descripcion}`);
  console.log(`  ${GRIS}idRespuesta: ${JSON.stringify(r.idRespuesta)}${FIN}`);
  console.log(`  ${GRIS}respuestas en el CDR: ${r.lineas.length}${FIN}`);
  for (const l of r.lineas) {
    console.log(
      `  ${GRIS}  · ref=${JSON.stringify(l.referencia)} codigo=${l.codigo} ${l.descripcion}${FIN}`,
    );
  }
  for (const o of r.observaciones) console.log(`  ${AMBAR}  obs: ${o}${FIN}`);
}

async function main() {
  const config = getConfigSunat();

  // Guarda dura. Esto emite comprobantes para tirarlos: contra producción
  // gastaría correlativos reales y declararía ventas que no existieron.
  if (config.ambiente !== "beta") {
    console.error(`\n${ROJO}✗ ABORTA${FIN}: SUNAT_ENV es "${config.ambiente}".`);
    console.error(`${AMBAR}  Esto emite y anula comprobantes de prueba; sólo corre contra beta.${FIN}\n`);
    process.exit(1);
  }

  const cual = (process.argv[2] ?? "ambos").toLowerCase();
  console.log(`\n${GRIS}ambiente: ${config.ambiente} · ${config.endpoints.comprobantes}${FIN}`);

  if (cual === "ambos" || cual === "boleta") await probar("BOLETA", "B001");
  if (cual === "ambos" || cual === "factura") await probar("FACTURA", "F001");
  console.log("");
}

main().catch((err) => {
  console.error(`\n${ROJO}✗${FIN} ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
