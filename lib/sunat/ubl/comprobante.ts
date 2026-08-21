/**
 * Generación del XML UBL 2.1 de factura y boleta.
 *
 * La estructura, el orden de los elementos y los atributos salen de la "Guía de
 * elaboración de documentos electrónicos XML — UBL 2.1" de SUNAT
 * (cpe.sunat.gob.pe), no de ejemplos de terceros. Donde la guía y el XSD de UBL
 * discrepan en el orden manda el XSD, porque es contra él que valida SUNAT.
 *
 * Factura y boleta comparten plantilla: cambian el tipo de documento
 * (catálogo 01) y las reglas de identificación del adquirente.
 */

import { create } from "xmlbuilder2";
import {
  AFECTACION_IGV,
  CATEGORIA_TRIBUTO,
  LEYENDA,
  TASA_IGV,
  TIPO_DOCUMENTO,
  TIPO_OPERACION,
  TIPO_PRECIO,
  TRIBUTO,
  URI,
  codigoTipoDocIdentidad,
} from "../catalogos";
import { formatearMonto, formatearUnitario, type ComprobanteCalculado } from "../calculo";
import { numeroALetras } from "../../numero-letras";
import type { ConfigSunat } from "../config";

const NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ccts: "urn:un:unece:uncefact:documentation:2",
  ds: "http://www.w3.org/2000/09/xmldsig#",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  qdt: "urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2",
  udt: "urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
} as const;

const AGENCIA = "PE:SUNAT";
const MONEDA = "PEN";

/** Id del ds:Signature; cac:Signature debe apuntar aquí con "#". */
export const ID_FIRMA = "SignatureLuminus";

export interface Adquirente {
  docType: string;
  docNumber: string;
  name: string;
  address?: string | null;
}

export interface ParametrosComprobante {
  tipo: "FACTURA" | "BOLETA";
  serie: string;
  correlativo: number;
  /** Instante de emisión; se formatea en hora de Lima. */
  emitidoEn: Date;
  adquirente: Adquirente;
  calculo: ComprobanteCalculado;
  config: ConfigSunat;
  /** Forma de pago. El POS cobra en mostrador, así que por defecto "Contado". */
  formaPago?: "Contado" | "Credito";
}

/** Fecha del día peruano, `YYYY-MM-DD`. */
function fechaLima(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Hora peruana, `HH:MM:SS`. */
function horaLima(d: Date): string {
  return d.toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour12: false });
}

export function numeroComprobante(serie: string, correlativo: number): string {
  return `${serie}-${correlativo}`;
}

/**
 * Construye el XML sin firmar, con el `ext:ExtensionContent` vacío listo para
 * que `firma.ts` inserte ahí el `ds:Signature`.
 */
