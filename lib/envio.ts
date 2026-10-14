import { z } from "zod";
import { AGENCIAS_SHALOM } from "@/lib/shalom/agencias";
import { MERCADERIAS, MERCADERIA_POR_DEFECTO, type Mercaderia } from "@/lib/shalom/catalogo";

/**
 * Datos de envío de una venta: lo que va en la etiqueta del paquete.
 *
 * Viven en `sale_document_envios`, aparte de la venta, para que el comprobante
 * (el ticket y el PDF) no los imprima nunca. Una venta web no trae fila: la
 * propone su pedido (`propuestaDeEnvio`) hasta que alguien la guarda.
 */

export const COURIERS = ["SHALOM", "OLVA", "OTRO"] as const;
export type CourierPreset = (typeof COURIERS)[number];

export const ETIQUETA_COURIER: Record<CourierPreset, string> = {
  SHALOM: "Shalom",
  OLVA: "Olva Courier",
  OTRO: "Otro",
};

/**
 * Qué es `destino`: la sede de la agencia donde se recoge, o la dirección a la
 * que se entrega (Olva a domicilio).
 */
export const MODALIDADES = ["AGENCIA", "DIRECCION"] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  AGENCIA: "Agencia",
  DIRECCION: "Dirección",
};

/** Shalom solo entrega en agencia; el resto admite las dos. */
export function admiteDomicilio(courier: string): boolean {
  return courier.toUpperCase() !== "SHALOM";
}

const texto = (min: number, msg: string) => z.string().trim().min(min, msg).max(200);

/** Lo que manda el POS. `courier` llega ya resuelto: "OTRO" se sustituye por lo escrito. */
export const envioSchema = z
  .object({
    nombre: texto(3, "Falta el nombre de quien recibe"),
    tipoDocumento: z.enum(["DNI", "RUC", "CE"]).nullable().optional(),
    numeroDocumento: z.string().trim().max(20).nullable().optional(),
    celular: z
      .string()
      .trim()
      .regex(/^\+?[\d\s-]{6,20}$/, "El celular no es válido"),
    ciudad: texto(2, "Falta la ciudad"),
    courier: texto(2, "Falta el courier"),
    modalidad: z.enum(MODALIDADES),
    destino: texto(3, "Falta la agencia o la dirección"),
    mercaderia: z.enum(MERCADERIAS).nullable().optional(),
  })
  // La carga masiva de Shalom valida DESTINO contra su lista: un nombre
  // escrito a mano no pasaría. El texto se compara exacto, espacios incluidos.
  .refine((e) => e.courier.toUpperCase() !== "SHALOM" || AGENCIAS_SHALOM.includes(e.destino), {
    message: "Elige la agencia de la lista de Shalom",
    path: ["destino"],
  });

export type EnvioInput = z.infer<typeof envioSchema>;

/** Lo que se guarda: el documento va entero o no va, como en `Customer`. */
export function normalizarEnvio(e: EnvioInput) {
  const numero = e.numeroDocumento?.replace(/\s+/g, "") || null;
  return {
    nombre: e.nombre.replace(/\s+/g, " "),
    tipoDocumento: numero ? (e.tipoDocumento ?? "DNI") : null,
    numeroDocumento: numero,
    celular: e.celular.replace(/\s+/g, " "),
    ciudad: e.ciudad.replace(/\s+/g, " "),
    courier: e.courier.replace(/\s+/g, " ").toUpperCase(),
    modalidad: e.modalidad,
    // Una agencia de Shalom va tal cual está en su lista: "AV  INDEPENDENCIA"
    // lleva dos espacios y colapsarlos la dejaría fuera.
    destino: e.courier.toUpperCase() === "SHALOM" ? e.destino : e.destino.replace(/\s+/g, " "),
    // El tamaño solo cuenta para Shalom; el valor por defecto no se guarda.
    mercaderia:
      e.courier.toUpperCase() === "SHALOM" &&
      e.mercaderia &&
      e.mercaderia !== MERCADERIA_POR_DEFECTO
        ? e.mercaderia
        : null,
  };
}

/** Lo que el formulario de envío edita; todo texto, para los inputs. */
export interface BorradorEnvio {
  nombre: string;
  tipoDocumento: "DNI" | "RUC" | "CE";
  numeroDocumento: string;
  celular: string;
  ciudad: string;
  courier: CourierPreset;
  /** Solo cuando `courier` es "OTRO". */
  courierOtro: string;
  modalidad: Modalidad;
  destino: string;
  /** Tamaño del paquete para la carga masiva de Shalom. */
  mercaderia: Mercaderia;
}

export const BORRADOR_VACIO: BorradorEnvio = {
  nombre: "",
  tipoDocumento: "DNI",
  numeroDocumento: "",
  celular: "",
  ciudad: "",
  courier: "SHALOM",
  courierOtro: "",
  modalidad: "AGENCIA",
  destino: "",
  mercaderia: MERCADERIA_POR_DEFECTO,
};

/** Del borrador del formulario al cuerpo que acepta `envioSchema`. */
export function borradorAEnvio(b: BorradorEnvio): EnvioInput {
  return {
    nombre: b.nombre,
    tipoDocumento: b.numeroDocumento.trim() ? b.tipoDocumento : null,
    numeroDocumento: b.numeroDocumento.trim() || null,
    celular: b.celular,
    ciudad: b.ciudad,
    courier: b.courier === "OTRO" ? b.courierOtro : b.courier,
    modalidad: admiteDomicilio(b.courier) ? b.modalidad : "AGENCIA",
    destino: b.destino,
    mercaderia: b.courier === "SHALOM" ? b.mercaderia : null,
  };
}

