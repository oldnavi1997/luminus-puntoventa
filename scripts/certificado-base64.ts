/**
 * Convierte el certificado a base64 para pegarlo en Railway.
 *
 * En Railway el filesystem es efímero: no hay dónde dejar el .p12, así que el
 * certificado viaja dentro de una variable de entorno.
 *
 * El resultado NO se imprime por pantalla — se escribe en un archivo local que
 * está en .gitignore. Así el certificado no queda en el historial de la
 * terminal, ni en logs, ni en una conversación.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/certificado-base64.ts
 *   npx tsx scripts/certificado-base64.ts ruta/al/certificado.p12
 */

import { readFileSync, writeFileSync } from "node:fs";

const GRIS = "\x1b[90m";
const VERDE = "\x1b[32m";
const AMBAR = "\x1b[33m";
const FIN = "\x1b[0m";

const SALIDA = ".sunat-pruebas/certificado-base64.txt";

const ruta = process.argv[2] ?? process.env.SUNAT_CERTIFICATE_PATH?.trim();
if (!ruta) {
  console.error(
    "\nIndica la ruta del certificado como argumento, o define SUNAT_CERTIFICATE_PATH en .env.local.\n",
  );
  process.exit(1);
}

const pfx = readFileSync(ruta);
const b64 = pfx.toString("base64");

writeFileSync(SALIDA, b64);

console.log(`\n${VERDE}  ✓${FIN} Certificado codificado.`);
console.log(`${GRIS}    origen : ${ruta} (${(pfx.length / 1024).toFixed(1)} KB)`);
console.log(`    salida : ${SALIDA} (${b64.length} caracteres)${FIN}`);
console.log(`\n  Copia el contenido de ese archivo en la variable ${VERDE}SUNAT_CERTIFICATE_B64${FIN} de Railway.`);
console.log(`${AMBAR}  Bórralo cuando termines: el archivo contiene tu clave privada.${FIN}\n`);
