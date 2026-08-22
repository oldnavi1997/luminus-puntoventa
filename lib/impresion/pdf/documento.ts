/**
 * El PDF A4 de la representación impresa.
 *
 * Recibe la representación ya armada y **no consulta nada**: así se puede
 * llamar desde el endpoint, desde un envío por correo o desde un test.
 *
 * La maqueta reproduce la de los comprobantes del facturador anterior —cabecera
 * con el recuadro del RUC a la derecha, bloque del adquirente, tabla de ítems,
 * totales a la derecha y pie legal— con dos diferencias deliberadas: la consulta
 * lleva a SUNAT y no a la web de un proveedor, y el QR va acompañado del valor
 * resumen.
 */

import PDFDocument from "pdfkit";
import { qrPngBuffer } from "../qr-imagen";
import type { RepresentacionImpresa } from "../tipos";
import { leyendaInterna } from "../etiquetas";
import {
  ANCHO_UTIL,
  COLUMNAS,
  FUENTE,
  FUENTE_NEGRITA,
  GRIS_CABECERA,
  GRIS_LINEA,
  logoBuffer,
  MARGEN,
  PAGINA,
  RESERVA_PIE,
  RUTA_FUENTE_NEGRITA,
  RUTA_FUENTE_REGULAR,
  soles,
} from "./layout";

type Doc = InstanceType<typeof PDFDocument>;

const PIE_PAGINA = PAGINA.alto - MARGEN;

function cabeceraEmisor(doc: Doc, rep: RepresentacionImpresa): number {
  const logo = logoBuffer();
  if (logo) {
    // `fit` respeta la proporción; el logo es apaisado.
    doc.image(logo, MARGEN, MARGEN, { fit: [140, 40] });
  }

  // ── Recuadro del RUC y el número, a la derecha ──────────────────────────
  const cajaX = 380;
  const cajaAncho = PAGINA.ancho - MARGEN - cajaX;
  const cajaAlto = 74;

  doc.lineWidth(1).rect(cajaX, MARGEN, cajaAncho, cajaAlto).stroke("#000");

  doc.font(FUENTE_NEGRITA).fontSize(10).fillColor("#000");
  doc.text(`R.U.C. ${rep.emisor.ruc}`, cajaX, MARGEN + 8, { width: cajaAncho, align: "center" });

  doc.fontSize(11);
  doc.text(rep.documento.titulo, cajaX + 6, MARGEN + 26, { width: cajaAncho - 12, align: "center" });

  doc.fontSize(11);
  doc.text(rep.documento.fullNumber, cajaX, MARGEN + 54, { width: cajaAncho, align: "center" });

  // ── Emisor, a la izquierda del recuadro ─────────────────────────────────
  const anchoEmisor = cajaX - MARGEN - 14;
  let y = MARGEN + 44;

  doc.font(FUENTE_NEGRITA).fontSize(11);
  doc.text(rep.emisor.razonSocial, MARGEN, y, { width: anchoEmisor, align: "center" });
  y += 14;

  doc.font(FUENTE).fontSize(7.5).fillColor("#333");
  const lineas = [
    rep.emisor.domicilioFiscal,
    rep.emisor.direccionSucursal,
    [rep.emisor.sucursal ? `SUCURSAL: ${rep.emisor.sucursal}` : null, rep.emisor.telefono]
      .filter(Boolean)
      .join("   ·   "),
    rep.emisor.email,
  ].filter((l): l is string => Boolean(l && l.trim()));

  for (const linea of lineas) {
    const alto = doc.heightOfString(linea, { width: anchoEmisor, align: "center" });
    doc.text(linea, MARGEN, y, { width: anchoEmisor, align: "center" });
    y += alto + 1;
  }

  doc.fillColor("#000");
  return Math.max(y, MARGEN + cajaAlto) + 12;
}