export function construirComprobante(p: ParametrosComprobante): string {
  const { config, calculo, adquirente } = p;
  const esFactura = p.tipo === "FACTURA";
  const tipoDoc = esFactura ? TIPO_DOCUMENTO.FACTURA : TIPO_DOCUMENTO.BOLETA;

  const doc = create({ version: "1.0", encoding: "UTF-8", standalone: false })
    .ele(NS.invoice, "Invoice", {
      "xmlns:cac": NS.cac,
      "xmlns:cbc": NS.cbc,
      "xmlns:ccts": NS.ccts,
      "xmlns:ds": NS.ds,
      "xmlns:ext": NS.ext,
      "xmlns:qdt": NS.qdt,
      "xmlns:udt": NS.udt,
      "xmlns:xsi": NS.xsi,
    });

  // ── Hueco de la firma ──────────────────────────────────────────────────────
  doc.ele("ext:UBLExtensions").ele("ext:UBLExtension").ele("ext:ExtensionContent").up().up().up();

  // ── Cabecera ───────────────────────────────────────────────────────────────
  doc.ele("cbc:UBLVersionID").txt("2.1").up();
  doc.ele("cbc:CustomizationID").txt("2.0").up();

  // Tipo de operación: los valores son del catálogo 51, pero el schemeURI que
  // exige SUNAT apunta a catalogo17. Está así en la guía oficial.
  doc
    .ele("cbc:ProfileID", {
      schemeName: "SUNAT:Identificador de Tipo de Operación",
      schemeAgencyName: AGENCIA,
      schemeURI: URI.tipoOperacion,
    })
    .txt(TIPO_OPERACION.VENTA_INTERNA)
    .up();

  doc.ele("cbc:ID").txt(numeroComprobante(p.serie, p.correlativo)).up();
  doc.ele("cbc:IssueDate").txt(fechaLima(p.emitidoEn)).up();
  doc.ele("cbc:IssueTime").txt(horaLima(p.emitidoEn)).up();

  // El @listID lleva el tipo de operación (catálogo 51). Es el que lee el
  // validador vigente: con el tipo de operación sólo en cbc:ProfileID responde
  // 3205 ("Debe consignar el tipo de operación"). Comprobado contra beta.
  doc
    .ele("cbc:InvoiceTypeCode", {
      listID: TIPO_OPERACION.VENTA_INTERNA,
      listAgencyName: AGENCIA,
      listName: "Tipo de Documento",
      listURI: URI.tipoDocumento,
    })
    .txt(tipoDoc)
    .up();

  doc
    .ele("cbc:Note", { languageLocaleID: LEYENDA.MONTO_EN_LETRAS })
    .dat(numeroALetras(calculo.totalPagar))
    .up();

  doc
    .ele("cbc:DocumentCurrencyCode", {
      listID: "ISO 4217 Alpha",
      listName: "Currency",
      listAgencyName: "United Nations Economic Commission for Europe",
    })
    .txt(MONEDA)
    .up();

  doc.ele("cbc:LineCountNumeric").txt(String(calculo.lineas.length)).up();

  // ── Referencia a la firma ──────────────────────────────────────────────────
  const firma = doc.ele("cac:Signature");
  firma.ele("cbc:ID").txt(ID_FIRMA).up();
  const signatory = firma.ele("cac:SignatoryParty");
  signatory.ele("cac:PartyIdentification").ele("cbc:ID").txt(config.ruc).up().up();
  signatory.ele("cac:PartyName").ele("cbc:Name").dat(config.razonSocial).up().up();
  signatory.up();
  firma
    .ele("cac:DigitalSignatureAttachment")
    .ele("cac:ExternalReference")
    .ele("cbc:URI")
    .txt(`#${ID_FIRMA}`)
    .up()
    .up()
    .up();
  firma.up();

  // ── Emisor ─────────────────────────────────────────────────────────────────
  //
  // El RUC va en cac:PartyIdentification/cbc:ID con su @schemeID, NO en
  // cac:PartyTaxScheme/cbc:CompanyID. La guía en PDF de SUNAT todavía muestra
  // la forma antigua (UBL 2.0), pero el validador vigente la rechaza con el
  // error 1008 ("no existe información en tipo de documento del emisor").
  // Comprobado contra el ambiente beta.
  const emisor = doc.ele("cac:AccountingSupplierParty").ele("cac:Party");

  emisor
    .ele("cac:PartyIdentification")
    .ele("cbc:ID", {
      schemeID: "6",
      schemeName: "Documento de Identidad",
      schemeAgencyName: AGENCIA,
      schemeURI: URI.tipoDocIdentidad,
    })
    .txt(config.ruc)
    .up()
    .up();

  emisor.ele("cac:PartyName").ele("cbc:Name").dat(config.nombreComercial).up().up();

  const emisorLegal = emisor.ele("cac:PartyLegalEntity");
  emisorLegal.ele("cbc:RegistrationName").dat(config.razonSocial).up();

  const dir = emisorLegal.ele("cac:RegistrationAddress");
  dir.ele("cbc:ID").txt(config.domicilio.ubigeo).up();
  dir.ele("cbc:AddressTypeCode").txt(config.domicilio.codigoEstablecimiento).up();
  dir.ele("cbc:CityName").txt(config.domicilio.provincia).up();
  dir.ele("cbc:CountrySubentity").txt(config.domicilio.departamento).up();
  dir.ele("cbc:District").txt(config.domicilio.distrito).up();
  dir.ele("cac:AddressLine").ele("cbc:Line").dat(config.domicilio.direccion).up().up();
  dir
    .ele("cac:Country")
    .ele("cbc:IdentificationCode", {
      listID: "ISO 3166-1",
      listAgencyName: "United Nations Economic Commission for Europe",
      listName: "Country",
    })
    .txt(config.domicilio.pais)
    .up()
    .up();
  dir.up();

  emisorLegal.up();
  emisor.up().up();

  // ── Adquirente ─────────────────────────────────────────────────────────────
  const cliente = doc.ele("cac:AccountingCustomerParty").ele("cac:Party");

  cliente
    .ele("cac:PartyIdentification")
    .ele("cbc:ID", {
      schemeID: codigoTipoDocIdentidad(adquirente.docType),
      schemeName: "Documento de Identidad",
      schemeAgencyName: AGENCIA,
      schemeURI: URI.tipoDocIdentidad,
    })
    .txt(adquirente.docNumber)
    .up()
    .up();

  const clienteLegal = cliente.ele("cac:PartyLegalEntity");
  clienteLegal.ele("cbc:RegistrationName").dat(adquirente.name).up();

  // SUNAT no exige la dirección del adquirente: una factura sin ella se acepta
  // igual (beta F001-90, código 0 y sin observaciones). Va sólo en factura y
  // sólo si viene, que es lo normal —la pantalla de Convertir no la manda—, así
  // que el bloque tiene que poder faltar sin que eso sea un defecto.
  if (esFactura && adquirente.address) {
    clienteLegal
      .ele("cac:RegistrationAddress")
      .ele("cac:AddressLine")
      .ele("cbc:Line")
      .dat(adquirente.address)
      .up()
      .up()
      .up();
  }

  clienteLegal.up();
  cliente.up().up();

  // ── Forma de pago ──────────────────────────────────────────────────────────
  //
  // Obligatoria en facturas: sin ella SUNAT responde 3244 ("Debe consignar la
  // información del tipo de transacción del comprobante"). Va aquí por el orden
  // del XSD: cac:PaymentTerms precede a cac:TaxTotal.
  //
  // El POS cobra en el mostrador, así que siempre es contado. Una venta con
  // saldo pendiente tendría que declararse como crédito con sus cuotas.
  const pago = doc.ele("cac:PaymentTerms");
  pago.ele("cbc:ID").txt("FormaPago").up();
  pago.ele("cbc:PaymentMeansID").txt(p.formaPago ?? "Contado").up();
  pago.up();

  // ── Totales de impuestos ───────────────────────────────────────────────────
  const taxTotal = doc.ele("cac:TaxTotal");
  taxTotal.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(calculo.totalIgv)).up();

  const subtotal = taxTotal.ele("cac:TaxSubtotal");
  subtotal
    .ele("cbc:TaxableAmount", { currencyID: MONEDA })
    .txt(formatearMonto(calculo.totalValorVenta))
    .up();
  subtotal.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(calculo.totalIgv)).up();

  const categoria = subtotal.ele("cac:TaxCategory");
  categoria
    .ele("cbc:ID", {
      schemeID: "UN/ECE 5305",
      schemeName: "Tax Category Identifier",
      schemeAgencyName: "United Nations Economic Commission for Europe",
    })
    .txt(CATEGORIA_TRIBUTO.GRAVADO)
    .up();
  const esquema = categoria.ele("cac:TaxScheme");
  esquema
    .ele("cbc:ID", { schemeID: "UN/ECE 5153", schemeAgencyID: "6" })
    .txt(TRIBUTO.IGV.id)
    .up();
  esquema.ele("cbc:Name").txt(TRIBUTO.IGV.nombre).up();
  esquema.ele("cbc:TaxTypeCode").txt(TRIBUTO.IGV.codigo).up();
  esquema.up();
  categoria.up();
  subtotal.up();
  taxTotal.up();

  // ── Totales del documento ──────────────────────────────────────────────────
  const totales = doc.ele("cac:LegalMonetaryTotal");
  totales
    .ele("cbc:LineExtensionAmount", { currencyID: MONEDA })
    .txt(formatearMonto(calculo.totalValorVenta))
    .up();
  totales
    .ele("cbc:TaxInclusiveAmount", { currencyID: MONEDA })
    .txt(formatearMonto(calculo.totalPrecioVenta))
    .up();
  totales
    .ele("cbc:PayableAmount", { currencyID: MONEDA })
    .txt(formatearMonto(calculo.totalPagar))
    .up();
  totales.up();

  // ── Líneas ─────────────────────────────────────────────────────────────────
  for (const linea of calculo.lineas) {
    const l = doc.ele("cac:InvoiceLine");
    l.ele("cbc:ID").txt(String(linea.numero)).up();
    l.ele("cbc:InvoicedQuantity", {
      unitCode: linea.unidadMedida,
      unitCodeListID: "UN/ECE rec 20",
      unitCodeListAgencyName: "United Nations Economic Commission for Europe",
    })
      .txt(String(linea.cantidad))
      .up();
    l.ele("cbc:LineExtensionAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.valorVenta)).up();

    // Precio con IGV — es el que el cliente ve en el ticket.
    const precioRef = l.ele("cac:PricingReference").ele("cac:AlternativeConditionPrice");
    precioRef
      .ele("cbc:PriceAmount", { currencyID: MONEDA })
      .txt(formatearUnitario(linea.precioUnitario))
      .up();
    precioRef
      .ele("cbc:PriceTypeCode", {
        listName: "Tipo de Precio",
        listAgencyName: AGENCIA,
        listURI: URI.tipoPrecio,
      })
      .txt(TIPO_PRECIO.UNITARIO)
      .up();
    precioRef.up().up();

    const lTax = l.ele("cac:TaxTotal");
    lTax.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.igv)).up();

    const lSub = lTax.ele("cac:TaxSubtotal");
    lSub.ele("cbc:TaxableAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.valorVenta)).up();
    lSub.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.igv)).up();

    const lCat = lSub.ele("cac:TaxCategory");
    lCat
      .ele("cbc:ID", {
        schemeID: "UN/ECE 5305",
        schemeName: "Tax Category Identifier",
        schemeAgencyName: "United Nations Economic Commission for Europe",
      })
      .txt(CATEGORIA_TRIBUTO.GRAVADO)
      .up();
    lCat.ele("cbc:Percent").txt((TASA_IGV * 100).toFixed(2)).up();
    lCat
      .ele("cbc:TaxExemptionReasonCode", {
        listAgencyName: AGENCIA,
        listName: "Afectacion del IGV",
        listURI: URI.afectacionIgv,
      })
      .txt(AFECTACION_IGV.GRAVADO_ONEROSO)
      .up();

    const lEsq = lCat.ele("cac:TaxScheme");
    lEsq.ele("cbc:ID", { schemeID: "UN/ECE 5153", schemeAgencyID: "6" }).txt(TRIBUTO.IGV.id).up();
    lEsq.ele("cbc:Name").txt(TRIBUTO.IGV.nombre).up();
    lEsq.ele("cbc:TaxTypeCode").txt(TRIBUTO.IGV.codigo).up();
    lEsq.up();
    lCat.up();
    lSub.up();
    lTax.up();

    const item = l.ele("cac:Item");
    item.ele("cbc:Description").dat(linea.descripcion).up();
    if (linea.codigoProducto) {
      item.ele("cac:SellersItemIdentification").ele("cbc:ID").txt(linea.codigoProducto).up().up();
    }
    item.up();

    // Valor unitario SIN IGV.
    l.ele("cac:Price")
      .ele("cbc:PriceAmount", { currencyID: MONEDA })
      .txt(formatearUnitario(linea.valorUnitario))
      .up()
      .up();

    l.up();
  }

  return doc.end({ prettyPrint: false });
}
