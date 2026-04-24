const BASE_URL =
  process.env.APISUNAT_BASE_URL ?? "https://sandbox.apisunat.pe/api/v3/documents";

const TOKEN = process.env.APISUNAT_TOKEN!;

export type ApiSunatDocType = "boleta" | "factura";

export interface ApiSunatLineItem {
  unidad_de_medida: string;
  descripcion: string;
  cantidad: string;
  valor_unitario: string;             // 6 decimals recommended
  porcentaje_igv: string;             // "18"
  codigo_tipo_afectacion_igv: string; // "10" = gravado
  nombre_tributo: string;             // "IGV"
}

export interface ApiSunatPayload {
  documento: ApiSunatDocType;
  serie: string;
  numero: number;
  fecha_de_emision: string;           // "YYYY-MM-DD"
  hora_de_emision?: string;           // "HH:MM:SS"
  moneda: string;                     // "PEN"
  tipo_operacion: string;             // "0101"
  cliente_tipo_de_documento: string;  // "1"=DNI, "6"=RUC, "4"=CE, "7"=PASAPORTE
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  cliente_direccion: string;
  total: string;                      // "100.00"
  items: ApiSunatLineItem[];
}

export interface ApiSunatResponse {
  success: boolean;
  message: string;
  payload: {
    estado: "ACEPTADO" | "PENDIENTE" | "RECHAZADO";
    hash: string;
    xml: string;
    cdr: string;
    pdf: { ticket: string; a4: string };
  };
}

export async function emitirDocumento(
  payload: ApiSunatPayload
): Promise<ApiSunatResponse> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      detail = await res.text();
    }
    throw new Error(`ApiSunat ${res.status}: ${detail}`);
  }

  return res.json() as Promise<ApiSunatResponse>;
}
