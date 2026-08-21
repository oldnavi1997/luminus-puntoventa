import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processQueue } from "@/lib/queue";
import { procesarTickets } from "@/lib/sunat/tickets";

/**
 * Drena la cola de comprobantes pendientes.
 *
 * Admite dos llamadores:
 *   - un cron externo, con `Authorization: Bearer <QUEUE_SECRET>`
 *   - un ADMIN desde la interfaz, para forzar el drenado sin esperar
 *
 * Sin el token no hay forma de que un cron lo invoque, que es justamente por lo
 * que la cola nunca llegó a drenarse: el endpoint sólo aceptaba sesión.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.QUEUE_SECRET;
  const cabecera = req.headers.get("authorization");
  const esCron = !!secreto && cabecera === `Bearer ${secreto}`;

  if (!esCron) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }
  }

  // Las dos colas del sistema: los comprobantes que no llegaron a enviarse y
  // las bajas que esperan respuesta de SUNAT. Se drenan juntas para que forzar
  // a mano tenga el mismo efecto que una pasada del intervalo.
  const cola = await processQueue();
  const tickets = await procesarTickets();
  return NextResponse.json({ cola, tickets });
}

/** Estado de la cola, para poder mirarla sin drenarla. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/prisma");
  const [total, listos, agotados, ticketsPendientes, ticketsConProblema] = await Promise.all([
    prisma.documentQueue.count(),
    prisma.documentQueue.count({ where: { nextRetryAt: { lte: new Date() }, attempts: { lt: 10 } } }),
    prisma.documentQueue.count({ where: { attempts: { gte: 10 } } }),
    prisma.sunatTicket.count({ where: { estado: "ENVIADO" } }),
    prisma.sunatTicket.count({ where: { estado: "ERROR_ENVIO" } }),
  ]);

  return NextResponse.json({
    cola: { total, listos, agotados },
    tickets: { pendientes: ticketsPendientes, conProblema: ticketsConProblema },
  });
}
