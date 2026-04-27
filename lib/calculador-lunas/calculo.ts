import type { FabricationCostRow, Desglose } from "./types";

export function calcularPrecio(
  esfera: number,
  cilindro: number,
  esOI: boolean,
  costos: FabricationCostRow[]
): number {
  const esfFloor = Math.floor(esfera);
  const cilFloor = Math.floor(cilindro);
  let rowId: number;

  if (esfFloor <= 2) {
    if (cilFloor <= 1)       rowId = 1;
    else if (cilFloor <= 3)  rowId = 2;
    else if (cilFloor === 4) rowId = 3;
    else if (cilFloor === 5) rowId = 4;
    else                     rowId = 5;
  } else if (esfFloor === 3) {
    if (cilFloor <= 3)       rowId = 6;
    else if (cilFloor === 4) rowId = 7;
    else                     rowId = 8;
  } else if (esfFloor === 4 && cilFloor === 4) {
    rowId = 9;
  } else {
    rowId = 10;
  }

  const row = costos.find((c) => c.id === rowId)!;
  return esOI ? row.costOi : row.costOd;
}

export function calcularDesglose(
  odSphere: string,
  odCylinder: string,
  oiSphere: string,
  oiCylinder: string,
  costos: FabricationCostRow[]
): Desglose {
  const hasOD = odSphere !== "";
  const hasOI = oiSphere !== "";
  const hasValues = hasOD || hasOI;

  if (!hasValues || costos.length === 0) {
    return { pOdEsf: 0, pOdCil: 0, pOiEsf: 0, pOiCil: 0, subtotalOD: 0, subtotalOI: 0, total: 0, hasValues: false };
  }

  const absODEsf = Math.abs(parseFloat(odSphere) || 0);
  const absODCil = Math.abs(parseFloat(odCylinder) || 0);
  const absOIEsf = Math.abs(parseFloat(oiSphere) || 0);
  const absOICil = Math.abs(parseFloat(oiCylinder) || 0);

  const pOdEsf = hasOD ? calcularPrecio(absODEsf, absODCil, false, costos) : 0;
  const pOdCil = hasOD ? calcularPrecio(absODEsf, absODCil, false, costos) : 0;
  const pOiEsf = hasOI ? calcularPrecio(absOIEsf, absOICil, true, costos) : 0;
  const pOiCil = hasOI ? calcularPrecio(absOIEsf, absOICil, true, costos) : 0;

  const subtotalOD = hasOD ? pOdEsf + pOdCil : 0;
  const subtotalOI = hasOI ? pOiEsf + pOiCil : 0;

  return { pOdEsf, pOdCil, pOiEsf, pOiCil, subtotalOD, subtotalOI, total: subtotalOD + subtotalOI, hasValues: true };
}
