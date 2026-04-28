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

  // Saldo sugerido para apertura: override de retiro admin, o efectivo real en caja (fondo + ventas desde último retiro)
  let suggestedBalance = 0;
  if (!activeSession) {
    const config = await prisma.cajaConfig.findUnique({ where: { id: "tienda" } });
    if (config?.nextOpeningOverride != null) {
      suggestedBalance = Number(config.nextOpeningOverride);
    } else {
      const retiroAt = config?.lastRetiroAt ?? null;
      const fondoAnterior = Number(config?.lastRetiroFondo ?? 0);
      const [ventasCompletas, ventasPartial, ventasMixto] = await Promise.all([
        prisma.saleDocument.aggregate({
          where: {
            location: "TIENDA",
            paymentMethod: "EFECTIVO",
            status: { notIn: ["VOIDED", "VOID_PENDING", "PARTIAL"] },
            ...(retiroAt ? { createdAt: { gt: retiroAt } } : {}),
          },
          _sum: { total: true },
        }),
        prisma.saleDocument.aggregate({
          where: {
            location: "TIENDA",
            paymentMethod: "EFECTIVO",
            status: "PARTIAL",
            ...(retiroAt ? { createdAt: { gt: retiroAt } } : {}),
          },
          _sum: { montoAdelanto: true },
        }),
        prisma.saleDocument.aggregate({
          where: {
            location: "TIENDA",
            paymentMethod: "MIXTO",
            status: { notIn: ["VOIDED", "VOID_PENDING"] },
            ...(retiroAt ? { createdAt: { gt: retiroAt } } : {}),
          },
          _sum: { montoEfectivo: true },
        }),
      ]);
      const efectivoVentas = Number(ventasCompletas._sum.total ?? 0)
                           + Number(ventasPartial._sum.montoAdelanto ?? 0)
                           + Number(ventasMixto._sum.montoEfectivo ?? 0);
      suggestedBalance = fondoAnterior + efectivoVentas;
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