/** Una fila guardada, de vuelta al formulario para corregirla. */
export function envioABorrador(e: {
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  celular: string;
  ciudad: string;
  courier: string;
  modalidad: string;
  destino: string;
  mercaderia?: string | null;
}): BorradorEnvio {
  const preset = (COURIERS as readonly string[]).includes(e.courier) && e.courier !== "OTRO";
  const tipo = e.tipoDocumento === "RUC" || e.tipoDocumento === "CE" ? e.tipoDocumento : "DNI";
  return {
    nombre: e.nombre,
    tipoDocumento: tipo,
    numeroDocumento: e.numeroDocumento ?? "",
    celular: e.celular,
    ciudad: e.ciudad,
    courier: preset ? (e.courier as CourierPreset) : "OTRO",
    courierOtro: preset ? "" : e.courier,
    modalidad: e.modalidad === "DIRECCION" ? "DIRECCION" : "AGENCIA",
    destino: e.destino,
    mercaderia: (MERCADERIAS as readonly string[]).includes(e.mercaderia ?? "")
      ? (e.mercaderia as Mercaderia)
      : MERCADERIA_POR_DEFECTO,
  };
}

/** El primer error de forma, para enseñarlo junto al botón; null si está bien. */
export function errorDeEnvio(b: BorradorEnvio): string | null {
  const r = envioSchema.safeParse(borradorAEnvio(b));
  return r.success ? null : r.error.issues[0].message;
}

/** Las filas de la etiqueta, en el orden en que se imprimen. */
export function filasEtiqueta(e: {
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  celular: string;
  ciudad: string;
  courier: string;
  modalidad: string;
  destino: string;
}): { etiqueta: string; valor: string; destacado?: boolean }[] {
  const filas: { etiqueta: string; valor: string; destacado?: boolean }[] = [
    { etiqueta: "Nombres", valor: e.nombre },
  ];
  if (e.numeroDocumento)
    filas.push({ etiqueta: e.tipoDocumento ?? "DNI", valor: e.numeroDocumento });
  filas.push({ etiqueta: "Celular", valor: e.celular });
  filas.push({ etiqueta: "Ciudad", valor: e.ciudad });

  if (e.modalidad === "DIRECCION") {
    // A domicilio la sede no existe: el courier va solo y la dirección destaca.
    filas.push({ etiqueta: "Courier", valor: e.courier });
    filas.push({ etiqueta: "Dirección", valor: e.destino, destacado: true });
  } else {
    filas.push({ etiqueta: "Agencia", valor: `${e.courier} – ${e.destino}`, destacado: true });
  }
  return filas.map((f) => ({ ...f, valor: f.valor.toUpperCase() }));
}

/** Una fila de `sale_document_envios`, o lo que se propone para crearla. */
export interface DatosEnvio {
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  celular: string;
  ciudad: string;
  courier: string;
  modalidad: string;
  destino: string;
  mercaderia?: string | null;
}

/** El documento genérico de consumidor final no identifica a nadie. */
function documentoReal(numero: string | null | undefined): string | null {
  const n = numero?.replace(/\s+/g, "") ?? "";
  return n && !/^0+$/.test(n) && n !== "-" ? n : null;
}

/**
 * Lo que se propone para la etiqueta de una venta que aún no la tiene.
 *
 * Una venta web la saca de su pedido, que ya dice courier, ciudad y dirección.
 * La agencia de Shalom del checkout es texto libre, así que casi nunca coincide
 * con la lista: se deja tal cual y el formulario pide elegirla. Una venta de
 * mostrador solo aporta el comprador.
 */
export function propuestaDeEnvio(doc: {
  buyerName: string | null;
  buyerDocType: string | null;
  buyerDocNumber: string | null;
  buyerPhone: string | null;
  customer?: { phone: string | null } | null;
  order?: {
    shippingName: string;
    shippingPhone: string | null;
    shippingAddress: string;
    shippingCity: string;
    shippingCourier: string | null;
    documentType: string | null;
    documentNumber: string | null;
  } | null;
}): DatosEnvio {
  const o = doc.order;
  if (o) {
    const courier = o.shippingCourier?.toUpperCase() === "OLVA" ? "OLVA" : "SHALOM";
    const numero = documentoReal(o.documentNumber);
    return {
      nombre: o.shippingName,
      tipoDocumento: numero ? (o.documentType ?? "DNI") : null,
      numeroDocumento: numero,
      celular: o.shippingPhone ?? "",
      ciudad: o.shippingCity,
      courier,
      modalidad: courier === "OLVA" ? "DIRECCION" : "AGENCIA",
      destino: o.shippingAddress,
      mercaderia: null,
    };
  }

  const numero = documentoReal(doc.buyerDocNumber);
  const nombre = doc.buyerName?.trim() ?? "";
  return {
    nombre: /^cliente(s)? varios$/i.test(nombre) ? "" : nombre,
    tipoDocumento: numero ? (doc.buyerDocType ?? "DNI") : null,
    numeroDocumento: numero,
    celular: doc.buyerPhone ?? doc.customer?.phone ?? "",
    ciudad: "",
    courier: "SHALOM",
    modalidad: "AGENCIA",
    destino: "",
    mercaderia: null,
  };
}
