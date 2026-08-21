/**
 * Arma la representación impresa a partir de datos ya normalizados.
 *
 * **Este módulo es puro a propósito**: no importa `prisma`, ni `qrcode`, ni
 * `fs`, ni `getConfigSunat`. Todo lo que decide qué dice un comprobante impreso
 * —los importes, la cadena QR, las leyendas, qué se oculta— se puede probar sin
 * levantar una base de datos, que es la restricción real de este proyecto: aquí
 * no se mockea Prisma en ningún sitio.
 *
 * Los importes salen de `calcularComprobante` con los MISMOS argumentos que usa
 * `emitir.ts` al construir el XML. Es determinista, así que lo impreso cuadra
 * con lo declarado por construcción, incluido el prorrateo del descuento global
 * —que es justo donde recalcular a mano divergiría.
 */

import { DocumentStatus, DocumentType } from "@/app/generated/prisma/client";
import { calcularComprobante, redondear2 } from "@/lib/sunat/calculo";
import { numeroALetras } from "@/lib/numero-letras";
import { formatCorrelativo } from "@/lib/utils";
import { fechaLima, horaLima } from "@/lib/sunat/ubl/comun";
import { codigoTipoDocIdentidad, TIPO_DOCUMENTO, TIPO_DOC_IDENTIDAD } from "@/lib/sunat/catalogos";
import { tieneDocumento, DOC_SIN_IDENTIFICAR } from "@/lib/documento";
import { cadenaQr } from "./qr";
import {
  etiquetaTipoDoc,
  etiquetaUnidad,
  LEYENDA_CONSULTA,
  LEYENDA_INTERNA,
  LEYENDA_RECIBO_SALDO,
  LEYENDA_SEE,
  leyendaRepresentacion,
  METODO_PAGO,
  TITULO_DOCUMENTO,
  TITULO_RECIBO_SALDO,
} from "./etiquetas";
import type {
  EntradaRepresentacion,
  ItemImpreso,
  PagoImpreso,
  RepresentacionImpresa,
} from "./tipos";

/** El comprobante existe para SUNAT y por tanto lleva QR, hash y leyenda legal. */
const ESTADOS_CON_VALIDEZ: DocumentStatus[] = [
  DocumentStatus.ACCEPTED,
  DocumentStatus.ACCEPTED_WITH_OBSERVATIONS,
  DocumentStatus.VOIDED,
  DocumentStatus.VOID_PENDING,
];

function tipoSunatDe(type: DocumentType): string | null {
  if (type === DocumentType.FACTURA) return TIPO_DOCUMENTO.FACTURA;
  if (type === DocumentType.BOLETA) return TIPO_DOCUMENTO.BOLETA;
  return null;
}

function avisoDe(entrada: EntradaRepresentacion): string | null {
  const { status } = entrada.documento;

  if (status === DocumentStatus.VOIDED) return "ANULADO";
  if (status === DocumentStatus.VOID_PENDING) return "ANULACIÓN EN TRÁMITE";
  if (entrada.clase !== "COMPROBANTE") return null;

  // Afirmar que esto es la representación impresa de algo que SUNAT no tiene
  // registrado es peor que no imprimirlo: se imprime, pero diciendo la verdad.
  if (!ESTADOS_CON_VALIDEZ.includes(status)) return "PENDIENTE DE ACEPTACIÓN POR SUNAT";
  return null;
}

function armarPago(entrada: EntradaRepresentacion, total: number): PagoImpreso {
  const { pago } = entrada;
  const desglose: { etiqueta: string; monto: number }[] = [];

  if (pago.metodo === "MIXTO") {
    if (pago.efectivo) desglose.push({ etiqueta: "Efectivo", monto: pago.efectivo });
    if (pago.tarjeta) desglose.push({ etiqueta: "Tarjeta", monto: pago.tarjeta });
    if (pago.yape) desglose.push({ etiqueta: "Yape", monto: pago.yape });
  }

  const adelanto = pago.adelanto != null ? redondear2(pago.adelanto) : null;

  return {
    metodoEtiqueta: METODO_PAGO[pago.metodo as keyof typeof METODO_PAGO] ?? pago.metodo,
    // El POS cobra en mostrador. Una venta con saldo pendiente sigue siendo
    // contado para SUNAT: el adelanto se refleja aparte, no como crédito.
    condicion: "CONTADO",
    desglose,
    montoRecibido: pago.montoRecibido != null ? redondear2(pago.montoRecibido) : null,
    cambio: pago.cambio != null ? redondear2(pago.cambio) : null,
    adelanto,
    saldoPendiente: adelanto != null ? redondear2(total - adelanto) : null,
  };
}

