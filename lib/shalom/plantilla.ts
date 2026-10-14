import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { ORIGEN_SHALOM, type Mercaderia } from "./catalogo";

/**
 * Carga masiva de envíos en la web de Shalom.
 *
 * Se rellena SU plantilla (`plantilla.xlsx`), no se arma un Excel nuevo: trae
 * la lista de agencias en una hoja oculta, validaciones en ORIGEN, DESTINO y
 * MERCADERIA, y las fórmulas de medidas. Para no perder nada de eso se edita
 * el XML de la hoja 1 fila a fila y el resto del archivo viaja intacto.
 */

/**
 * Alto, ancho, largo y peso de cada tamaño: los mismos números que las
 * fórmulas de la plantilla. Hacen falta para escribir el valor calculado junto
 * a la fórmula, porque quien lee el archivo sin abrirlo en Excel —el cargador
 * de Shalom, probablemente— no la recalcula y vería ceros.
 */
const MEDIDAS: Record<Mercaderia, [number, number, number, number]> = {
  SOBRE: [0.1, 0.1, 0.15, 0],
  "PAQUETE XXS": [0.15, 0.1, 0.1, 0.25],
  "PAQUETE XS": [0.2, 0.15, 0.12, 0.5],
  "PAQUETE S": [0.3, 0.3, 0.12, 2],
  "PAQUETE M": [0.3, 0.24, 0.2, 5],
  "PAQUETE L": [0.42, 0.3, 0.23, 10],
};

/** Las fórmulas de las columnas I a L, copiadas de la plantilla. `{n}` es la fila. */
const FORMULAS: Record<"I" | "J" | "K" | "L", string> = {
  I: 'IF(H{n}="SOBRE",0.1,IF(H{n}="PAQUETE XXS",0.15,IF(H{n}="PAQUETE XS",0.2,IF(H{n}="PAQUETE S",0.3,IF(H{n}="PAQUETE M",0.3,IF(H{n}="PAQUETE L",0.42,""))))))',
  J: 'IF(H{n}="SOBRE",0.1,IF(H{n}="PAQUETE XXS",0.1,IF(H{n}="PAQUETE XS",0.15,IF(H{n}="PAQUETE S",0.3,IF(H{n}="PAQUETE M",0.24,IF(H{n}="PAQUETE L",0.3,""))))))',
  K: 'IF(H{n}="SOBRE",0.15,IF(H{n}="PAQUETE XXS",0.1,IF(H{n}="PAQUETE XS",0.12,IF(H{n}="PAQUETE S",0.12,IF(H{n}="PAQUETE M",0.2,IF(H{n}="PAQUETE L",0.23,""))))))',
  L: 'IF(H{n}="SOBRE",0,IF(H{n}="PAQUETE XXS",0.25,IF(H{n}="PAQUETE XS",0.5,IF(H{n}="PAQUETE S",2,IF(H{n}="PAQUETE M",5,IF(H{n}="PAQUETE L",10,""))))))',
};

/** Las fórmulas llegan hasta la fila 499: caben 498 envíos por archivo. */
export const MAX_FILAS = 498;

export interface FilaShalom {
  /** Número de documento del destinatario. */
  documento: string;
  celular: string;
  destino: string;
  mercaderia: Mercaderia;
  cantidad: number;
}

const xml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Un número si son solo cifras, como en el ejemplo de la plantilla; texto si
 * no. Un cero inicial también va como texto: hay DNIs que empiezan por 0 y
 * como número lo perderían.
 */
function celdaDato(ref: string, valor: string, estilo: string): string {
  const limpio = valor.replace(/\s+/g, "");
  if (/^[1-9]\d{0,14}$/.test(limpio)) return `<c r="${ref}" s="${estilo}"><v>${limpio}</v></c>`;
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t>${xml(valor)}</t></is></c>`;
}

const texto = (ref: string, valor: string) =>
  `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;

function formula(col: keyof typeof FORMULAS, n: number, valor: number | null): string {
  const f = xml(FORMULAS[col].replaceAll("{n}", String(n)));
  return valor === null
    ? `<c r="${col}${n}" s="3" t="str"><f>${f}</f><v></v></c>`
    : `<c r="${col}${n}" s="3"><f>${f}</f><v>${valor}</v></c>`;
}

/** La fila `n` de la hoja, con los mismos estilos que trae la plantilla. */
function fila(n: number, d: FilaShalom | null): string {
  const medidas = d ? MEDIDAS[d.mercaderia] : null;
  const celdas = d
    ? [
        celdaDato(`A${n}`, d.documento, "4"),
        celdaDato(`B${n}`, d.celular, "4"),
        `<c r="C${n}" s="4"/>`,
        `<c r="D${n}" s="4"/>`,
        `<c r="E${n}" s="4"/>`,
        texto(`F${n}`, ORIGEN_SHALOM),
        texto(`G${n}`, d.destino),
        texto(`H${n}`, d.mercaderia),
      ]
    : ["A", "B", "C", "D", "E"]
        .map((c) => `<c r="${c}${n}" s="4"/>`)
        .concat(["F", "G", "H"].map((c) => `<c r="${c}${n}" s="1"/>`));
  const cols = ["I", "J", "K", "L"] as const;
  cols.forEach((c, i) => celdas.push(formula(c, n, medidas ? medidas[i] : null)));
  celdas.push(d ? `<c r="M${n}" s="1"><v>${d.cantidad}</v></c>` : `<c r="M${n}" s="1"/>`);
  return `<row r="${n}" spans="1:14">${celdas.join("")}</row>`;
}

/** Devuelve el .xlsx listo para subir a la web de Shalom. */
export async function generarPlantillaShalom(filas: FilaShalom[]): Promise<Buffer> {
  if (filas.length > MAX_FILAS) {
    throw new Error(`La plantilla de Shalom admite ${MAX_FILAS} envíos por archivo`);
  }

  const original = await readFile(path.join(process.cwd(), "lib", "shalom", "plantilla.xlsx"));
  const zip = await JSZip.loadAsync(original);
  const ruta = "xl/worksheets/sheet1.xml";
  let hoja = await zip.file(ruta)!.async("string");

  // La fila 2 trae un ejemplo (DNI 70503353 a JAEN): se reescribe siempre,
  // con un envío o vacía, para que no se suba por error.
  const total = Math.max(filas.length, 1);
  for (let i = 0; i < total; i++) {
    const n = i + 2;
    const patron = new RegExp(`<row r="${n}"[^>]*>[\\s\\S]*?</row>`);
    if (!patron.test(hoja)) throw new Error(`La plantilla no tiene la fila ${n}`);
    // Con función: un `$` en un nombre no se interpreta como patrón de reemplazo.
    hoja = hoja.replace(patron, () => fila(n, filas[i] ?? null));
  }

  zip.file(ruta, hoja);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
