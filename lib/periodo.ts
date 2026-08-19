/**
 * Fechas y rangos del dashboard, siempre en hora de Perú (America/Lima, UTC-5
 * fijo, sin horario de verano).
 *
 * El server corre en UTC en Railway, así que nada aquí puede apoyarse en la
 * zona local del proceso ni del navegador: las fechas se manejan como cadenas
 * `YYYY-MM-DD` (el día peruano) y sólo se convierten a `Date` con el offset
 * `-05:00` explícito, igual que hace `app/api/productos/movimientos/route.ts`.
 */

export type Periodo = "day" | "week" | "month" | "range";

/** Rango de días peruanos, ambos extremos incluidos. */
export interface Rango {
  from: string;
  to: string;
}

export const PERIODOS: Periodo[] = ["day", "week", "month", "range"];

export function esPeriodo(v: string | null): v is Periodo {
  return v !== null && (PERIODOS as string[]).includes(v);
}

export function esFechaISO(v: string | null): v is string {
  return v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Hoy en Lima, como `YYYY-MM-DD`. */
export function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Primer instante del día peruano. */
export function inicioLima(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000-05:00`);
}

/** Último instante del día peruano (el rango se consulta con `lte`). */
export function finLima(fecha: string): Date {
  return new Date(`${fecha}T23:59:59.999-05:00`);
}

/**
 * Aritmética de calendario sobre la cadena, no sobre un instante: se ancla al
 * mediodía UTC para que sumar días nunca cruce un borde por el offset.
 */
function anclar(fecha: string): Date {
  return new Date(`${fecha}T12:00:00.000Z`);
}

function aCadena(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = anclar(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aCadena(d);
}

export function sumarMeses(fecha: string, meses: number): string {
  const d = anclar(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  // Un mes más corto recorta el día (31 ene + 1 mes → 28/29 feb).
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return aCadena(d);
}

/** Días entre dos fechas, ambos extremos incluidos. */
export function diasEntre(rango: Rango): number {
  const ms = anclar(rango.to).getTime() - anclar(rango.from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Día de la semana con lunes = 0, como se usa en Perú. */
function diaSemana(fecha: string): number {
  return (anclar(fecha).getUTCDay() + 6) % 7;
}

export function inicioSemana(fecha: string): string {
  return sumarDias(fecha, -diaSemana(fecha));
}

export function inicioMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

export function finMes(fecha: string): string {
  const d = anclar(fecha);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${fecha.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

/** Rango natural del periodo que contiene a `referencia`. */
export function rangoDe(periodo: Periodo, referencia: string): Rango {
  if (periodo === "week") {
    const from = inicioSemana(referencia);
    return { from, to: sumarDias(from, 6) };
  }
  if (periodo === "month") {
    return { from: inicioMes(referencia), to: finMes(referencia) };
  }
  // "day" y "range" sin fechas explícitas caen en el día de referencia.
  return { from: referencia, to: referencia };
}

/**
 * Periodo anterior comparable. Para día/semana/mes es el periodo natural
 * previo; para un rango libre, el bloque de la misma longitud pegado antes.
 */
export function rangoAnterior(periodo: Periodo, rango: Rango): Rango {
  if (periodo === "day") {
    const from = sumarDias(rango.from, -1);
    return { from, to: from };
  }
  if (periodo === "week") {
    const from = sumarDias(rango.from, -7);
    return { from, to: sumarDias(from, 6) };
  }
  if (periodo === "month") {
    const referencia = sumarMeses(inicioMes(rango.from), -1);
    return { from: inicioMes(referencia), to: finMes(referencia) };
  }
  const largo = diasEntre(rango);
  const to = sumarDias(rango.from, -1);
  return { from: sumarDias(to, -(largo - 1)), to };
}

/** Mueve el periodo `delta` posiciones (−1 anterior, +1 siguiente). */
export function desplazar(periodo: Periodo, rango: Rango, delta: number): Rango {
  if (periodo === "day") {
    const from = sumarDias(rango.from, delta);
    return { from, to: from };
  }
  if (periodo === "week") {
    const from = sumarDias(rango.from, delta * 7);
    return { from, to: sumarDias(from, 6) };
  }
  if (periodo === "month") {
    const referencia = sumarMeses(inicioMes(rango.from), delta);
    return { from: inicioMes(referencia), to: finMes(referencia) };
  }
  const largo = diasEntre(rango);
  const from = sumarDias(rango.from, delta * largo);
  return { from, to: sumarDias(from, largo - 1) };
}

/** ¿El rango ya llega al periodo en curso? (deshabilita la flecha «siguiente») */
export function esPeriodoActual(rango: Rango): boolean {
  return rango.to >= hoyLima();
}

/** Un rango de un solo día se grafica por hora; el resto, por día. */
export type Granularidad = "hour" | "day";

export function granularidadDe(rango: Rango): Granularidad {
  return rango.from === rango.to ? "hour" : "day";
}

/** Hora de Lima de un instante (UTC-5 fijo). */
export function horaLima(dt: Date | string): number {
  return (new Date(dt).getUTCHours() + 24 - 5) % 24;
}

/** Día peruano (`YYYY-MM-DD`) de un instante. */
export function diaLima(dt: Date | string): string {
  return new Date(dt).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

function fmt(fecha: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", ...opts }).format(
    inicioLima(fecha),
  );
}

/** «19 ago» — es-PE abrevia con punto final, que aquí sobra. */
export function fechaCorta(fecha: string): string {
  return fmt(fecha, { day: "numeric", month: "short" }).replace(".", "");
}

function mismoMes(rango: Rango): boolean {
  return rango.from.slice(0, 7) === rango.to.slice(0, 7);
}

/** «miércoles, 19 de agosto de 2026» */
export function fechaLarga(fecha: string): string {
  return fmt(fecha, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Texto del periodo activo, para la cabecera. */
export function etiquetaPeriodo(periodo: Periodo, rango: Rango): string {
  if (periodo === "day") {
    const hoy = hoyLima();
    if (rango.from === hoy) return `Hoy · ${fechaLarga(rango.from)}`;
    if (rango.from === sumarDias(hoy, -1)) return `Ayer · ${fechaLarga(rango.from)}`;
    return fechaLarga(rango.from);
  }
  if (periodo === "month") {
    const nombre = fmt(rango.from, { month: "long", year: "numeric" });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  const anio = fmt(rango.to, { year: "numeric" });
  if (mismoMes(rango)) {
    const dia = (f: string) => fmt(f, { day: "numeric" });
    // El mes suelto llega capitalizado desde ICU; en medio de la frase va en minúscula.
    const mes = fmt(rango.from, { month: "long" }).toLocaleLowerCase("es-PE");
    return `Del ${dia(rango.from)} al ${dia(rango.to)} de ${mes} de ${anio}`;
  }
  return `Del ${fechaCorta(rango.from)} al ${fechaCorta(rango.to)} de ${anio}`;
}

/** Texto corto para el botón/selector («17 – 23 ago»). */
export function etiquetaCorta(periodo: Periodo, rango: Rango): string {
  if (periodo === "day") return fechaCorta(rango.from);
  if (periodo === "month") {
    const nombre = fmt(rango.from, { month: "long", year: "numeric" });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  if (mismoMes(rango)) {
    return `${fmt(rango.from, { day: "numeric" })} – ${fechaCorta(rango.to)}`;
  }
  return `${fechaCorta(rango.from)} – ${fechaCorta(rango.to)}`;
}
