/**
 * Construye y firma la anulación de un comprobante, y la imprime. NO envía nada.
 *
 * Sirve para mirar una comunicación de baja o un resumen de anulación reales
 * —con los importes del comprobante de verdad— antes de que exista el riesgo de
 * mandarlos. Lee de la base, pero no escribe ni un byte.
 *
 * Uso:
 *   npm run sunat:baja B001-00000053 "VENTA ANULADA POR EL CLIENTE"
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { getConfigSunat } from "../lib/sunat/config";
import { obtenerCertificado } from "../lib/sunat/certificado-memo";
import { firmarComprobante } from "../lib/sunat/firma";
import { empaquetarXml } from "../lib/sunat/empaquetado";
import { construirComunicacionBaja } from "../lib/sunat/ubl/baja";
import { CONDICION, construirResumenAnulacion } from "../lib/sunat/ubl/resumen";
import { importesDelXml } from "../lib/sunat/ubl/leer-comprobante";
import { archivoXml, archivoZip, nombreResumen } from "../lib/sunat/nombres";
import { codigoTipoDocIdentidad, TIPO_DOCUMENTO } from "../lib/sunat/catalogos";
import { fechaLima } from "../lib/sunat/ubl/comun";
import { plazoDeBaja } from "../lib/sunat/plazos";
import { EstadoEnvioSunat, TipoEnvioSunat } from "../app/generated/prisma/client";

const VERDE = "\x1b[32m", ROJO = "\x1b[31m", AMBAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";
const SALIDA = ".sunat-pruebas";

async function main() {
  const fullNumber = process.argv[2];
  const motivo = process.argv[3] ?? "ERROR EN LOS DATOS DEL COMPROBANTE";

  if (!fullNumber) {
    console.error("Uso: sunat:baja <SERIE-CORRELATIVO> [motivo]");
    process.exit(1);
  }

  const doc = await prisma.saleDocument.findFirst({
    where: { fullNumber },
    include: {
      sunatEnvios: {
        where: {
          tipoEnvio: TipoEnvioSunat.INDIVIDUAL,
          estado: { in: [EstadoEnvioSunat.ACEPTADO, EstadoEnvioSunat.ACEPTADO_CON_OBSERVACIONES] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!doc) {
    console.error(`${ROJO}✗${FIN} No hay ningún comprobante ${fullNumber} en esta base.`);
    process.exit(1);
  }
  if (doc.type === "NOTA_VENTA") {
    console.error(`${ROJO}✗${FIN} ${fullNumber} es una nota de venta: no existe para SUNAT.`);
    process.exit(1);
  }

  const emision = doc.sunatEnvios[0];
  if (!emision) {
    console.error(
      `${ROJO}✗${FIN} ${fullNumber} no tiene un envío aceptado: SUNAT no lo conoce y no hay nada que anular.`,
    );
    process.exit(1);
  }

  const config = getConfigSunat();
  const certificado = obtenerCertificado();
  const generadoEn = new Date();

  const plazo = plazoDeBaja(doc.createdAt, generadoEn);
  console.log(`\n${GRIS}  ambiente: ${config.ambiente}${FIN}`);
  console.log(`${GRIS}  emitido:  ${fechaLima(doc.createdAt)}  ·  total S/ ${Number(doc.total).toFixed(2)}${FIN}`);
  console.log(
    plazo.vencido
      ? `${ROJO}  plazo:    VENCIÓ el ${fechaLima(plazo.limite)} — SUNAT ya no lo aceptaría${FIN}`
      : `${GRIS}  plazo:    quedan ${plazo.diasRestantes} día(s), hasta el ${fechaLima(plazo.limite)}${FIN}`,
  );

  const esFactura = doc.type === "FACTURA";
  const tipoResumen = esFactura ? TIPO_DOCUMENTO.COMUNICACION_BAJA : TIPO_DOCUMENTO.RESUMEN_DIARIO;

  // Correlativo 1: esto no reserva nada, sólo enseña cómo quedaría.
  const CORRELATIVO_DE_MUESTRA = 1;

  let xml: string;
  if (esFactura) {
    xml = construirComunicacionBaja({
      correlativo: CORRELATIVO_DE_MUESTRA,
      generadoEn,
      fechaEmision: doc.createdAt,
      lineas: [
        {
          tipoDocumento: TIPO_DOCUMENTO.FACTURA,
          serie: doc.serie,
          correlativo: doc.correlativo,
          motivo,
        },
      ],
      config,
    });
  } else {
    const importes = importesDelXml(emision.xmlFirmado);
    console.log(
      `${GRIS}  importes del XML firmado: total ${importes.total} · gravado ${importes.gravado} · igv ${importes.igv}${FIN}`,
    );

    xml = construirResumenAnulacion({
      correlativo: CORRELATIVO_DE_MUESTRA,
      generadoEn,
      fechaEmision: doc.createdAt,
      lineas: [
        {
          tipoDocumento: TIPO_DOCUMENTO.BOLETA,
          serie: doc.serie,
          correlativo: doc.correlativo,
          condicion: CONDICION.ANULAR,
          adquirente: doc.buyerDocNumber
            ? {
                tipoDoc: codigoTipoDocIdentidad(doc.buyerDocType ?? "DNI"),
                numeroDoc: doc.buyerDocNumber,
              }
            : null,
          ...importes,
        },
      ],
      config,
    });
  }

  const firmado = firmarComprobante(xml, certificado);
  const raiz = nombreResumen(config.ruc, tipoResumen, fechaLima(generadoEn), CORRELATIVO_DE_MUESTRA);
  const zipB64 = await empaquetarXml(archivoXml(raiz), firmado);

  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(`${SALIDA}/${archivoXml(raiz)}`, firmado);

  console.log(`\n${VERDE}  ✓${FIN} ${esFactura ? "Comunicación de baja" : "Resumen de anulación"} construida y firmada.`);
  console.log(`${GRIS}  archivo:  ${archivoZip(raiz)} (${Buffer.from(zipB64, "base64").length} bytes)${FIN}`);
  console.log(`${GRIS}  guardado: ${SALIDA}/${archivoXml(raiz)}${FIN}`);
  console.log(`\n${AMBAR}  No se envió nada a SUNAT.${FIN}\n`);
}

main()
  .catch((err) => {
    console.error(`\n${ROJO}✗${FIN} ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
