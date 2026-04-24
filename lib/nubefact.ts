import type { NubefactBoletaPayload } from "./sunat";

const BASE_URL = process.env.NUBEFACT_BASE_URL
  ?? `https://demo.api.nubefact.com/api/v1/${process.env.NUBEFACT_RUC}`;

const TOKEN = process.env.NUBEFACT_TOKEN!;

export interface NubefactResponse {
  aceptada_por_sunat: boolean;
  enlace_del_pdf: string;
  enlace_del_xml: string;
  codigo_hash: string;
  qr: string;
  cadena_para_codigo_qr: string;
  sunat_description: string;
  sunat_responsecode: string;
  errors?: string[];
}

async function post(body: unknown): Promise<NubefactResponse> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nubefact ${res.status}: ${text}`);
  }

  return res.json() as Promise<NubefactResponse>;
}

export async function emitirDocumento(
  payload: NubefactBoletaPayload
): Promise<NubefactResponse> {
  return post(payload);
}

export interface NubefactAnulacionResponse {
  aceptada_por_sunat: boolean;
  sunat_description: string;
  errors?: string[];
}

export async function anularDocumento(params: {
  tipo: 1 | 2;
  serie: string;
  correlativo: number;
  motivo: string;
}): Promise<NubefactAnulacionResponse> {
  return post({
    operacion: "generar_anulacion",
    tipo_de_comprobante: params.tipo,
    serie: params.serie,
    numero: params.correlativo,
    motivo: params.motivo,
  }) as Promise<NubefactAnulacionResponse>;
}
