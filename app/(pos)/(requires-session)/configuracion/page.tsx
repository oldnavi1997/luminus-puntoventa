import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { UsuariosView } from "@/components/admin/UsuariosView";
import { SesionesActivasView } from "@/components/admin/SesionesActivasView";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/pos");

  const sesionesAbiertas = await prisma.posSession.findMany({
    where: { status: "OPEN" },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { openedAt: "asc" },
  });

  const sesiones = sesionesAbiertas.map((s) => ({
    id: s.id,
    openedAt: s.openedAt.toISOString(),
    openingBalance: Number(s.openingBalance),
    totalEfectivo: Number(s.totalEfectivo),
    totalVentas: Number(s.totalVentas),
    countVentas: s.countVentas,
    user: s.user,
  }));

  return (
    <div className="p-6 space-y-10 max-w-5xl mx-auto">
      <UsuariosView currentUserId={session.user.id} />
      <SesionesActivasView sesiones={sesiones} />
    </div>
  );
}
