import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { PendientesView } from "@/components/ventas/PendientesView";

export const dynamic = "force-dynamic";

export default async function PendientesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PendientesView posSessionId={session.user.posSessionId ?? ""} />;
}
