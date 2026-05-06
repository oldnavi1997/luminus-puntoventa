import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PosTerminal } from "@/components/pos/PosTerminal";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const posSession = session.user.posSessionId
    ? await prisma.posSession.findUnique({
        where: { id: session.user.posSessionId },
        select: { openedAt: true },
      })
    : null;

  return (
    <PosTerminal
      posSessionId={session.user.posSessionId!}
      cashierId={session.user.id}
      sessionOpenedAt={posSession?.openedAt.toISOString()}
      isAdmin={session.user.role === "ADMIN"}
    />
  );
}
