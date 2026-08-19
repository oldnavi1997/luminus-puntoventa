/**
 * Configuración de emisión electrónica — SEE Del Contribuyente.
 *
 * Todo lo sensible (certificado, clave, credenciales SOL) vive SÓLO aquí y sólo
 * se lee en el servidor. Nada de esto puede cruzar a un componente de cliente.
 *
 * Endpoints tomados de la documentación oficial de SUNAT (cpe.sunat.gob.pe,
 * "Servicios web disponibles"), no de tutoriales.
 */

export type AmbienteSunat = "beta" | "produccion";

/** Endpoints del servicio de comprobantes (facturas, boletas, notas, resúmenes). */
const ENDPOINTS: Record<AmbienteSunat, { comprobantes: string; consultaCdr: string }> = {
  beta: {
    comprobantes: "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
    consultaCdr: "https://e-beta.sunat.gob.pe/ol-it-wsconscpegem-beta/billConsultService",
  },
  produccion: {
    comprobantes: "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
    consultaCdr: "https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService",
  },
};

export interface ConfigSunat {
  ambiente: AmbienteSunat;
  endpoints: { comprobantes: string; consultaCdr: string };

  /** RUC del emisor. */
  ruc: string;
  razonSocial: string;
  nombreComercial: string;

  /** Domicilio fiscal, para el bloque del emisor en el UBL. */
  domicilio: {
    /** Código de establecimiento asignado por SUNAT. "0000" = domicilio fiscal. */
    codigoEstablecimiento: string;
    direccion: string;
    ubigeo: string;
    departamento: string;
    provincia: string;
    distrito: string;
    pais: string;
  };

  /** Credenciales del usuario SOL secundario, para el WSSE UsernameToken. */
  sol: { usuario: string; clave: string };

  /** El .pfx/.p12 en crudo, ya decodificado. Nunca se escribe a disco. */
  certificado: { pfx: Buffer; clave: string };
}

function requerido(nombre: string): string {
  const v = process.env[nombre];
  if (!v || v.trim() === "") {
    throw new ErrorConfigSunat(
      `Falta la variable de entorno ${nombre}. Revisa .env.example y complétala antes de emitir.`,
    );
  }
  return v.trim();
}

function opcional(nombre: string, porDefecto: string): string {
  const v = process.env[nombre];
  return v && v.trim() !== "" ? v.trim() : porDefecto;
}

export class ErrorConfigSunat extends Error {
  readonly codigo = "CONFIG_INVALIDA";
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfigSunat";
  }
}

/**
 * Carga el certificado desde base64 (producción) o desde una ruta (desarrollo).
 *
 * En Railway el filesystem es efímero: no hay dónde dejar un .pfx de forma
 * persistente ni segura, así que el camino real es la variable en base64. La
 * ruta existe sólo para trabajar cómodo en local.
 */
function cargarPfx(): Buffer {
  const b64 = process.env.SUNAT_CERTIFICATE_B64?.trim();
  if (b64) {
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) {
      throw new ErrorConfigSunat("SUNAT_CERTIFICATE_B64 no es base64 válido.");
    }
    return buf;
  }

  const ruta = process.env.SUNAT_CERTIFICATE_PATH?.trim();
  if (!ruta) {
    throw new ErrorConfigSunat(
      "Falta el certificado: define SUNAT_CERTIFICATE_B64 (recomendado) o SUNAT_CERTIFICATE_PATH.",
    );
  }

  // El import es dinámico y va dentro de la rama de la ruta a propósito: así el
  // bundle del servidor no arrastra `fs` cuando sólo se usa base64.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  try {
    return fs.readFileSync(ruta);
  } catch {
    throw new ErrorConfigSunat(`No se pudo leer el certificado en ${ruta}.`);
  }
}

let cache: ConfigSunat | null = null;

/**
 * Construye la configuración y valida lo que falte.
 *
 * Se resuelve en la primera llamada, no al importar el módulo: si validara al
 * importar, un `next build` sin variables de entorno fallaría entero.
 */
export function getConfigSunat(): ConfigSunat {
  if (cache) return cache;

  const ambienteRaw = opcional("SUNAT_ENV", "beta");
  if (ambienteRaw !== "beta" && ambienteRaw !== "produccion") {
    throw new ErrorConfigSunat(`SUNAT_ENV debe ser "beta" o "produccion", llegó "${ambienteRaw}".`);
  }
  const ambiente: AmbienteSunat = ambienteRaw;

  const ruc = requerido("SUNAT_RUC");
  if (!/^\d{11}$/.test(ruc)) {
    throw new ErrorConfigSunat(`SUNAT_RUC debe tener 11 dígitos, llegó "${ruc}".`);
  }

  cache = {
    ambiente,
    endpoints: ENDPOINTS[ambiente],
    ruc,
    razonSocial: requerido("SUNAT_RAZON_SOCIAL"),
    nombreComercial: opcional("SUNAT_NOMBRE_COMERCIAL", requerido("SUNAT_RAZON_SOCIAL")),
    domicilio: {
      codigoEstablecimiento: opcional("SUNAT_COD_ESTABLECIMIENTO", "0000"),
      direccion: requerido("SUNAT_DIRECCION"),
      ubigeo: requerido("SUNAT_UBIGEO"),
      departamento: opcional("SUNAT_DEPARTAMENTO", "LIMA"),
      provincia: opcional("SUNAT_PROVINCIA", "LIMA"),
      distrito: opcional("SUNAT_DISTRITO", "LIMA"),
      pais: opcional("SUNAT_PAIS", "PE"),
    },
    sol: {
      usuario: requerido("SUNAT_SOL_USER"),
      clave: requerido("SUNAT_SOL_PASSWORD"),
    },
    certificado: {
      pfx: cargarPfx(),
      clave: process.env.SUNAT_CERTIFICATE_PASSWORD ?? "",
    },
  };

  return cache;
}

/** Sólo para las pruebas: olvida la configuración memorizada. */
export function _resetConfigSunat(): void {
  cache = null;
}

/**
 * Usuario del WSSE: SUNAT espera RUC + usuario SOL concatenados.
 * Ej. RUC 20609242753 + usuario "MODDATOS" → "20609242753MODDATOS".
 */
export function usuarioWsse(config: ConfigSunat): string {
  return `${config.ruc}${config.sol.usuario}`;
}
