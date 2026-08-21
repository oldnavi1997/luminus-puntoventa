import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AnuladosView } from "@/components/anulados/AnuladosView";

export const dynamic = "force-dynamic";

export default async function AnuladosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // Anular es cosa del administrador, y el historial de anulaciones también.
  if (session.user.role !== "ADMIN") redirect("/pos");

  return <AnuladosView />;
}
