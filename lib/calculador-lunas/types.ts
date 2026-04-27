export interface LensCatalogRow {
  id: string;
  nombre: string;
  nota: string | null;
  ar16: number | null;
  arsy: number | null;
  arshapire: number | null;
  sortOrder: number;
}

export interface FabricationCostRow {
  id: number;
  label: string;
  costOd: number;
  costOi: number;
}

export interface LunaSinMedidaRow {
  id: string;
  nombre: string;
  precio: number;
  sortOrder: number;
}

export interface Desglose {
  pOdEsf: number;
  pOdCil: number;
  pOiEsf: number;
  pOiCil: number;
  subtotalOD: number;
  subtotalOI: number;
  total: number;
  hasValues: boolean;
}
