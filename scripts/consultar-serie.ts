/**
 * Pregunta a SUNAT qué correlativos de una serie ya están tomados.
 *
 * Es la alternativa a averiguarlo emitiendo. Cada intento contra un número que
 * SUNAT ya tiene informado lo quema para siempre (1032/1033), así que cuando
 * una serie viene de un sistema anterior —y no se sabe dónde quedó— adivinar de
 * uno en uno cuesta un correlativo por intento. Esto no emite nada.
 *
 * Uso:
 *   npx tsx --env-file=.env.sunat-prod scripts/consultar-serie.ts B001 1 120
 *   npx tsx --env-file=.env.sunat-prod scripts/consultar-serie.ts F001 1 40 factura
 *
 * El fichero de entorno va aparte de .env.local a propósito: esto necesita las
 * credenciales de PRODUCCIÓN, y dejarlas en .env.local convertiría cualquier
 * `npm run dev` posterior en un emisor de comprobantes reales.
 */

import { getConfigSunat } from "../lib/sunat/config";
import { consultarComprobante } from "../lib/sunat/cliente-soap";
import { TIPO_DOCUMENTO } from "../lib/sunat/catalogos";
import { ErrorSunat } from "../lib/sunat/errores";

const VERDE = "\x1b[32m", ROJO = "\x1b[31m", AMBAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";

async function main() {
  const serie = process.argv[2];
  const desde = Number(process.argv[3] ?? 1);
  const hasta = Number(process.argv[4] ?? 100);
  const tipo = (process.argv[5] ?? "boleta").toLowerCase() === "factura"
    ? TIPO_DOCUMENTO.FACTURA
    : TIPO_DOCUMENTO.BOLETA;

  if (!serie || !Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde) {
    console.error("Uso: consultar-serie.ts <serie> [desde] [hasta] [boleta|factura]");
    process.exit(1);
  }

  const config = getConfigSunat();
  console.log(`\nConsultando ${serie}-${desde}..${hasta} del RUC ${config.ruc} (${config.ambiente}).`);
  console.log(`${GRIS}No se emite nada; sólo se pregunta.${FIN}\n`);

  let ultimoTomado = 0;
  const libres: number[] = [];

  for (let n = desde; n <= hasta; n++) {
    let estado;
    try {
      estado = await consultarComprobante(config, { tipo, serie, numero: n });
    } catch (err) {
      // Sin el permiso de consulta la respuesta es un fault de credenciales, y
      // seguir preguntando 100 veces sólo repetiría el mismo error.
      if (err instanceof ErrorSunat && err.codigo === "CREDENCIALES") {
        console.error(`\n${ROJO}✗${FIN} ${err.message}`);
        console.error(
          `${AMBAR}  El usuario SOL necesita además el permiso de consultar validez de CPE.${FIN}`,
        );
        process.exit(1);
      }
      throw err;
    }

    if (estado.existe) {
      ultimoTomado = n;
      console.log(`  ${ROJO}●${FIN} ${serie}-${n}  ${GRIS}${estado.codigo} ${estado.mensaje}${FIN}`);
    } else {
      libres.push(n);
      console.log(`  ${VERDE}○${FIN} ${serie}-${n}  ${GRIS}libre${FIN}`);
    }
  }

  console.log();
  if (ultimoTomado === 0) {
    console.log(`${VERDE}Ningún correlativo del rango está tomado.${FIN}`);
  } else {
    console.log(`Último tomado en el rango: ${ROJO}${serie}-${ultimoTomado}${FIN}`);
    console.log(
      `Para continuar la serie: ${VERDE}UPDATE "DocumentSerie" SET "lastNumber" = ${ultimoTomado} ` +
        `WHERE serie = '${serie}';${FIN}`,
    );
    if (ultimoTomado === hasta) {
      console.log(
        `${AMBAR}Ojo: el último del rango está tomado, así que la serie puede seguir más allá. ` +
          `Repite con un rango mayor.${FIN}`,
      );
    }
  }
  const huecos = libres.filter((n) => n < ultimoTomado);
  if (huecos.length) {
    console.log(`${GRIS}Huecos por debajo del último: ${huecos.join(", ")}${FIN}`);
  }
}

main().catch((err) => {
  console.error(`\n${ROJO}✗${FIN} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
