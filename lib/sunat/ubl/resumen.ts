/**
 * Resumen diario (RC) — el instrumento con que se anula una BOLETA.
 *
 * Las boletas no se dan de baja con una comunicación de baja: se informan en un
 * resumen, y anularlas es informarlas otra vez con `cac:Status/cbc:ConditionCode`
 * en 3. Por eso este documento y el de `baja.ts` no son variantes del mismo:
 * comparten la cabecera y el emisor, pero la línea de la RC lleva importes y la
 * de la RA lleva un motivo.
 *
 * Se construye en la versión 1.1 del resumen, que declara un documento por línea
 * en vez de rangos correlativos.
 */

import { create } from "xmlbuilder2";
import { CATEGORIA_TRIBUTO, TIPO_DOCUMENTO, TRIBUTO } from "../catalogos";
import { formatearMonto } from "../calculo";
import { idResumen } from "../nombres";
import type { ConfigSunat } from "../config";
import { MONEDA, NS, bloqueFirma, emisorResumen, fechaLima, huecoExtension } from "./comun";

/** Catálogo 19 — estado del ítem dentro del resumen. */
export const CONDICION = {
  ADICIONAR: "1",
  MODIFICAR: "2",
  ANULAR: "3",
} as const;

/** Catálogo 12 — el `cbc:InstructionID` que clasifica el importe. */
const IMPORTE_GRAVADO = "01";

export interface LineaResumen {
  /** Catálogo 01: "03" boleta, "07"/"08" sus notas. */
  tipoDocumento: string;
  serie: string;
  correlativo: number;
  condicion: (typeof CONDICION)[keyof typeof CONDICION];
  /** Comprador. `null` para el consumidor final de una boleta pequeña. */
  adquirente: { tipoDoc: string; numeroDoc: string } | null;
  /** Importes tal cual los declaró el comprobante: total con IGV, gravado e IGV. */
  total: number;
  gravado: number;
  igv: number;
}

export interface ParametrosResumen {
  /** El N de `RC-AAAAMMDD-N`. */
  correlativo: number;
  /** Cuándo se genera el resumen. Da el ID y el `IssueDate`. */
  generadoEn: Date;
  /** Día de emisión de las boletas que se informan. Una sola para todo el documento. */
  fechaEmision: Date;
  lineas: LineaResumen[];
  config: ConfigSunat;
}

/** El `cbc:ID` del documento: `RC-20260821-1`. */
export function numeroResumen(generadoEn: Date, correlativo: number): string {
  return idResumen(TIPO_DOCUMENTO.RESUMEN_DIARIO, fechaLima(generadoEn), correlativo);
}

/** El `cbc:ID` de una línea: `B001-53`. */
function numeroLinea(serie: string, correlativo: number): string {
  return `${serie}-${correlativo}`;
}

/**
 * Construye el XML sin firmar, con el `ext:ExtensionContent` vacío listo para
 * que `firma.ts` inserte ahí el `ds:Signature`.
 */
export function construirResumenAnulacion(p: ParametrosResumen): string {
  const { config } = p;

  if (p.lineas.length === 0) {
    throw new Error("Un resumen sin líneas no informa nada.");
  }

  const doc = create({ version: "1.0", encoding: "UTF-8", standalone: false }).ele(
    NS.resumen,
    "SummaryDocuments",
    {
      "xmlns:cac": NS.cac,
      "xmlns:cbc": NS.cbc,
      "xmlns:ds": NS.ds,
      "xmlns:ext": NS.ext,
      "xmlns:sac": NS.sac,
    },
  );

  huecoExtension(doc);

  doc.ele("cbc:UBLVersionID").txt("2.0").up();
  // 1.1 es la versión que declara un documento por línea. Con 1.0 SUNAT espera
  // rangos y el documento no valida.
  doc.ele("cbc:CustomizationID").txt("1.1").up();

  doc.ele("cbc:ID").txt(numeroResumen(p.generadoEn, p.correlativo)).up();
  doc.ele("cbc:ReferenceDate").txt(fechaLima(p.fechaEmision)).up();
  doc.ele("cbc:IssueDate").txt(fechaLima(p.generadoEn)).up();

  bloqueFirma(doc, config);
  emisorResumen(doc, config);

  p.lineas.forEach((linea, i) => {
    const l = doc.ele("sac:SummaryDocumentsLine");
    l.ele("cbc:LineID").txt(String(i + 1)).up();
    l.ele("cbc:DocumentTypeCode").txt(linea.tipoDocumento).up();
    l.ele("cbc:ID").txt(numeroLinea(linea.serie, linea.correlativo)).up();

    // Una boleta por debajo del umbral puede no identificar al comprador.
    if (linea.adquirente) {
      const cliente = l.ele("cac:AccountingCustomerParty");
      cliente.ele("cbc:CustomerAssignedAccountID").txt(linea.adquirente.numeroDoc).up();
      cliente.ele("cbc:AdditionalAccountID").txt(linea.adquirente.tipoDoc).up();
      cliente.up();
    }

    l.ele("cac:Status").ele("cbc:ConditionCode").txt(linea.condicion).up().up();

    l.ele("sac:TotalAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.total)).up();

    const pago = l.ele("sac:BillingPayment");
    pago.ele("cbc:PaidAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.gravado)).up();
    pago.ele("cbc:InstructionID").txt(IMPORTE_GRAVADO).up();
    pago.up();

    const taxTotal = l.ele("cac:TaxTotal");
    taxTotal.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.igv)).up();

    const subtotal = taxTotal.ele("cac:TaxSubtotal");
    subtotal.ele("cbc:TaxAmount", { currencyID: MONEDA }).txt(formatearMonto(linea.igv)).up();

    const categoria = subtotal.ele("cac:TaxCategory");
    categoria.ele("cbc:ID").txt(CATEGORIA_TRIBUTO.GRAVADO).up();

    const esquema = categoria.ele("cac:TaxScheme");
    esquema.ele("cbc:ID", { schemeAgencyID: "6" }).txt(TRIBUTO.IGV.id).up();
    esquema.ele("cbc:Name").txt(TRIBUTO.IGV.nombre).up();
    esquema.ele("cbc:TaxTypeCode").txt(TRIBUTO.IGV.codigo).up();
    esquema.up();

    categoria.up();
    subtotal.up();
    taxTotal.up();
    l.up();
  });

  return doc.end({ prettyPrint: false });
}
