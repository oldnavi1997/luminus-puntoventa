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

// ─── Consulta de personas y empresas ─────────────────────────────────────────

const LOOKUP_BASE_URL = process.env.APISUNAT_BASE_URL
  ? new URL(process.env.APISUNAT_BASE_URL).origin + "/api/v1"
  : "https://dev.apisunat.pe/api/v1";

export interface ApiSunatDniResponse {
  dni: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
}

export interface ApiSunatRucResponse {
  ruc: string;
  razon_social?: string;
  nombre_comercial?: string;
  direccion?: string;
}

export interface ApiSunatVoidResponse {
  success: boolean;
  message: string;
  payload?: {
    estado: "ACEPTADO" | "RECHAZADO";
    hash?: string;
    xml?: string;
    cdr?: string;
  };
}

export async function anularDocumento(params: {
  tipo: 1 | 2;   // 1=FACTURA, 2=BOLETA
  serie: string;
  correlativo: number;
  motivo: string;
}): Promise<ApiSunatVoidResponse> {
  const API_BASE = BASE_URL.replace("/documents", "");

  let body: unknown;
  let url: string;

  if (params.tipo === 1) {
    // FACTURA → /api/v3/voided (comunicacion_baja)
    url = `${API_BASE}/voided`;
    body = {
      documento: "comunicacion_baja",
      motivo: params.motivo,
      documento_afectado: {
        documento: "factura",
        serie: params.serie,
        numero: String(params.correlativo),
      },
    };
  } else {
    // BOLETA → /api/v3/daily-summary (resumen_diario)
    url = `${API_BASE}/daily-summary`;
    body = {
      documento: "resumen_diario",
      documentos_afectados: [
        {
          accion_resumen: "anular",
          documento: "boleta",
          serie: params.serie,
          numero: String(params.correlativo),
        },
      ],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { message?: string }).message ?? ""; }
    catch { detail = await res.text(); }
    throw new Error(`ApiSunat void ${res.status}: ${detail}`);
  }
  return res.json() as Promise<ApiSunatVoidResponse>;
}

export async function consultarDNI(dni: string): Promise<ApiSunatDniResponse | null> {
  try {
    const res = await fetch(`${LOOKUP_BASE_URL}/person/dni/${dni}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    const raw = await res.text();
    if (!res.ok) return null;
    const json = JSON.parse(raw);
    return (json.payload ?? json) as ApiSunatDniResponse;
  } catch {
    return null;
  }
}

export async function consultarRUC(ruc: string): Promise<ApiSunatRucResponse | null> {
  try {
    const res = await fetch(`${LOOKUP_BASE_URL}/business/ruc/${ruc}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    const raw = await res.text();
    if (!res.ok) return null;
    const json = JSON.parse(raw);
    return (json.payload ?? json) as ApiSunatRucResponse;
  } catch {
    return null;
  }
}
