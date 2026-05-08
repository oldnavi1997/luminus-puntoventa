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

export interface TarifaLunaRow {
  id: number;
  esfMin: number;
  esfMax: number;
  cilMin: number;
  cilMax: number;
  poli: number;
  foto: number;
}

export interface Desglose {
  totalPoli: number;
  totalFoto: number;
  hasValues: boolean;
}
