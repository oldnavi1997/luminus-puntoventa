/**
 * Diagnóstico del certificado digital, de sólo lectura.
 *
 * Responde lo primero que hay que saber antes de escribir una línea de firma:
 * ¿el .pfx abre?, ¿la contraseña es la correcta?, ¿está vigente?, ¿el RUC del
 * certificado coincide con el que vamos a emitir?
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/diagnostico-certificado.ts
 *   npx tsx scripts/diagnostico-certificado.ts ruta/al/certificado.pfx
 *
 * La contraseña se toma de SUNAT_CERTIFICATE_PASSWORD. Este script nunca
 * imprime la clave, ni la clave privada, ni el contenido del certificado.
 */

import { readFileSync } from "node:fs";
import { cargarCertificado, ErrorCertificado, verificarVigencia } from "../lib/sunat/certificado";

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const AMBAR = "\x1b[33m";
const GRIS = "\x1b[90m";
const FIN = "\x1b[0m";

function ok(msg: string) { console.log(`${VERDE}  ✓${FIN} ${msg}`); }
function mal(msg: string) { console.log(`${ROJO}  ✗${FIN} ${msg}`); }
function avisa(msg: string) { console.log(`${AMBAR}  !${FIN} ${msg}`); }

function leerPfx(rutaArg?: string): { datos: Buffer; origen: string } {
  if (rutaArg) return { datos: readFileSync(rutaArg), origen: rutaArg };

  const b64 = process.env.SUNAT_CERTIFICATE_B64?.trim();
  if (b64) return { datos: Buffer.from(b64, "base64"), origen: "SUNAT_CERTIFICATE_B64" };

  const ruta = process.env.SUNAT_CERTIFICATE_PATH?.trim();
  if (ruta) return { datos: readFileSync(ruta), origen: ruta };

  throw new Error(
    "No hay certificado que revisar. Pasa la ruta como argumento, o define " +
      "SUNAT_CERTIFICATE_B64 o SUNAT_CERTIFICATE_PATH en .env.local.",
  );
}

function main() {
  console.log("\nDiagnóstico del certificado digital\n");

  const { datos, origen } = leerPfx(process.argv[2]);
  console.log(`${GRIS}  origen: ${origen} (${(datos.length / 1024).toFixed(1)} KB)${FIN}\n`);

  const clave = process.env.SUNAT_CERTIFICATE_PASSWORD ?? "";
  if (clave === "") {
    avisa("SUNAT_CERTIFICATE_PASSWORD está vacía; se intentará abrir sin contraseña.");
  }

  let cert;
  try {
    cert = cargarCertificado(datos, clave);
    ok("El contenedor PKCS#12 abre correctamente.");
  } catch (err) {
    if (err instanceof ErrorCertificado) {
      mal(`No abre — ${err.codigo}`);
      console.log(`\n  ${err.message}\n`);
      if (err.codigo === "CIFRADO_NO_SOPORTADO") {
        console.log(`${GRIS}  Es el caso típico de los .pfx hechos con OpenSSL 3.x. Re-empaquetarlo`);
        console.log(`  no altera el certificado ni la clave, sólo el cifrado del contenedor.${FIN}\n`);
      }
      process.exit(1);
    }
    throw err;
  }

  ok(`Clave privada encontrada y contraseña correcta.`);

  console.log(`\n${GRIS}  Titular:${FIN} ${cert.subjectName}`);
  console.log(`${GRIS}  Emisor: ${FIN} ${cert.emisor}`);
  console.log(`${GRIS}  Serie:  ${FIN} ${cert.numeroSerie}`);
  console.log(
    `${GRIS}  Vigencia:${FIN} ${cert.validoDesde.toLocaleDateString("es-PE")} → ${cert.validoHasta.toLocaleDateString("es-PE")}`,
  );
  console.log("");

  try {
    verificarVigencia(cert);
    const dias = Math.floor((cert.validoHasta.getTime() - Date.now()) / 86_400_000);
    if (dias <= 30) avisa(`Vigente, pero vence en ${dias} días. Ve gestionando la renovación.`);
    else ok(`Vigente, le quedan ${dias} días.`);
  } catch (err) {
    mal(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }

  const rucEsperado = process.env.SUNAT_RUC?.trim();
  if (!cert.rucDelCertificado) {
    avisa("No se encontró un RUC de 11 dígitos en el titular del certificado.");
  } else if (!rucEsperado) {
    avisa(`El certificado declara el RUC ${cert.rucDelCertificado}, pero SUNAT_RUC no está definido.`);
  } else if (cert.rucDelCertificado !== rucEsperado) {
    mal(
      `El RUC del certificado (${cert.rucDelCertificado}) no coincide con SUNAT_RUC (${rucEsperado}). ` +
        "SUNAT rechazará los comprobantes firmados con él.",
    );
    process.exitCode = 1;
  } else {
    ok(`El RUC del certificado coincide con SUNAT_RUC (${rucEsperado}).`);
  }

  console.log("");
}

try {
  main();
} catch (err) {
  console.error(`\n${ROJO}  ${err instanceof Error ? err.message : String(err)}${FIN}\n`);
  process.exit(1);
}
