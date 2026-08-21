/**
 * Los datos del emisor que van en la cabecera del impreso.
 *
 * **No usa `getConfigSunat()` a propósito.** Esa función construye
 * `certificado: { pfx: cargarPfx() }` dentro del mismo objeto memoizado
 * (`lib/sunat/config.ts:152-155`), así que lanza si falta el certificado o no
 * abre. Sacar de ahí el RUC ataría la reimpresión de comprobantes viejos ya
 * aceptados al estado del certificado — justo cuando más falta hace. Aquí se
 * leen las mismas variables de entorno y nada más.
 *
 * Si alguien "simplifica" esto para reusar la config, un fallo de certificado
 * dejará también sin imprimir. Está avisado.
 */

import type { EmisorImpreso } from "./tipos";

interface Sucursal {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
}

/**
 * Qué local emite cada serie. B001 y F001 son el local principal; B002 es la
 * Tienda Moral. Son los valores que salían en los comprobantes del facturador
 * anterior, y quedan como defaults para que un `.env` sin tocar no regresione.
 *
 * Se sobreescribe entero con `EMPRESA_SUCURSALES`, un JSON con esta misma forma.
 */
const SUCURSALES_POR_DEFECTO: Record<string, Sucursal> = {
  B001: { nombre: "PRINCIPAL", direccion: null, telefono: null },
  F001: { nombre: "PRINCIPAL", direccion: null, telefono: null },
  NV001: { nombre: "PRINCIPAL", direccion: null, telefono: null },
  B002: { nombre: "Tienda Moral", direccion: "Calle Moral 107", telefono: "980246408" },
};

const SUCURSAL_DESCONOCIDA: Sucursal = { nombre: "PRINCIPAL", direccion: null, telefono: null };

function leerSucursales(): Record<string, Sucursal> {
  const crudo = process.env.EMPRESA_SUCURSALES?.trim();
  if (!crudo) return SUCURSALES_POR_DEFECTO;

  try {
    return JSON.parse(crudo) as Record<string, Sucursal>;
  } catch {
    // Un JSON mal escrito no puede impedir imprimir: se avisa y se sigue con
    // los valores conocidos.
    console.error("[impresion] EMPRESA_SUCURSALES no es un JSON válido; se usan los valores por defecto.");
    return SUCURSALES_POR_DEFECTO;
  }
}

function opcional(nombre: string): string | null {
  const v = process.env[nombre]?.trim();
  return v ? v : null;
}

/** Dirección fiscal en una línea, como se imprime. */
function domicilioFiscal(): string {
  const partes = [
    process.env.SUNAT_DIRECCION?.trim(),
    [process.env.SUNAT_DISTRITO?.trim(), process.env.SUNAT_PROVINCIA?.trim(), process.env.SUNAT_DEPARTAMENTO?.trim()]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  return partes.join(" — ");
}

/**
 * @param serie la del documento; decide qué local se imprime.
 */
export function datosEmisor(serie: string): EmisorImpreso {
  const sucursales = leerSucursales();
  const sucursal = sucursales[serie] ?? SUCURSAL_DESCONOCIDA;
  const razonSocial = process.env.SUNAT_RAZON_SOCIAL?.trim() || "";

  return {
    razonSocial,
    nombreComercial: process.env.SUNAT_NOMBRE_COMERCIAL?.trim() || razonSocial,
    ruc: process.env.SUNAT_RUC?.trim() || "",
    domicilioFiscal: domicilioFiscal(),
    sucursal: sucursal.nombre || null,
    direccionSucursal: sucursal.direccion || null,
    telefono: sucursal.telefono || null,
    email: opcional("EMPRESA_EMAIL"),
    // Vacía mientras no se confirme cuál es. Una resolución inventada en un
    // documento tributario es peor que no ponerla.
    resolucion: opcional("SUNAT_RESOLUCION"),
  };
}
