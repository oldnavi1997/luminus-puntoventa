/**
 * Aritmética del comprobante.
 *
 * Este es el módulo que más rechazos evita, así que conviene entender por qué
 * está hecho así.
 *
 * El POS guarda precios CON IGV (es lo que el cliente paga) y el descuento es un
 * porcentaje sobre toda la venta. SUNAT, en cambio, pide valores SIN IGV por
 * línea y valida que la suma de las líneas cuadre con los totales del documento.
 * Si se calcula "hacia atrás" línea por línea con `round(x / 1.18)` y luego se
 * suma, aparecen diferencias de céntimos entre lo cobrado y lo declarado.
 *
 * La salida aquí es exacta por construcción:
 *
 *   igvLinea = importeConIgv − valorVenta      (no se redondea aparte)
 *
 * de modo que `valorVenta + igv === importeConIgv` en cada línea, y por tanto la
 * suma de líneas es exactamente el total que se le cobró al cliente. No hay
 * ajuste residual ni cuadre a posteriori.
 *
 * Decisión: el descuento global se PRORRATEA en las líneas en vez de declararse
 * como `cac:AllowanceCharge` de documento. Es matemáticamente idéntico para un
 * descuento porcentual y produce un XML mucho más simple, que es donde menos se
 * equivoca la validación de SUNAT.
 */

import { TASA_IGV } from "./catalogos";

/** Redondeo a 2 decimales, media hacia arriba. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Los valores unitarios admiten hasta 10 decimales: n(12,10). */
export function formatearUnitario(n: number): string {
  return n.toFixed(10);
}

export function formatearMonto(n: number): string {
  return redondear2(n).toFixed(2);
}

export interface LineaEntrada {
  descripcion: string;
  cantidad: number;
  /** Importe de la línea CON IGV, antes del descuento global. */
  importeConIgv: number;
  unidadMedida?: string;
  /** SKU u otro código interno del vendedor. */
  codigoProducto?: string | null;
}

export interface LineaCalculada {
  numero: number;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  codigoProducto: string | null;
  /** Valor unitario sin IGV. */
  valorUnitario: number;
  /** Precio unitario con IGV — va en cac:PricingReference. */
  precioUnitario: number;
  /** cbc:LineExtensionAmount. */
  valorVenta: number;
  igv: number;
  /** valorVenta + igv. */
  importeConIgv: number;
}

export interface ComprobanteCalculado {
  lineas: LineaCalculada[];
  /** Suma de valores de venta gravados — cbc:LineExtensionAmount del documento. */
  totalValorVenta: number;
  totalIgv: number;
  /** cbc:TaxInclusiveAmount. */
  totalPrecioVenta: number;
  /** cbc:PayableAmount. Coincide con el total cobrado por el POS. */
  totalPagar: number;
  /** Descuento prorrateado, sólo informativo. */
  descuentoAplicado: number;
}

export class ErrorCalculo extends Error {
  readonly codigo = "CALCULO_INVALIDO";
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCalculo";
  }
}

/**
 * Reparte el descuento entre las líneas de forma proporcional, cargando el
 * residuo de redondeo en la última línea para que la suma sea exacta.
 */
function prorratearDescuento(lineas: LineaEntrada[], totalObjetivo: number): number[] {
  const bruto = lineas.reduce((s, l) => s + l.importeConIgv, 0);
  if (bruto <= 0) throw new ErrorCalculo("El comprobante no tiene importe.");

  const factor = totalObjetivo / bruto;
  const importes = lineas.map((l) => redondear2(l.importeConIgv * factor));

  // El prorrateo redondeado puede quedar a uno o dos céntimos del objetivo.
  const suma = redondear2(importes.reduce((s, n) => s + n, 0));
  const residuo = redondear2(totalObjetivo - suma);
  if (residuo !== 0) importes[importes.length - 1] = redondear2(importes[importes.length - 1] + residuo);

  return importes;
}

/**
 * Calcula el comprobante completo.
 *
 * @param lineas       ítems con su importe CON IGV, antes del descuento.
 * @param totalCobrado total que efectivamente se le cobró al cliente. Si se
 *                     omite, se toma la suma de las líneas sin descuento.
 */
export function calcularComprobante(
  lineas: LineaEntrada[],
  totalCobrado?: number,
): ComprobanteCalculado {
  if (lineas.length === 0) throw new ErrorCalculo("El comprobante no tiene líneas.");

  for (const l of lineas) {
    if (l.cantidad <= 0) throw new ErrorCalculo(`La línea "${l.descripcion}" tiene cantidad ${l.cantidad}.`);
    if (l.importeConIgv < 0) throw new ErrorCalculo(`La línea "${l.descripcion}" tiene importe negativo.`);
  }

  const bruto = redondear2(lineas.reduce((s, l) => s + l.importeConIgv, 0));
  const objetivo = redondear2(totalCobrado ?? bruto);
  if (objetivo <= 0) throw new ErrorCalculo("El total del comprobante debe ser mayor que cero.");

  const importes = prorratearDescuento(lineas, objetivo);

  const calculadas: LineaCalculada[] = lineas.map((l, i) => {
    const importeConIgv = importes[i];
    const valorVenta = redondear2(importeConIgv / (1 + TASA_IGV));
    // El IGV sale por diferencia, no por multiplicación: así la línea cuadra
    // exactamente y la suma del documento también.
    const igv = redondear2(importeConIgv - valorVenta);

    return {
      numero: i + 1,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidadMedida: l.unidadMedida ?? "NIU",
      codigoProducto: l.codigoProducto ?? null,
      valorUnitario: valorVenta / l.cantidad,
      precioUnitario: importeConIgv / l.cantidad,
      valorVenta,
      igv,
      importeConIgv,
    };
  });

  const totalValorVenta = redondear2(calculadas.reduce((s, l) => s + l.valorVenta, 0));
  const totalIgv = redondear2(calculadas.reduce((s, l) => s + l.igv, 0));
  const totalPrecioVenta = redondear2(totalValorVenta + totalIgv);

  // Invariante del módulo. Si esto salta es un bug nuestro, no un dato malo.
  if (totalPrecioVenta !== objetivo) {
    throw new ErrorCalculo(
      `Descuadre interno: las líneas suman ${totalPrecioVenta} y el total cobrado es ${objetivo}.`,
    );
  }

  return {
    lineas: calculadas,
    totalValorVenta,
    totalIgv,
    totalPrecioVenta,
    totalPagar: totalPrecioVenta,
    descuentoAplicado: redondear2(bruto - objetivo),
  };
}
