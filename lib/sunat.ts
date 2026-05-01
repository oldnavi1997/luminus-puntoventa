// Cálculo IGV — precios en la DB son IGV-inclusive (precio final al consumidor)
// Base imponible = total / 1.18 | IGV = total - base imponible

import type { ApiSunatLineItem, ApiSunatPayload } from "./apisunat";

export function calcularIGV(totalConIGV: number): {
  baseImponible: number;
  igv: number;
  total: number;
} {
  const baseImponible = Math.round((totalConIGV / 1.18) * 100) / 100;
  const igv = Math.round((totalConIGV - baseImponible) * 100) / 100;
  return { baseImponible, igv, total: totalConIGV };
}

export function precioSinIGV(precioConIGV: number): number {
  return Math.round((precioConIGV / 1.18) * 100) / 100;
}

export function formatCorrelativo(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(8, "0")}`;
}

export function getDocTypeCode(docType: string): string {
  switch (docType) {
    case "RUC":       return "6";
    case "CE":        return "4";
    case "PASAPORTE": return "7";
    default:          return "1"; // DNI
  }
}

function buildLineItem(
  description: string,
  quantity: number,
  unitPriceConIGV: number,
): ApiSunatLineItem {
  return {
    unidad_de_medida: "NIU",
    descripcion: description,
    cantidad: String(quantity),
    valor_unitario: (unitPriceConIGV / 1.18).toFixed(6),
    porcentaje_igv: "18",
    codigo_tipo_afectacion_igv: "10",
    nombre_tributo: "IGV",
  };
}

export function buildApiSunatItems(
  items: { description: string; quantity: number; lineTotal: number }[],
  documentTotal: number,
): ApiSunatLineItem[] {
  const originalTotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountFactor = originalTotal > 0 ? documentTotal / originalTotal : 1;
  return items.map((item) =>
    buildLineItem(
      item.description,
      item.quantity,
      (item.lineTotal * discountFactor) / item.quantity,
    )
  );
}

export function buildApiSunatPayload(params: {
  tipo: 1 | 2; // 1=FACTURA, 2=BOLETA
  serie: string;
  numero: number;
  cliente: {
    docType: string;
    docNumber: string;
    name: string;
    address?: string;
    email?: string;
  };
  items: ApiSunatLineItem[];
  totalConIGV: number;
}): ApiSunatPayload {
  const now = new Date();
  return {
    documento: params.tipo === 1 ? "factura" : "boleta",
    serie: params.serie,
    numero: params.numero,
    fecha_de_emision: now.toISOString().slice(0, 10),
    hora_de_emision: now.toTimeString().slice(0, 8),
    moneda: "PEN",
    tipo_operacion: "0101",
    cliente_tipo_de_documento: getDocTypeCode(params.cliente.docType),
    cliente_numero_de_documento: params.cliente.docNumber || "00000000",
    cliente_denominacion: params.cliente.name || "CLIENTE VARIOS",
    cliente_direccion: params.cliente.address || "-",
    total: params.totalConIGV.toFixed(2),
    items: params.items,
  };
}
