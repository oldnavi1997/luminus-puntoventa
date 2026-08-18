/**
 * Resolucion de un documento de identidad a los datos de su titular.
 *
 * Orden: cache local en `Customer` -> proveedor externo (ApiSunat) -> upsert de
 * la cache. Nunca lanza: si el proveedor falla o no encuentra nada devuelve null,
 * para que quien llame decida (no hay reintento ni logging aqui).
 *
 * Lo usan el endpoint /api/clientes y el lote de resolucion del Historial.
 */

import { prisma } from "@/lib/prisma";
import { consultarDNI, consultarRUC } from "@/lib/apisunat";
import { esDNI, esConsultable } from "@/lib/documento";

export type DocumentoResuelto = {
  id?: string;
  docType: string;
  docNumber: string;
  name: string;
  address?: string | null;
};

export async function resolverDocumento(docNumber: string): Promise<DocumentoResuelto | null> {
  const n = docNumber.trim();

  // La cache no distingue docType a proposito: el numero es lo que el operador teclea.
  const existing = await prisma.customer.findFirst({ where: { docNumber: n } });
  if (existing) return existing;

  if (!esConsultable(n)) return null;

  let datos: DocumentoResuelto | null = null;

  if (esDNI(n)) {
    const data = await consultarDNI(n);
    if (data) {
      const name = [data.apellido_paterno, data.apellido_materno, data.nombres]
        .filter(Boolean)
        .join(" ");
      if (name) datos = { docType: "DNI", docNumber: data.dni ?? n, name };
    }
  } else {
    const data = await consultarRUC(n);
    if (data) {
      const name = data.razon_social ?? data.nombre_comercial;
      if (name) {
        datos = { docType: "RUC", docNumber: data.ruc ?? n, name, address: data.direccion };
      }
    }
  }

  if (!datos) return null;

  try {
    return await prisma.customer.upsert({
      where: { docType_docNumber: { docType: datos.docType, docNumber: datos.docNumber } },
      create: { docType: datos.docType, docNumber: datos.docNumber, name: datos.name, address: datos.address ?? null },
      update: { name: datos.name, address: datos.address ?? null },
    });
  } catch {
    // Si la cache falla, el dato consultado sigue siendo util.
    return datos;
  }
}