export function construirRepresentacion(entrada: EntradaRepresentacion): RepresentacionImpresa {
  const { documento, adquirente } = entrada;

  const calculo = calcularComprobante(
    entrada.items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      importeConIgv: i.importeConIgv,
      unidadMedida: i.unidad,
      codigoProducto: i.codigo,
    })),
    entrada.total,
  );

  const items: ItemImpreso[] = calculo.lineas.map((l) => ({
    numero: l.numero,
    codigo: l.codigoProducto,
    descripcion: l.descripcion,
    unidad: l.unidadMedida,
    unidadEtiqueta: etiquetaUnidad(l.unidadMedida),
    cantidad: l.cantidad,
    valorUnitario: redondear2(l.valorUnitario),
    precioUnitario: redondear2(l.precioUnitario),
    igv: redondear2(l.igv),
    importe: redondear2(l.importeConIgv),
  }));

  const identificado = tieneDocumento(adquirente.docNumber);
  const tipoDocCodigo = identificado
    ? codigoTipoDocIdentidad(adquirente.docType ?? "DNI")
    : TIPO_DOC_IDENTIDAD.SIN_RUC;

  const esComprobante = entrada.clase === "COMPROBANTE";
  const tipoSunat = esComprobante ? tipoSunatDe(documento.type) : null;
  const aviso = avisoDe(entrada);

  const titulo =
    entrada.clase === "RECIBO_SALDO"
      ? TITULO_RECIBO_SALDO
      : TITULO_DOCUMENTO[documento.type];

  const fechaEmision = fechaLima(documento.emitidoEn);

  // Un documento que SUNAT no conoce no lleva QR ni puede llamarse
  // representación impresa de nada. Quien pinta pregunta por `sunat === null`,
  // no por la clase: un solo predicado en vez de tres ramas repetidas.
  const llevaSunat = esComprobante && tipoSunat !== null && ESTADOS_CON_VALIDEZ.includes(documento.status);

  const sunat = llevaSunat
    ? {
        hash: entrada.hash ?? null,
        cadenaQr: cadenaQr({
          ruc: entrada.emisor.ruc,
          tipoDocumento: tipoSunat,
          serie: documento.serie,
          correlativo: documento.correlativo,
          igv: calculo.totalIgv,
          total: calculo.totalPagar,
          fechaEmision,
          tipoDocAdquirente: tipoDocCodigo,
          numeroDocAdquirente: identificado
            ? (adquirente.docNumber as string)
            : DOC_SIN_IDENTIFICAR,
        }),
        // Lo rellena `cargar.ts`, que es quien puede rasterizar.
        qrDataUrl: "",
        leyendas: [
          leyendaRepresentacion(titulo),
          LEYENDA_SEE,
          LEYENDA_CONSULTA,
          ...(entrada.emisor.resolucion
            ? [`Autorizado mediante Resolución N° ${entrada.emisor.resolucion}`]
            : []),
        ],
      }
    : null;

  return {
    clase: entrada.clase,
    emisor: entrada.emisor,
    documento: {
      id: documento.id,
      titulo,
      tipoSunat,
      serie: documento.serie,
      correlativo: formatCorrelativo(documento.correlativo),
      fullNumber: documento.fullNumber,
      fechaEmision,
      horaEmision: horaLima(documento.emitidoEn),
      moneda: "SOL S/",
      estado: documento.status,
      anulado: documento.status === DocumentStatus.VOIDED,
    },
    adquirente: {
      nombre: adquirente.nombre?.trim() || "CLIENTE VARIOS",
      identificado,
      tipoDocCodigo: identificado ? tipoDocCodigo : null,
      tipoDocEtiqueta: etiquetaTipoDoc(identificado ? tipoDocCodigo : null),
      numeroDoc: identificado ? (adquirente.docNumber as string) : null,
      direccion: adquirente.direccion?.trim() || null,
    },
    items,
    totales: {
      opGravadas: redondear2(calculo.totalValorVenta),
      igv: redondear2(calculo.totalIgv),
      descuento: redondear2(entrada.descuento),
      total: redondear2(calculo.totalPagar),
      totalLetras: numeroALetras(calculo.totalPagar),
    },
    pago: armarPago(entrada, redondear2(calculo.totalPagar)),
    sunat,
    vendedor: entrada.vendedor,
    aviso,
  };
}

/** La leyenda del pie cuando el documento no es un comprobante electrónico. */
export function leyendaInterna(clase: RepresentacionImpresa["clase"]): string | null {
  if (clase === "NOTA_VENTA") return LEYENDA_INTERNA;
  if (clase === "RECIBO_SALDO") return LEYENDA_RECIBO_SALDO;
  return null;
}
