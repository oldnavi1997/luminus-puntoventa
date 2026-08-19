/**
 * Monto en letras.
 *
 * Lo exigen dos sitios: la leyenda 1000 del XML de SUNAT y el ticket impreso.
 * Vivía sólo dentro de `components/pos/Receipt.tsx`; aquí es compartido para no
 * tener dos versiones que se desincronicen.
 */

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS",
  "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];

const DECENAS = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];

const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** Convierte 0–999. */
function grupo(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";

  let texto = "";
  const c = Math.floor(n / 100);
  const resto = n % 100;

  if (c > 0) texto += CENTENAS[c];
  if (resto > 0) {
    if (texto) texto += " ";
    if (resto < 30) {
      texto += UNIDADES[resto];
    } else {
      texto += DECENAS[Math.floor(resto / 10)];
      if (resto % 10 > 0) texto += ` Y ${UNIDADES[resto % 10]}`;
    }
  }
  return texto;
}

/**
 * "UNO" se apocopa delante de MIL y MILLONES: veintiún mil, no veintiuno mil.
 */
function apocopar(texto: string): string {
  if (texto === "UNO") return "UN";
  return texto.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/ Y UNO$/, " Y UN");
}

function convertirEntero(n: number): string {
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];

  if (millones === 1) partes.push("UN MILLÓN");
  else if (millones > 1) partes.push(`${apocopar(convertirEntero(millones))} MILLONES`);

  if (miles === 1) partes.push("MIL");
  else if (miles > 1) partes.push(`${apocopar(grupo(miles))} MIL`);

  if (resto > 0) partes.push(grupo(resto));

  return partes.join(" ");
}

/**
 * Devuelve el monto en el formato que espera SUNAT en la leyenda 1000.
 * Ej. 1354.99 → "MIL TRESCIENTOS CINCUENTA Y CUATRO Y 99/100 SOLES"
 */
export function numeroALetras(monto: number, moneda = "SOLES"): string {
  const redondeado = Math.round(monto * 100) / 100;
  const entero = Math.floor(redondeado);
  const centavos = Math.round((redondeado - entero) * 100);
  return `${convertirEntero(entero)} Y ${String(centavos).padStart(2, "0")}/100 ${moneda}`;
}
