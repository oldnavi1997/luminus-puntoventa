import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AperturaForm } from "@/components/sesion/AperturaForm";
import { CierreResumen } from "@/components/sesion/CierreResumen";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SesionPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const activeSession = session.user.posSessionId
    ? await prisma.posSession.findFirst({
        where: { id: session.user.posSessionId, status: "OPEN" },
        include: {
          _count: { select: { documents: true } },
        },
      })
    : null;

  // Saldo sugerido para apertura: override de retiro admin, o efectivo esperado de última sesión
  let suggestedBalance = 0;
  if (!activeSession) {
    const config = await prisma.cajaConfig.findUnique({ where: { id: "tienda" } });
    if (config?.nextOpeningOverride != null) {
      suggestedBalance = Number(config.nextOpeningOverride);
    } else {
      const lastSession = await prisma.posSession.findFirst({
        where: { status: "CLOSED" },
        orderBy: { closedAt: "desc" },
        select: { openingBalance: true, totalEfectivo: true },
      });
      suggestedBalance = lastSession
        ? Number(lastSession.openingBalance) + Number(lastSession.totalEfectivo)
        : 0;
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {activeSession ? (
          <CierreResumen session={activeSession} userId={session.user.id} />
        ) : (
          <AperturaForm userId={session.user.id} cashierName={session.user.name ?? session.user.email} suggestedBalance={suggestedBalance} isAdmin={session.user.role === "ADMIN"} />
        )}
      </div>
    </div>
  );
}
