/**
 * Envía un comprobante de prueba a SUNAT y muestra el CDR.
 *
 * Es el primer contacto real con el validador de SUNAT: hasta aquí sólo
 * sabíamos que el XML nos parecía correcto a nosotros. También sirve para el
 * set de homologación, cambiando los ítems.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/enviar-prueba.ts
 *   npx tsx --env-file=.env.local scripts/enviar-prueba.ts factura 5
 *
 * Guarda el XML firmado y el CDR en .sunat-pruebas/ para poder inspeccionarlos.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { getConfigSunat } from "../lib/sunat/config";
import { cargarCertificado, verificarVigencia } from "../lib/sunat/certificado";
import { calcularComprobante } from "../lib/sunat/calculo";
import { construirComprobante } from "../lib/sunat/ubl/comprobante";
import { firmarComprobante } from "../lib/sunat/firma";
import { empaquetarXml, extraerCdr } from "../lib/sunat/empaquetado";
import { sendBill } from "../lib/sunat/cliente-soap";
import { leerCdr } from "../lib/sunat/cdr";
import { archivoXml, archivoZip, nombreComprobante } from "../lib/sunat/nombres";
import { TIPO_DOCUMENTO } from "../lib/sunat/catalogos";
import { ErrorSunat } from "../lib/sunat/errores";

const VERDE = "\x1b[32m", ROJO = "\x1b[31m", AMBAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";
const SALIDA = ".sunat-pruebas";

async function main() {
  const tipo = (process.argv[2] ?? "boleta").toLowerCase() === "factura" ? "FACTURA" : "BOLETA";
  const correlativo = Number(process.argv[3] ?? 1);

  const config = getConfigSunat();
  console.log(`\n${GRIS}  ambiente: ${config.ambiente}  ·  ${config.endpoints.comprobantes}${FIN}`);
  console.log(`${GRIS}  emisor:   ${config.ruc} — ${config.razonSocial}${FIN}\n`);

  const cert = cargarCertificado(config.certificado.pfx, config.certificado.clave);
  verificarVigencia(cert);
  console.log(`${VERDE}  ✓${FIN} Certificado cargado y vigente.`);

  // Una venta típica de la óptica: montura + par de lunas.
  const calculo = calcularComprobante([
    { descripcion: "Montura Ray-Ban RB5154 Clubmaster", cantidad: 1, importeConIgv: 590, codigoProducto: "MON-RB5154" },
    { descripcion: "Luna Progresiva Digital 1.60 AR", cantidad: 2, importeConIgv: 236, codigoProducto: "LUN-PRG-160" },
  ]);

  // Cuarto argumento: la serie. No hay valor por defecto que sirva para siempre
  // —una serie se abandona en cuanto SUNAT tiene números suyos informados— así
  // que se pasa a mano y se elige mirando cuál está activa en DocumentSerie.
  const serie = process.argv[4] ?? (tipo === "FACTURA" ? "F001" : "B002");
  const adquirente =
    tipo === "FACTURA"
      ? { docType: "RUC", docNumber: "20512345678", name: "EMPRESA DE PRUEBA S.A.C.", address: "AV. PRUEBA 123" }
      : { docType: "DNI", docNumber: "45678912", name: "CLIENTE DE PRUEBA" };

  const xml = construirComprobante({
    tipo,
    serie,
    correlativo,
    emitidoEn: new Date(),
    adquirente,
    calculo,
    config,
  });
  console.log(`${VERDE}  ✓${FIN} XML generado — ${tipo} ${serie}-${correlativo}, total S/ ${calculo.totalPagar.toFixed(2)}`);

  const firmado = firmarComprobante(xml, cert);
  console.log(`${VERDE}  ✓${FIN} Firmado (${Buffer.byteLength(firmado, "utf8")} bytes).`);

  const raiz = nombreComprobante(
    config.ruc,
    tipo === "FACTURA" ? TIPO_DOCUMENTO.FACTURA : TIPO_DOCUMENTO.BOLETA,
    serie,
    correlativo,
  );
  const zipB64 = await empaquetarXml(archivoXml(raiz), firmado);

  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(`${SALIDA}/${archivoXml(raiz)}`, firmado);
  console.log(`${VERDE}  ✓${FIN} Empaquetado como ${archivoZip(raiz)}.`);

  console.log(`\n${GRIS}  Enviando a SUNAT…${FIN}`);
  const cdrB64 = await sendBill(config, archivoZip(raiz), zipB64);

  const { nombre, xml: cdrXml } = await extraerCdr(cdrB64);
  writeFileSync(`${SALIDA}/${nombre}`, cdrXml);

  const cdr = leerCdr(cdrXml);
  console.log("");
  if (cdr.aceptado && !cdr.conObservaciones) {
    console.log(`${VERDE}  ✓ ACEPTADO${FIN}  código ${cdr.codigo}`);
  } else if (cdr.aceptado) {
    console.log(`${AMBAR}  ! ACEPTADO CON OBSERVACIONES${FIN}  código ${cdr.codigo}`);
  } else {
    console.log(`${ROJO}  ✗ RECHAZADO${FIN}  código ${cdr.codigo}`);
    process.exitCode = 1;
  }
  console.log(`  ${cdr.descripcion}`);
  for (const obs of cdr.observaciones) console.log(`${AMBAR}    · ${obs}${FIN}`);

  console.log(`\n${GRIS}  Guardados en ${SALIDA}/: ${archivoXml(raiz)} y ${nombre}${FIN}\n`);
}

main().catch((err) => {
  if (err instanceof ErrorSunat) {
    console.log(`\n${ROJO}  ✗ ${err.codigo}${FIN}  ${err.message}`);
    if (err.detalle.codigoSunat) console.log(`${GRIS}    código SUNAT: ${err.detalle.codigoSunat}${FIN}`);
    console.log(`${GRIS}    reintentable: ${err.reintentable} · requiere corrección: ${err.requiereCorreccion}${FIN}\n`);
  } else {
    console.error(`\n${ROJO}  ${err instanceof Error ? err.message : String(err)}${FIN}\n`);
  }
  process.exit(1);
});