function bloqueAdquirente(doc: Doc, rep: RepresentacionImpresa, yInicio: number): number {
  const anchoIzq = 300;
  const xDer = MARGEN + anchoIzq + 12;
  const anchoDer = ANCHO_UTIL - anchoIzq - 12;

  const par = (etiqueta: string, valor: string, x: number, y: number, ancho: number) => {
    doc.font(FUENTE_NEGRITA).fontSize(8).text(etiqueta, x, y, { width: 92, lineBreak: false });
    doc.font(FUENTE).fontSize(8).text(valor, x + 96, y, { width: ancho - 96 });
  };

  let y = yInicio;
  par("Cliente:", rep.adquirente.nombre, MARGEN, y, anchoIzq);
  par(
    "Condición de pago:",
    rep.pago.condicion,
    xDer,
    y,
    anchoDer,
  );
  y += 13;

  par(
    `${rep.adquirente.tipoDocEtiqueta}:`,
    rep.adquirente.numeroDoc ?? "—",
    MARGEN,
    y,
    anchoIzq,
  );
  par("Fecha de emisión:", `${rep.documento.fechaEmisionCorta}  ${rep.documento.horaEmision}`, xDer, y, anchoDer);
  y += 13;

  par("Dirección:", rep.adquirente.direccion ?? "—", MARGEN, y, anchoIzq);
  par("Moneda:", rep.documento.moneda, xDer, y, anchoDer);
  y += 13;

  if (rep.vendedor) {
    par("Vendedor:", rep.vendedor, MARGEN, y, anchoIzq);
    y += 13;
  }

  return y + 6;
}

function cabeceraTabla(doc: Doc, y: number): number {
  const alto = 16;
  doc.rect(MARGEN, y, ANCHO_UTIL, alto).fill(GRIS_CABECERA);
  doc.fillColor("#000").font(FUENTE_NEGRITA).fontSize(7.5);

  let x = MARGEN;
  for (const col of COLUMNAS) {
    doc.text(col.titulo, x + 3, y + 5, { width: col.ancho - 6, align: col.alineacion, lineBreak: false });
    x += col.ancho;
  }

  return y + alto;
}

function filaItem(doc: Doc, item: RepresentacionImpresa["items"][number], y: number): number {
  doc.font(FUENTE).fontSize(7.5).fillColor("#000");

  const colDescripcion = COLUMNAS.find((c) => c.clave === "descripcion")!;
  // El alto lo manda la descripción, que es la única que se parte en varias
  // líneas. En una óptica "Lunas Transition Gen S Crizal Blue Defense/AR" es la
  // norma, no la excepción.
  const altoTexto = doc.heightOfString(item.descripcion, { width: colDescripcion.ancho - 6 });
  const alto = Math.max(altoTexto, 10) + 6;

  const valores: Record<string, string> = {
    item: String(item.numero),
    cantidad: String(item.cantidad),
    unidad: item.unidadEtiqueta,
    codigo: item.codigo ?? "—",
    descripcion: item.descripcion,
    precio: soles(item.precioUnitario),
    importe: soles(item.importe),
  };

  let x = MARGEN;
  for (const col of COLUMNAS) {
    doc.text(valores[col.clave], x + 3, y + 4, {
      width: col.ancho - 6,
      align: col.alineacion,
      lineBreak: col.clave === "descripcion",
    });
    x += col.ancho;
  }

  doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + ANCHO_UTIL, y + alto).lineWidth(0.5).stroke(GRIS_LINEA);
  return y + alto;
}

function bloqueTotales(doc: Doc, rep: RepresentacionImpresa, yInicio: number): number {
  const anchoCaja = 190;
  const x = MARGEN + ANCHO_UTIL - anchoCaja;
  let y = yInicio + 6;

  const fila = (etiqueta: string, valor: string, fuerte = false) => {
    doc.font(fuerte ? FUENTE_NEGRITA : FUENTE).fontSize(fuerte ? 9 : 8).fillColor("#000");
    doc.text(etiqueta, x, y, { width: 95, lineBreak: false });
    doc.text(valor, x + 95, y, { width: anchoCaja - 95, align: "right", lineBreak: false });
    y += fuerte ? 14 : 12;
  };

  fila("Op. Gravadas", soles(rep.totales.opGravadas));
  fila("I.G.V. (18%)", soles(rep.totales.igv));
  if (rep.totales.descuento > 0) fila("Descuento", soles(rep.totales.descuento));

  doc.moveTo(x, y).lineTo(x + anchoCaja, y).lineWidth(0.5).stroke(GRIS_LINEA);
  y += 4;
  fila("Importe Total", soles(rep.totales.total), true);

  if (rep.pago.adelanto != null) {
    fila("Adelanto recibido", soles(rep.pago.adelanto));
    fila("Saldo pendiente", soles(rep.pago.saldoPendiente ?? 0), true);
  } else {
    for (const d of rep.pago.desglose) fila(d.etiqueta, soles(d.monto));
    if (rep.pago.montoRecibido != null) fila("Pagado", soles(rep.pago.montoRecibido));
    if (rep.pago.cambio != null && rep.pago.cambio > 0) fila("Vuelto", soles(rep.pago.cambio));
  }

  // El monto en letras va a la izquierda, a la altura de los totales.
  doc.font(FUENTE_NEGRITA).fontSize(8).fillColor("#000");
  doc.text(`SON: ${rep.totales.totalLetras}`, MARGEN, yInicio + 6, {
    width: ANCHO_UTIL - anchoCaja - 12,
  });

  return y;
}

