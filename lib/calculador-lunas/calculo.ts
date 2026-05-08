import type { TarifaLunaRow, Desglose } from "./types";

// Valores por defecto — se usan como estado inicial en el shell antes de que
// carguen los datos del API. Los ids (1-25) coinciden con el seed de la BD.
export const TARIFAS_DEFAULT: TarifaLunaRow[] = [
  // Esfera 0 – 2
  { id:  1, esfMin: 0.00, esfMax: 2.00, cilMin: 0.00, cilMax: 2.00, poli: 47.5, foto: 62.5 },
  { id:  2, esfMin: 0.00, esfMax: 2.00, cilMin: 2.25, cilMax: 3.99, poli: 57.5, foto: 62.5 },
  { id:  3, esfMin: 0.00, esfMax: 2.00, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 70.0 },
  { id:  4, esfMin: 0.00, esfMax: 2.00, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 75.0 },
  { id:  5, esfMin: 0.00, esfMax: 2.00, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 75.0 },
  // Esfera 2.25 – 3.99
  { id:  6, esfMin: 2.25, esfMax: 3.00, cilMin: 0.00, cilMax: 2.00, poli: 57.5, foto: 60.0 },
  { id:  7, esfMin: 2.25, esfMax: 3.99, cilMin: 2.25, cilMax: 3.99, poli: 57.5, foto: 65.0 },
  { id:  8, esfMin: 2.25, esfMax: 3.99, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 65.0 },
  { id:  9, esfMin: 3.00, esfMax: 3.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
  { id: 10, esfMin: 3.00, esfMax: 3.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
  // Esfera 4.00 – 4.99
  { id: 11, esfMin: 4.00, esfMax: 4.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
  { id: 12, esfMin: 4.00, esfMax: 4.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
  { id: 13, esfMin: 4.00, esfMax: 4.99, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 70.0 },
  { id: 14, esfMin: 4.00, esfMax: 4.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
  { id: 15, esfMin: 4.00, esfMax: 4.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 75.0 },
  // Esfera 5.00 – 5.99
  { id: 16, esfMin: 5.00, esfMax: 5.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
  { id: 17, esfMin: 5.00, esfMax: 5.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
  { id: 18, esfMin: 5.00, esfMax: 5.99, cilMin: 4.00, cilMax: 4.99, poli: 67.5, foto: 70.0 },
  { id: 19, esfMin: 5.00, esfMax: 5.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
  { id: 20, esfMin: 5.00, esfMax: 5.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
  // Esfera 6.00 – 6.99
  { id: 21, esfMin: 6.00, esfMax: 6.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
  { id: 22, esfMin: 6.00, esfMax: 6.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
  { id: 23, esfMin: 6.00, esfMax: 6.99, cilMin: 4.00, cilMax: 4.99, poli: 67.5, foto: 70.0 },
  { id: 24, esfMin: 6.00, esfMax: 6.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
  { id: 25, esfMin: 6.00, esfMax: 6.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
];

function precioPorOjo(
  esfera: number,
  cilindro: number,
  tipo: "policarbonato" | "fotocromatico",
  tarifas: TarifaLunaRow[],
): number {
  const esf = Math.abs(esfera);
  const cil = Math.abs(cilindro);
  const row = tarifas.find(
    (r) => r.esfMin <= esf && esf <= r.esfMax && r.cilMin <= cil && cil <= r.cilMax,
  );
  if (!row) return 0;
  return tipo === "policarbonato" ? row.poli : row.foto;
}

export function calcularDesglose(
  odSphere: string,
  odCylinder: string,
  oiSphere: string,
  oiCylinder: string,
  tarifas: TarifaLunaRow[],
): Desglose {
  const hasOD = odSphere !== "" && odSphere !== "—";
  const hasOI = oiSphere !== "" && oiSphere !== "—";
  if (!hasOD && !hasOI) return { totalPoli: 0, totalFoto: 0, hasValues: false };

  const parse = (v: string) => Math.abs(parseFloat(v) || 0);

  const calcTotal = (tipo: "policarbonato" | "fotocromatico") => {
    const pOD = hasOD ? precioPorOjo(parse(odSphere), parse(odCylinder), tipo, tarifas) : 0;
    const pOI = hasOI ? precioPorOjo(parse(oiSphere), parse(oiCylinder), tipo, tarifas) : 0;
    return (pOD + pOI) * 2;
  };

  return {
    totalPoli: calcTotal("policarbonato"),
    totalFoto: calcTotal("fotocromatico"),
    hasValues: true,
  };
}
