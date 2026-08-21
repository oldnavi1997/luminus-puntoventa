import { describe, expect, it, vi } from "vitest";
import {
  crearTicketConCorrelativo,
  diaLima,
  esColisionDeCorrelativo,
  type DatosTicket,
  type RepositorioTickets,
} from "@/lib/sunat/correlativo-resumen";

/** El P2002 que lanza Prisma cuando el índice único no deja insertar. */
function colision() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

/** Repositorio en memoria que respeta el índice único de SunatTicket. */
function repoFalso(ocupados: number[] = []): RepositorioTickets<DatosTicket> & { creados: DatosTicket[] } {
  const tomados = new Set(ocupados);
  const creados: DatosTicket[] = [];

  return {
    creados,
    async ultimoCorrelativo() {
      return tomados.size === 0 ? null : Math.max(...tomados);
    },
    async crear(datos) {
      if (tomados.has(datos.correlativo)) throw colision();
      tomados.add(datos.correlativo);
      creados.push(datos);
      return datos;
    },
  };
}

const DIA = diaLima(new Date("2026-08-25T09:00:00-05:00"));
const construir = (correlativo: number) => ({
  nombreArchivo: `20609242753-RA-20260825-${correlativo}`,
  xmlFirmado: `<VoidedDocuments><ID>RA-20260825-${correlativo}</ID></VoidedDocuments>`,
});

describe("día peruano", () => {
  it("las 21:00 de Lima siguen siendo ese día, no el siguiente", () => {
    const tarde = new Date("2026-08-25T21:00:00-05:00");
    expect(tarde.toISOString().slice(0, 10)).toBe("2026-08-26");
    expect(diaLima(tarde).toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("normaliza a medianoche UTC, que es como se guarda una columna Date", () => {
    expect(diaLima(new Date("2026-08-25T09:00:00-05:00")).toISOString())
      .toBe("2026-08-25T00:00:00.000Z");
  });
});

describe("reserva del correlativo", () => {
  it("empieza en 1 cuando el día está vacío", async () => {
    const repo = repoFalso();
    const ticket = await crearTicketConCorrelativo(repo, "RA", DIA, construir);
    expect(ticket.correlativo).toBe(1);
  });

  it("continúa desde el último del día", async () => {
    const repo = repoFalso([1, 2]);
    const ticket = await crearTicketConCorrelativo(repo, "RA", DIA, construir);
    expect(ticket.correlativo).toBe(3);
  });

  it("ante una carrera vuelve a construir y RE-FIRMAR con el número nuevo", async () => {
    // Es lo que distingue esto de un contador normal: el correlativo va dentro
    // del XML firmado, así que reintentar sin re-firmar dejaría un documento
    // que dice RA-...-1 guardado como RA-...-2.
    const repo = repoFalso();
    const construirEspiado = vi.fn(construir);

    // Otro proceso se lleva el 1 justo entre la lectura y el insert.
    const crearOriginal = repo.crear.bind(repo);
    let primera = true;
    repo.crear = async (datos) => {
      if (primera) {
        primera = false;
        throw colision();
      }
      return crearOriginal(datos);
    };

    const ticket = await crearTicketConCorrelativo(repo, "RA", DIA, construirEspiado);

    expect(ticket.correlativo).toBe(1);
    expect(construirEspiado).toHaveBeenCalledTimes(2);
    expect(ticket.xmlFirmado).toContain("RA-20260825-1");
  });

  it("el XML guardado corresponde al correlativo que quedó, no al primero que intentó", async () => {
    const repo = repoFalso([1]);
    const ticket = await crearTicketConCorrelativo(repo, "RA", DIA, construir);

    expect(ticket.correlativo).toBe(2);
    expect(ticket.xmlFirmado).toContain("RA-20260825-2");
    expect(ticket.nombreArchivo).toBe("20609242753-RA-20260825-2");
  });

  it("se rinde con un mensaje claro si la carrera no cede", async () => {
    const repo = repoFalso();
    repo.crear = async () => {
      throw colision();
    };

    await expect(crearTicketConCorrelativo(repo, "RA", DIA, construir)).rejects.toThrow(
      /otro proceso creando bajas/,
    );
  });

  it("no se traga un error que no sea de correlativo", async () => {
    const repo = repoFalso();
    repo.crear = async () => {
      throw new Error("la base se cayó");
    };

    await expect(crearTicketConCorrelativo(repo, "RA", DIA, construir)).rejects.toThrow(
      /la base se cayó/,
    );
  });
});

describe("esColisionDeCorrelativo", () => {
  it("reconoce el P2002 de Prisma y nada más", () => {
    expect(esColisionDeCorrelativo(colision())).toBe(true);
    expect(esColisionDeCorrelativo(new Error("otra cosa"))).toBe(false);
    expect(esColisionDeCorrelativo({ code: "P2025" })).toBe(false);
    expect(esColisionDeCorrelativo(null)).toBe(false);
    expect(esColisionDeCorrelativo("P2002")).toBe(false);
  });
});