async function pieLegal(doc: Doc, rep: RepresentacionImpresa, yInicio: number): Promise<void> {
  const y = Math.max(yInicio + 16, PIE_PAGINA - 110);

  if (rep.sunat) {
    const qr = await qrPngBuffer(rep.sunat.cadenaQr);
    doc.image(qr, MARGEN, y, { width: 90 });

    const xTexto = MARGEN + 104;
    const anchoTexto = ANCHO_UTIL - 104;
    let yTexto = y + 4;

    doc.font(FUENTE_NEGRITA).fontSize(7.5).fillColor("#000");
    if (rep.sunat.hash) {
      doc.text(`Valor resumen: ${rep.sunat.hash}`, xTexto, yTexto, { width: anchoTexto });
      yTexto += 12;
    }

    doc.font(FUENTE).fontSize(7).fillColor("#333");
    for (const leyenda of rep.sunat.leyendas) {
      const alto = doc.heightOfString(leyenda, { width: anchoTexto });
      doc.text(leyenda, xTexto, yTexto, { width: anchoTexto });
      yTexto += alto + 2;
    }
  } else {
    const interna = leyendaInterna(rep.clase);
    if (interna) {
      doc.font(FUENTE_NEGRITA).fontSize(9).fillColor("#000");
      doc.text(interna, MARGEN, y + 20, { width: ANCHO_UTIL, align: "center" });
    }
  }

  doc.fillColor("#000");
}

/** La banda diagonal de ANULADO / PENDIENTE, para que no se confunda con uno vigente. */
function marcaDeAgua(doc: Doc, texto: string): void {
  doc.save();
  doc.rotate(-30, { origin: [PAGINA.ancho / 2, PAGINA.alto / 2] });
  doc.font(FUENTE_NEGRITA).fontSize(48).fillColor("#000").opacity(0.12);
  doc.text(texto, 0, PAGINA.alto / 2 - 30, { width: PAGINA.ancho, align: "center" });
  doc.opacity(1).restore();
}

export async function generarPdfA4(rep: RepresentacionImpresa): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGEN,
    // Hace falta para poder volver atrás y escribir "Página X de Y".
    bufferPages: true,
    info: {
      Title: `${rep.documento.titulo} ${rep.documento.fullNumber}`,
      Author: rep.emisor.razonSocial,
      Subject: rep.sunat ? "Representación impresa de comprobante electrónico" : "Documento interno",
    },
  });

  doc.registerFont(FUENTE, RUTA_FUENTE_REGULAR);
  doc.registerFont(FUENTE_NEGRITA, RUTA_FUENTE_NEGRITA);

  const trozos: Buffer[] = [];
  doc.on("data", (c: Buffer) => trozos.push(c));
  const terminado = new Promise<Buffer>((resolver) => doc.on("end", () => resolver(Buffer.concat(trozos))));

  let y = cabeceraEmisor(doc, rep);
  y = bloqueAdquirente(doc, rep, y);
  y = cabeceraTabla(doc, y);

  for (const item of rep.items) {
    if (y > PAGINA.alto - MARGEN - RESERVA_PIE) {
      doc.addPage();
      // La cabecera de la tabla se repite: una segunda página con columnas sin
      // rótulo no se puede leer.
      y = cabeceraTabla(doc, MARGEN);
    }
    y = filaItem(doc, item, y);
  }

  y = bloqueTotales(doc, rep, y);
  await pieLegal(doc, rep, y);

  // Numeración y marca de agua, ya sabiendo cuántas páginas hay.
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    if (rep.aviso) marcaDeAgua(doc, rep.aviso);

    // pdfkit añade una página sola en cuanto escribes por debajo del margen
    // inferior, así que numerar al pie duplicaba el documento entero. Bajar el
    // margen mientras se escribe es la forma de pisar esa zona sin que pagine.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font(FUENTE).fontSize(7).fillColor("#666");
    doc.text(`Página ${i + 1} de ${paginas.count}`, MARGEN, PIE_PAGINA + 8, {
      width: ANCHO_UTIL,
      align: "right",
      lineBreak: false,
    });

    doc.page.margins.bottom = margenInferior;
  }

  doc.end();
  return terminado;
}
