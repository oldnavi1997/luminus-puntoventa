import { AGENCIAS_SHALOM } from "./agencias";

/**
 * Lo que el navegador también necesita saber de Shalom. Aparte de
 * `plantilla.ts`, que lee el disco y solo corre en el servidor.
 */

/** La agencia donde Luminus deja los paquetes. Texto exacto de la lista de Shalom. */
export const ORIGEN_SHALOM = "ASOC LAS FLORES -  AV 54";

export const MERCADERIAS = [
  "SOBRE",
  "PAQUETE XXS",
  "PAQUETE XS",
  "PAQUETE S",
  "PAQUETE M",
  "PAQUETE L",
] as const;
export type Mercaderia = (typeof MERCADERIAS)[number];

/** El tamaño que sale si la venta no dice otra cosa; se cambia por venta. */
export const MERCADERIA_POR_DEFECTO: Mercaderia = "PAQUETE XXS";

export function esAgenciaShalom(destino: string): boolean {
  return AGENCIAS_SHALOM.includes(destino);
}

/**
 * Busca agencias por texto, sin importar mayúsculas, tildes ni espacios
 * repetidos. Devuelve el nombre tal cual lo tiene Shalom.
 */
export function buscarAgenciasShalom(consulta: string, limite = 8): string[] {
  const plano = (t: string) =>
    t.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
  const q = plano(consulta);
  if (!q) return [];
  const palabras = q.split(" ");
  const empiezan: string[] = [];
  const contienen: string[] = [];
  for (const a of AGENCIAS_SHALOM) {
    const p = plano(a);
    if (!palabras.every((w) => p.includes(w))) continue;
    if (p.startsWith(q)) empiezan.push(a);
    else contienen.push(a);
  }
  return [...empiezan, ...contienen].slice(0, limite);
}
